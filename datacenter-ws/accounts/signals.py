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
                'can_view_assets': True,
                'can_create_assets': False,
                'can_edit_assets': False,
                'can_delete_assets': False,
                'can_import_assets': False,
                'can_export_assets': False,
                'can_clone_assets': False,
                'can_view_catalog': True,
                'can_create_catalog': False,
                'can_edit_catalog': False,
                'can_delete_catalog': False,
                'can_import_catalog': False,
                'can_view_infrastructure': True,
                'can_create_racks': False,
                'can_edit_racks': False,
                'can_delete_racks': False,
                'can_edit_map': False,
                'can_manage_users': False,
                # Model training permissions (must match migration 0008 defaults)
                'can_provide_port_training': False,
                'can_provide_port_corrections': False,
                'can_view_model_training_status': True,
            },
        )
        UserProfile.objects.get_or_create(
            user=instance, defaults={'role': default_role})
