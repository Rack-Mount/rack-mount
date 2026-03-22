"""
Rate limiting (throttling) for YOLO training and inference endpoints.

Prevents model poisoning and inference spam via:
- Per-user throttles for training data submission
- Stricter per-IP throttles for inference-heavy endpoints
- Allows legitimate users while blocking abusive patterns
"""
from rest_framework.throttling import UserRateThrottle, AnonRateThrottle


class PortTrainingThrottle(UserRateThrottle):
    """
    Rate limit for port annotation submissions (YOLO training data).

    Prevents model poisoning via bulk malicious submissions.
    - Authenticated users: 10 annotations/hour (1-2 images at typical density)
    - Anonymous users: blocked (requires can_provide_port_training permission)

    Rationale:
    - Normal user workflow: 1-2 minutes to annotate a device (30 images/hour max realistic)
    - Attacker pattern: 100+ images/minute
    - Threshold: 10/hour catches sustained attacks while allowing legit users
    """
    scope = 'port_training'
    rate = '10/h'


class PortCorrectionThrottle(UserRateThrottle):
    """
    Rate limit for port correction submissions (can trigger retraining).

    Prevents retraining floods and feedback spam.
    - Authenticated users: 30 corrections/hour
    - Anonymous users: blocked (requires can_provide_port_corrections permission)

    Rationale:
    - Normal correction workflow: QA reviewing ~5-10 corrections/hour
    - Attacker pattern: 100+ corrections/minute to force continuous retraining
    - Threshold: 30/hour allows intensive review while blocking attacks
    - Retraining itself has MIN_CORRECTIONS/MIN_INTERVAL_MIN gates
    """
    scope = 'port_correction'
    rate = '30/h'


class PortAnalysisThrottle(UserRateThrottle):
    """
    Rate limit for port analysis/inference requests (YOLO detection).

    Prevents inference-spam attacks that could exhaust GPU resources.
    - Authenticated users: 100 analyses/hour (1-2 per second sustainable)
    - Anonymous users: blocked (requires IsAuthenticated)

    Rationale:
    - Normal workflow: Annotators analyze 1-2 images/minute (60-120/hour)
    - Attacker pattern: 1000+ inferences/minute on single GPU/CPU
    - Threshold: 100/hour allows normal usage
    - If user needs more: can batch-analyze via management command
    """
    scope = 'port_analysis'
    rate = '100/h'


class PortClickAnalysisThrottle(UserRateThrottle):
    """
    Rate limit for per-click port analysis (YOLO single-click detection).

    Prevents rapid-fire clicking attacks on inference endpoints.
    - Authenticated users: 200 clicks/hour (adjust for interactive use)
    - Anonymous users: blocked (requires IsAuthenticated)

    Rationale:
    - Normal click workflow: User analyzes ~60-90 click positions/hour
    - Attacker pattern: 500+ clicks/minute in automated loop
    - Threshold: 200/hour allows interactive exploration
    - Higher than PortAnalysisThrottle because clicks are lighter-weight
    """
    scope = 'port_click_analysis'
    rate = '200/h'


class ModelTrainingStatusThrottle(UserRateThrottle):
    """
    Rate limit for checking model training status.

    Lightweight endpoint; allows frequent polling for job completion.
    - Authenticated users: 1000 status checks/hour (1 per 3.6 seconds)
    - Anonymous users: blocked (requires can_view_model_training_status)

    Rationale:
    - Normal polling: UIs check status every 5-10 seconds (360-720/hour max)
    - Attacker pattern: 10000+ checks/hour in rapid loop
    - Threshold: 1000/hour is very permissive but catches spam
    """
    scope = 'model_training_status'
    rate = '1000/h'


# ── Anonymous user blockers ────────────────────────────────────────────────────
# These are not used directly but can be applied to enforce auth-only policies

class AnonPortTrainingBlocker(AnonRateThrottle):
    """Block anonymous users from training endpoints (requires permission)."""
    scope = 'anon_port_training'
    rate = '0/h'


class AnonPortCorrectionBlocker(AnonRateThrottle):
    """Block anonymous users from correction endpoints (requires permission)."""
    scope = 'anon_port_correction'
    rate = '0/h'
