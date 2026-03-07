"""
Signal handler: automatically create / update UserProfile when a User is saved.
The profile is assigned the 'viewer' role by default.
"""
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender=User)
def create_or_update_user_profile(sender, instance, created, **kwargs):
    # local import avoids circular deps
    from accounts.models import Role, UserProfile

    if created:
        default_role, _ = Role.objects.get_or_create(
            name=Role.Name.VIEWER,
            defaults={
                'can_create': False,
                'can_edit': False,
                'can_delete': False,
                'can_import_export': False,
                'can_access_assets': True,
                'can_access_catalog': True,
                'can_manage_users': False,
            },
        )
        UserProfile.objects.get_or_create(
            user=instance, defaults={'role': default_role})
