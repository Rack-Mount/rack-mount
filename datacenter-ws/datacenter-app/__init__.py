# Make the Celery app available so Django's @shared_task decorator works.
from .celery import app as celery_app  # noqa: F401

__all__ = ('celery_app',)
