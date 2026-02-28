import hashlib
import os

from django.conf import settings
from django.http import FileResponse, Http404, HttpResponse
from django.views import View
from PIL import Image


# Allowed resize widths to prevent abuse
ALLOWED_WIDTHS = {32, 48, 64, 80, 120, 200,
                  320, 480, 640, 800, 1024, 1280, 1600, 1920}
CACHE_SUBDIR = 'cache'


class ImageView(View):
    """
    Serve media images with optional on-the-fly resizing.

    URL:  GET /files/<path:filename>?w=<width>

    - If ``w`` is omitted the original file is served unchanged.
    - ``w`` must be one of the values in ALLOWED_WIDTHS; otherwise the nearest
      smaller allowed width is used (or the original if none fits).
    - Resized variants are cached on disk under
      MEDIA_ROOT/cache/w<width>/<original_path> so subsequent requests are
      served directly from cache with no Pillow processing.
    - Both original and cached responses carry a long-lived Cache-Control header
      so the browser caches them aggressively.
    """

    def get(self, request, filename):
        media_root = os.path.abspath(settings.MEDIA_ROOT)
        original_path = os.path.normpath(os.path.join(media_root, filename))

        # Security: disallow path traversal outside MEDIA_ROOT
        if not original_path.startswith(os.path.abspath(media_root)):
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
        cache_path = os.path.join(
            media_root, CACHE_SUBDIR, f'w{width}', filename,
        )

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
