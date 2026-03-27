"""
Celery application for datacenter-ws.

Worker startup:
    celery -A datacenter-app worker -l info

Flower monitoring (optional):
    celery -A datacenter-app flower
"""

import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'datacenter-app.settings')

app = Celery('datacenter')

# Read broker/backend config from Django settings (CELERY_* keys).
app.config_from_object('django.conf:settings', namespace='CELERY')

# Auto-discover tasks from all INSTALLED_APPS.
app.autodiscover_tasks()
