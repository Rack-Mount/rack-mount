import hashlib
import os
import pathlib

from django.conf import settings
from django.http import FileResponse, Http404, HttpResponse
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema
from PIL import Image

from asset.utils.signed_url import verify_signed_url


# Allowed resize widths to prevent abuse
ALLOWED_WIDTHS = {32, 48, 64, 80, 120, 200,
                  320, 480, 640, 800, 1024, 1280, 1600, 1920}
CACHE_SUBDIR = 'cache'


@extend_schema(exclude=True)
class ImageView(APIView):
    """
    Serve media images with optional on-the-fly resizing.

    Public images: /files/public/* — no authentication required
    Private images: /files/private/* — requires authentication + valid signature

    Signature format: /files/private/<filename>?sign=<signature>&expire=<timestamp>
    """

    # Allow public access; check per-file in get()
    permission_classes = [AllowAny]
    throttle_classes = []  # Static file serving — no rate limit

    def get(self, request, filename):
        # Security: reject tainted input before it reaches any path expression
        if not self._is_safe_relpath(filename):
            raise Http404

        media_root = os.path.realpath(settings.MEDIA_ROOT)
        cache_root = os.path.realpath(os.path.join(media_root, CACHE_SUBDIR))
        # realpath resolves all symlinks → prevents symlink-escape attacks
        original_path = os.path.realpath(os.path.join(media_root, filename))

        # Secondary guard: disallow path traversal outside MEDIA_ROOT
        if not original_path.startswith(media_root + os.sep):
            raise Http404

        if not os.path.isfile(original_path):
            raise Http404

        # ─── Private File Access Control ─────────────────────────────────────
        # Check if file is in private subdirectory; if so, validate signature
        private_subdir = getattr(settings, 'PRIVATE_MEDIA_SUBDIR', 'private')
        if filename.startswith(private_subdir + '/'):
            # Private file: require authentication + valid signature
            if not request.user or not request.user.is_authenticated:
                return Response(
                    {'detail': 'Authentication required for private media'},
                    status=401
                )

            # Verify signed URL
            signature = request.GET.get('sign')
            expire_ts_str = request.GET.get('expire')

            if not signature or not expire_ts_str:
                return Response(
                    {'detail': 'Missing signature parameters'},
                    status=403
                )

            is_valid, error_msg = verify_signed_url(
                filename, signature, expire_ts_str)
            if not is_valid:
                return Response(
                    {'detail': f'Invalid or expired signature: {error_msg}'},
                    status=403
                )
            # ✓ Signature validated; proceed to serve file
        # ───────────────────────────────────────────────────────────────────────

        width_param = request.GET.get('w')
        if width_param:
            try:
                requested_w = int(width_param)
            except (ValueError, TypeError):
                requested_w = None
        else:
            requested_w = None

        if requested_w:
            # Snap to nearest allowed width ≤ requested (or smallest allowed)
            width = max(
                (w for w in ALLOWED_WIDTHS if w <= requested_w),
                default=min(ALLOWED_WIDTHS),
            )
            return self._serve_resized(original_path, media_root, filename, width)

        return self._serve_file(original_path)

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _serve_file(self, path):
        f = open(path, 'rb')
        content_type = self._content_type(path)
        response = FileResponse(f, content_type=content_type)
        response['Cache-Control'] = 'public, max-age=31536000, immutable'
        return response

    def _serve_resized(self, original_path, media_root, filename, width):
        # Build a dedicated cache root under MEDIA_ROOT and normalise
        cache_root = os.path.realpath(os.path.join(media_root, CACHE_SUBDIR))
        cache_rel = os.path.join(f'w{width}', filename)
        cache_path = os.path.realpath(os.path.join(cache_root, cache_rel))

        # Security: ensure cache_path stays within the cache_root directory
        if not cache_path.startswith(cache_root + os.sep):
            raise Http404

        if not os.path.isfile(cache_path):
            os.makedirs(os.path.dirname(cache_path), exist_ok=True)
            try:
                with Image.open(original_path) as img:
                    orig_w, orig_h = img.size
                    if orig_w <= width:
                        # Already smaller — serve original, no point caching
                        return self._serve_file(original_path)
                    ratio = width / orig_w
                    new_h = max(1, int(orig_h * ratio))
                    resized = img.resize(
                        (width, new_h), Image.Resampling.LANCZOS)

                    is_jpeg = original_path.lower().endswith(('.jpg', '.jpeg'))
                    has_alpha = resized.mode in ('RGBA', 'LA', 'PA')

                    if is_jpeg or (not has_alpha):
                        # JPEG: high quality, no chroma subsampling
                        if resized.mode != 'RGB':
                            resized = resized.convert('RGB')
                        fmt = 'JPEG'
                        save_kwargs = {
                            'quality': 92,
                            'subsampling': 0,  # 4:4:4 — full chroma, sharper colours
                            'optimize': True,
                        }
                    else:
                        # PNG with transparency — keep lossless
                        fmt = 'PNG'
                        save_kwargs = {'optimize': True}

                    resized.save(cache_path, format=fmt, **save_kwargs)
            except Exception:
                # If anything goes wrong fall back to original
                return self._serve_file(original_path)

        return self._serve_file(cache_path)

    @staticmethod
    def _is_safe_relpath(relpath: str) -> bool:
        """Return True only if *relpath* is a safe relative path with no traversal."""
        if not relpath or '\x00' in relpath:
            return False
        # Reject absolute paths (os.path.join silently discards the base for them)
        if os.path.isabs(relpath):
            return False
        # Reject any '..' or '.' component that could escape the base directory
        parts = pathlib.PurePosixPath(relpath).parts
        return not any(part in ('..', '.') for part in parts)

    @staticmethod
    def _content_type(path):
        ext = path.lower().rsplit('.', 1)[-1]
        mapping = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'svg': 'image/svg+xml',
        }
        return mapping.get(ext, 'application/octet-stream')
