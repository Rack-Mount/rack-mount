# Make the Celery app available so Django's @shared_task decorator works.
from .celery_app import app as celery_app  # noqa: F401

__all__ = ('celery_app',)
