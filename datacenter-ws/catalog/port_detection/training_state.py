"""
Training state management for the continuous learning pipeline.

State is persisted in ``<MEDIA_ROOT>/models/training_state.json`` so that
correction counters survive server restarts.  All mutations go through
:func:`load_state` / :func:`save_state` under ``_state_lock`` to prevent
races between concurrent requests.
"""
import json
import logging
import os
import shutil
import threading
from datetime import datetime, timezone

from django.conf import settings

from .constants import CLASS_NAMES
from .security import get_media_root

logger = logging.getLogger(__name__)

_state_lock = threading.Lock()
# Separate lock so _background_train() doesn't hold _state_lock while training.
_training_lock = threading.Lock()


# ── State persistence ──────────────────────────────────────────────────────────

def state_path() -> str:
    """Absolute path to the training state JSON file."""
    return os.path.join(get_media_root(), 'models', 'training_state.json')


def load_state() -> dict:
    """
    Load the training state from disk.

    Returns a default dict if the file is missing or corrupt so that callers
    never have to handle a None return value.
    """
    path = state_path()
    if os.path.isfile(path):
        try:
            with open(path) as f:
                return json.load(f)
        except Exception:
            pass
    return {
        'last_training_iso': None,
        'corrections_since_last_train': 0,
        'total_corrections': 0,
        'is_training': False,
    }


def save_state(state: dict) -> None:
    """Atomically write *state* to the training state file."""
    path = state_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        json.dump(state, f, indent=2)


def minutes_since_last_train(state: dict) -> float:
    """
    Return the number of minutes elapsed since the last completed training run.

    Returns ``float('inf')`` if the state carries no training timestamp, so
    that the "enough time has passed" check is always true for a fresh install.
    """
    iso = state.get('last_training_iso')
    if not iso:
        return float('inf')
    try:
        last = datetime.fromisoformat(iso)
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        delta = datetime.now(tz=timezone.utc) - last
        return delta.total_seconds() / 60
    except Exception:
        return float('inf')


# ── Device selection ───────────────────────────────────────────────────────────

def best_device() -> str:
    """Return the best available compute device: 'cuda' > 'mps' > 'cpu'."""
    try:
        import torch
        if torch.cuda.is_available():
            return 'cuda'
        if getattr(torch.backends, 'mps', None) and torch.backends.mps.is_available():
            return 'mps'
    except Exception:
        pass
    return 'cpu'


# ── Data YAML ─────────────────────────────────────────────────────────────────

def write_data_yaml(training_dir: str) -> str:
    """
    Write (or overwrite) the YOLO data YAML for the training directory.

    Falls back to the training images directory as the validation set if no
    separate val split exists yet.

    Returns
    -------
    str
        Absolute path to the written ``data.yaml`` file.
    """
    import yaml as _yaml

    data_yaml = os.path.join(training_dir, 'data.yaml')
    train_img = os.path.join(training_dir, 'images', 'train')
    val_img = os.path.join(training_dir, 'images', 'val')
    if not os.path.isdir(val_img) or not os.listdir(val_img):
        val_img = train_img
    with open(data_yaml, 'w') as f:
        _yaml.dump(
            {
                'train': train_img,
                'val': val_img,
                'nc': len(CLASS_NAMES),
                'names': CLASS_NAMES,
            },
            f,
            default_flow_style=False,
        )
    return data_yaml


# ── Background training ────────────────────────────────────────────────────────

def run_background_train(data_yaml: str, models_dir: str) -> None:
    """
    Train YOLOv8n in a background thread and update state when done.

    Used as a Celery-unavailable fallback.  The function blocks until training
    is complete; run it in a daemon=False thread so the process does not exit
    before it finishes.
    """
    try:
        from ultralytics import YOLO
        device = best_device()
        model = YOLO('yolov8n.pt')
        model.train(
            data=data_yaml,
            epochs=100,
            patience=20,
            imgsz=640,
            optimizer='AdamW',
            cls=2.0,
            label_smoothing=0.1,
            mosaic=0.5,
            device=device,
            project=models_dir,
            name='port-yolo',
            exist_ok=True,
        )
        best = os.path.join(models_dir, 'port-yolo', 'weights', 'best.pt')
        dest = os.path.join(models_dir, 'port-yolo.pt')
        if os.path.isfile(best):
            shutil.copy2(best, dest)
    except Exception:
        pass
    finally:
        with _state_lock:
            state = load_state()
            state['is_training'] = False
            state['last_training_iso'] = datetime.now(tz=timezone.utc).isoformat()
            state['corrections_since_last_train'] = 0
            save_state(state)
