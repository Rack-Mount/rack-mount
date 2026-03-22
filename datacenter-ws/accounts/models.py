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
        GUEST = 'guest', _('Guest')

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
