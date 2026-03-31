"""
YOLO model cache – singleton shared across all detection paths.

Loading a YOLO model takes several seconds and allocates ~100 MB of GPU/CPU
memory.  This module ensures the weights are loaded **at most once per
process** and reloaded only when the weights file is replaced by a new
training run (detected via mtime).

Both the batch endpoint (PortAnalyzeView) and the click endpoint
(PortClickAnalyzeView) import :func:`get_yolo_model` from here, so the
model is never resident twice in the same worker process.
"""
import os
import threading

_yolo_model = None
_yolo_model_path: str | None = None
_yolo_model_mtime: float | None = None
_yolo_model_lock = threading.Lock()


def get_yolo_model(model_path: str | None = None):
    """
    Return a cached :class:`ultralytics.YOLO` instance.

    Parameters
    ----------
    model_path:
        Absolute path to the ``.pt`` weights file.  When *None*, the default
        location ``<MEDIA_ROOT>/models/port-yolo.pt`` is used.

    Returns
    -------
    ultralytics.YOLO | None
        The loaded model, or *None* if the file does not exist yet (e.g.
        first run before training has completed).
    """
    global _yolo_model, _yolo_model_path, _yolo_model_mtime

    if model_path is None:
        from .security import get_media_root
        model_path = os.path.join(get_media_root(), 'models', 'port-yolo.pt')

    if not os.path.isfile(model_path):
        return None

    try:
        mtime = os.path.getmtime(model_path)
    except OSError:
        return None

    with _yolo_model_lock:
        if (
            _yolo_model is None
            or _yolo_model_path != model_path
            or _yolo_model_mtime != mtime
        ):
            from ultralytics import YOLO
            _yolo_model = YOLO(model_path)
            _yolo_model_path = model_path
            _yolo_model_mtime = mtime
        return _yolo_model
