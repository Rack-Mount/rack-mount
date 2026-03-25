from django.db import models
from django.contrib.auth.models import User
from django.utils.translation import gettext_lazy as _


class Role(models.Model):
    """
    Predefined roles with associated permission flags.
    Rows are seeded by a data migration and should not be created manually.
    """

    class Name(models.TextChoices):
        ADMIN = 'admin', _('Admin')
        EDITOR = 'editor', _('Editor')
        VIEWER = 'viewer', _('Viewer')

    name = models.CharField(
        max_length=20,
        choices=Name.choices,
        unique=True,
        verbose_name=_('Name'),
    )

    # ── Assets permissions ────────────────────────────────────────────────
    can_view_assets = models.BooleanField(
        default=False, verbose_name=_('Can view assets'))
    can_create_assets = models.BooleanField(
        default=False, verbose_name=_('Can create assets'))
    can_edit_assets = models.BooleanField(
        default=False, verbose_name=_('Can edit assets'))
    can_delete_assets = models.BooleanField(
        default=False, verbose_name=_('Can delete assets'))
    can_import_assets = models.BooleanField(
        default=False, verbose_name=_('Can import assets'))
    can_export_assets = models.BooleanField(
        default=False, verbose_name=_('Can export assets'))
    can_clone_assets = models.BooleanField(
        default=False, verbose_name=_('Can clone assets'))

    # ── Catalog permissions (vendors, models, components) ─────────────────
    can_view_catalog = models.BooleanField(
        default=False, verbose_name=_('Can view catalog'))
    can_create_catalog = models.BooleanField(
        default=False, verbose_name=_('Can create catalog entries'))
    can_edit_catalog = models.BooleanField(
        default=False, verbose_name=_('Can edit catalog entries'))
    can_delete_catalog = models.BooleanField(
        default=False, verbose_name=_('Can delete catalog entries'))
    can_import_catalog = models.BooleanField(
        default=False, verbose_name=_('Can import catalog'))

    # ── Infrastructure permissions (racks, map, locations) ────────────────
    can_view_infrastructure = models.BooleanField(
        default=False, verbose_name=_('Can view infrastructure (racks, rooms, map)'))
    can_create_racks = models.BooleanField(
        default=False, verbose_name=_('Can create racks'))
    can_edit_racks = models.BooleanField(
        default=False, verbose_name=_('Can edit racks and rack units'))
    can_delete_racks = models.BooleanField(
        default=False, verbose_name=_('Can delete racks'))
    can_edit_map = models.BooleanField(
        default=False, verbose_name=_('Can edit floor plans'))

    # ── Admin permissions ─────────────────────────────────────────────────
    can_manage_users = models.BooleanField(
        default=False, verbose_name=_('Can manage users'))

    # ── Model training permissions (YOLO port detection) ──────────────────
    can_provide_port_training = models.BooleanField(
        default=False,
        verbose_name=_('Can provide port training data (annotations)'),
        help_text=_(
            'Allows users to submit labeled port images for YOLO model training')
    )
    can_provide_port_corrections = models.BooleanField(
        default=False,
        verbose_name=_('Can provide port corrections'),
        help_text=_(
            'Allows users to suggest corrections for misclassified ports (triggering retraining)')
    )
    can_view_model_training_status = models.BooleanField(
        default=False,
        verbose_name=_('Can view model training status'),
        help_text=_(
            'Allows users to monitor YOLO training progress and validation metrics')
    )

    class Meta:
        verbose_name = _('Role')
        verbose_name_plural = _('Roles')
        ordering = ['name']

    def __str__(self):
        return self.get_name_display()


class UserProfile(models.Model):
    """
    Extends the built-in Django User with a role and user preferences.
    Created automatically via a post_save signal on User; defaults to the Viewer role.
    """

    class MeasurementSystem(models.TextChoices):
        AUTO = 'auto', _('Auto')
        METRIC = 'metric', _('Metric')
        IMPERIAL = 'imperial', _('Imperial')

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='profile',
        verbose_name=_('User'),
    )
    role = models.ForeignKey(
        Role,
        on_delete=models.PROTECT,
        related_name='user_profiles',
        verbose_name=_('Role'),
    )
    measurement_system = models.CharField(
        max_length=10,
        choices=MeasurementSystem.choices,
        default=MeasurementSystem.AUTO,
        verbose_name=_('Measurement System'),
    )

    class Meta:
        verbose_name = _('User Profile')
        verbose_name_plural = _('User Profiles')

    def __str__(self):
        return f'{self.user.username} ({self.role})'


class SecurityAuditLog(models.Model):
    """
    Tracks all security-sensitive operations: port training, corrections, model updates.
    Used for compliance, debugging, and detecting suspicious activity patterns.
    """

    class Action(models.TextChoices):
        PORT_ANNOTATE = 'port_annotate', _('Port annotation submitted')
        PORT_CORRECTION = 'port_correction', _('Port correction submitted')
        MODEL_RETRAIN = 'model_retrain', _('Model retraining triggered')
        MODEL_UPDATE = 'model_update', _('Model weights updated')
        LOGOUT = 'logout', _('User logged out')
        LOGIN_FAILED = 'login_failed', _('Failed login attempt')

    user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='security_audit_logs',
        verbose_name=_('User'),
    )
    action = models.CharField(
        max_length=20,
        choices=Action.choices,
        verbose_name=_('Action'),
        db_index=True,
    )
    resource_type = models.CharField(
        max_length=50,
        blank=True,
        verbose_name=_('Resource Type (e.g. port, model)'),
    )
    resource_id = models.CharField(
        max_length=255,
        blank=True,
        verbose_name=_('Resource ID (e.g. image filename)'),
    )
    delta_data = models.JSONField(
        default=dict,
        blank=True,
        verbose_name=_('Change data (JSON)'),
        help_text=_('For corrections: {old_label, new_label, position}'),
    )
    ip_address = models.GenericIPAddressField(
        null=True,
        blank=True,
        verbose_name=_('Client IP'),
    )
    timestamp = models.DateTimeField(
        auto_now_add=True,
        verbose_name=_('Timestamp'),
        db_index=True,
    )

    class Meta:
        verbose_name = _('Security Audit Log')
        verbose_name_plural = _('Security Audit Logs')
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['user', 'timestamp']),
            models.Index(fields=['action', 'timestamp']),
        ]

    def __str__(self):
        return f'{self.get_action_display()} by {self.user} at {self.timestamp}'
