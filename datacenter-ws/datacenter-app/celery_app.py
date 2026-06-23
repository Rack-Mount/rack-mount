"""
Celery application for datacenter-ws.

Worker startup:
    celery -A datacenter-app worker -l info

Flower monitoring (optional):
    celery -A datacenter-app flower
"""

import multiprocessing
import os

from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'datacenter-app.settings')

# On macOS, Metal/MPS uses XPC services that do not survive fork().
# Switching to 'spawn' starts each worker process fresh so that
# MTLCompilerService is reachable and MPS training works without SIGABRT.
if multiprocessing.get_start_method(allow_none=True) is None:
    multiprocessing.set_start_method('spawn')

app = Celery('datacenter')

# Read broker/backend config from Django settings (CELERY_* keys).
app.config_from_object('django.conf:settings', namespace='CELERY')

# Auto-discover tasks from all INSTALLED_APPS.
app.autodiscover_tasks()
