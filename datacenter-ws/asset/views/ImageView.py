import hashlib
import os

from django.conf import settings
from django.http import FileResponse, Http404, HttpResponse
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from drf_spectacular.utils import extend_schema
from PIL import Image


# Allowed resize widths to prevent abuse
ALLOWED_WIDTHS = {32, 48, 64, 80, 120, 200,
                  320, 480, 640, 800, 1024, 1280, 1600, 1920}
CACHE_SUBDIR = 'cache'


@extend_schema(exclude=True)
class ImageView(APIView):
    """
    Serve media images with optional on-the-fly resizing.
    Public endpoint — no authentication required.
    """

    permission_classes = [AllowAny]
    throttle_classes = []  # Static file serving — no rate limit

    def get(self, request, filename):
        media_root = os.path.realpath(settings.MEDIA_ROOT)
        original_path = os.path.realpath(os.path.join(media_root, filename))

        # Security: disallow path traversal outside MEDIA_ROOT
        if os.path.commonpath([media_root, original_path]) != media_root:
            raise Http404

        if not os.path.isfile(original_path):
            raise Http404

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
        cache_root = os.path.join(os.path.realpath(media_root), CACHE_SUBDIR)
        cache_path = os.path.realpath(os.path.join(
            cache_root, f'w{width}', filename,
        ))

        # Security: disallow path traversal outside cache directory
        if os.path.commonpath([cache_root, cache_path]) != cache_root:
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
