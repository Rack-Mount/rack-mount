"""
Media-path security helpers shared by all port detection views.

Every endpoint that accepts a user-supplied ``image_path`` must call
:func:`is_safe_relpath` before constructing an absolute path.  This prevents
path-traversal attacks (e.g. ``../../etc/passwd``) and symlink-based escapes
from MEDIA_ROOT.
"""
import os

from django.conf import settings


def get_media_root() -> str:
    """Return the canonicalised MEDIA_ROOT path (resolves symlinks)."""
    return os.path.realpath(settings.MEDIA_ROOT)


def is_safe_relpath(relpath: str) -> bool:
    """
    Return True only if *relpath* cannot escape MEDIA_ROOT.

    Two complementary checks:
    1. Static pattern guard – rejects paths that start with '/' or contain
       '..', catching the most common traversal attempts before touching the
       filesystem.
    2. Realpath check – resolves symlinks and verifies the final absolute
       path still sits inside MEDIA_ROOT.  This stops symlink-based escapes
       that would pass the static check.
    """
    if not relpath or relpath.startswith('/') or '..' in relpath.split('/'):
        return False
    trusted = get_media_root()
    abs_path = os.path.realpath(os.path.join(trusted, relpath))
    return abs_path.startswith(trusted + os.sep)


def is_private_media_path(relpath: str) -> bool:
    """True if *relpath* lives inside the configured private media subdirectory."""
    private_subdir = getattr(settings, 'PRIVATE_MEDIA_SUBDIR', 'private')
    return relpath.startswith(private_subdir + '/')


def can_access_private_media(user) -> bool:
    """
    True if *user* holds the role capability required to read private media.

    Mirrors the permission check used when issuing signed private-media URLs,
    so access control stays consistent across endpoints.
    """
    if not user or not user.is_authenticated:
        return False
    try:
        role = user.profile.role
    except Exception:
        return False
    return bool(getattr(role, 'can_view_model_training_status', False))
