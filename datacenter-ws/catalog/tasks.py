"""
Celery tasks for the catalog app.

Tasks:
    retrain_yolo  — Train YOLOv8n on accumulated correction data.
                    Triggered by PortCorrectionView when correction thresholds
                    are reached. Runs in a Celery worker process, completely
                    off the Django request/response cycle.
"""

import json
import logging
import os
import shutil
from datetime import datetime, timezone

from celery import shared_task
from django.conf import settings

logger = logging.getLogger(__name__)


def _get_media_root() -> str:
    return os.path.realpath(settings.MEDIA_ROOT)


def _state_path() -> str:
    return os.path.join(_get_media_root(), 'models', 'training_state.json')


def _load_state() -> dict:
    path = _state_path()
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


def _save_state(state: dict) -> None:
    path = _state_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        json.dump(state, f, indent=2)


def _best_device() -> str:
    try:
        import torch
        if torch.cuda.is_available():
            return 'cuda'
        if getattr(torch.backends, 'mps', None) and torch.backends.mps.is_available():
            return 'mps'
    except Exception:
        pass
    return 'cpu'


@shared_task(
    bind=True,
    name='catalog.retrain_yolo',
    max_retries=0,          # no automatic retry — the training data hasn't changed
    ignore_result=True,     # result tracked in training_state.json, not Celery backend
)
def retrain_yolo(self, data_yaml: str, models_dir: str) -> None:
    """
    Train YOLOv8n on the accumulated correction dataset.

    Args:
        data_yaml:   Absolute path to the YOLO data.yaml file.
        models_dir:  Directory where the trained weights will be saved.

    Side effects:
        - Writes best.pt → models_dir/port-yolo.pt on success.
        - Updates training_state.json (is_training, last_training_iso,
          corrections_since_last_train) on completion.
    """
    logger.info('YOLO retraining started (task_id=%s)', self.request.id)
    try:
        from ultralytics import YOLO
        device = _best_device()
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
            logger.info('YOLO retraining complete — weights saved to %s', dest)
        else:
            logger.warning('YOLO retraining finished but best.pt not found at %s', best)
    except Exception:
        logger.exception('YOLO retraining failed')
    finally:
        state = _load_state()
        state['is_training'] = False
        state['last_training_iso'] = datetime.now(tz=timezone.utc).isoformat()
        state['corrections_since_last_train'] = 0
        _save_state(state)
