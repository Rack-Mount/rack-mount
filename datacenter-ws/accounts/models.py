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

    # ── Granular permission flags ─────────────────────────────────────────
    can_create = models.BooleanField(
        default=False, verbose_name=_('Can create'))
    can_edit = models.BooleanField(default=False, verbose_name=_('Can edit'))
    can_delete = models.BooleanField(
        default=False, verbose_name=_('Can delete'))
    can_import_export = models.BooleanField(
        default=False, verbose_name=_('Can import/export'))
    can_access_assets = models.BooleanField(
        default=False, verbose_name=_('Can access assets'))
    can_access_catalog = models.BooleanField(
        default=False, verbose_name=_('Can access catalog'))
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
    Extends the built-in Django User with a role. Created automatically
    via a post_save signal on User; defaults to the Viewer role.
    """
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

    class Meta:
        verbose_name = _('User Profile')
        verbose_name_plural = _('User Profiles')

    def __str__(self):
        return f'{self.user.username} ({self.role})'
