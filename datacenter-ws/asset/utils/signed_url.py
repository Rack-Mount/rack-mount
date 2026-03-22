"""
Signed URL generation and verification for private media files.

Provides time-limited, tamper-proof URLs for accessing private media files.
Format: /files/private/<filename>?sign=<signature>&expire=<timestamp>

Signature: HMAC-SHA256(secret, filename + expire)
"""
import hashlib
import hmac
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode, parse_qs
from typing import Optional, Tuple

from django.conf import settings


def generate_signed_url(
    filename: str,
    expiry_seconds: Optional[int] = None
) -> str:
    """
    Generate a signed URL for a private media file.

    Args:
        filename: Relative path to file within private media dir (e.g., 'training/image.jpg')
        expiry_seconds: Seconds until URL expires (default: SIGNED_URL_EXPIRY_SECONDS from settings)

    Returns:
        URL path with signature and expiry: /files/private/<filename>?sign=<sig>&expire=<ts>

    Example:
        >>> url = generate_signed_url('training/port_annotations.jpg')
        >>> url
        '/files/private/training/port_annotations.jpg?sign=abc123...&expire=1711234567'
    """
    if expiry_seconds is None:
        expiry_seconds = getattr(
            settings, 'SIGNED_URL_EXPIRY_SECONDS', 3*24*60*60)

    # Expiry timestamp (Unix time)
    expire_ts = int(time.time()) + expiry_seconds

    # Generate signature: HMAC-SHA256(secret, filename + expire)
    secret = getattr(settings, 'SIGNED_URL_SECRET', 'default-dev-key')
    message = f'{filename}:{expire_ts}'.encode()
    signature = hmac.new(
        secret.encode(),
        message,
        hashlib.sha256
    ).hexdigest()

    # Build signed URL
    base_path = f"/files/private/{filename}"
    params = {
        'sign': signature,
        'expire': str(expire_ts),
    }
    return base_path + '?' + urlencode(params)


def verify_signed_url(
    filename: str,
    signature: str,
    expire_ts_str: str
) -> Tuple[bool, Optional[str]]:
    """
    Verify a signed URL's signature and expiry.

    Args:
        filename: File path (same as in URL)
        signature: HMAC signature from URL parameter 'sign'
        expire_ts_str: Expiry timestamp from URL parameter 'expire'

    Returns:
        Tuple[is_valid, error_message]
        - is_valid (bool): True if signature is valid and not expired
        - error_message (str): Reason for failure (or None if valid)

    Example:
        >>> is_valid, error = verify_signed_url('training/image.jpg', 'abc123...', '1711234567')
        >>> if is_valid:
        ...     # serve file
        ... else:
        ...     # return 401 Unauthorized with error reason
    """
    # Parse expiry timestamp
    try:
        expire_ts = int(expire_ts_str)
    except (ValueError, TypeError):
        return False, "Invalid expiry timestamp format"

    # Check expiry (with 60-second clock skew tolerance)
    current_ts = int(time.time())
    if current_ts > expire_ts + 60:
        return False, f"URL signature expired at {datetime.fromtimestamp(expire_ts, tz=timezone.utc).isoformat()}"

    # Verify signature
    secret = getattr(settings, 'SIGNED_URL_SECRET', 'default-dev-key')
    message = f'{filename}:{expire_ts}'.encode()
    expected_signature = hmac.new(
        secret.encode(),
        message,
        hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(signature, expected_signature):
        return False, "Invalid signature - URL may have been tampered with"

    return True, None


def get_expiry_readable(expire_ts: int) -> str:
    """Convert Unix timestamp to human-readable format."""
    dt = datetime.fromtimestamp(expire_ts, tz=timezone.utc)
    return dt.strftime('%Y-%m-%d %H:%M:%S UTC')
