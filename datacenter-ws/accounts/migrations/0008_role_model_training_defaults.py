"""
Data migration: set default values for new model training permission flags.
- ADMIN: can_provide_port_training=True, can_provide_port_corrections=True, can_view_model_training_status=True
- EDITOR: can_provide_port_training=True, can_provide_port_corrections=False, can_view_model_training_status=True
- VIEWER: can_provide_port_training=False, can_provide_port_corrections=False, can_view_model_training_status=True
- GUEST: all False (no training rights)
"""
from django.db import migrations


def set_model_training_permissions(apps, schema_editor):
    Role = apps.get_model('accounts', 'Role')

    # ADMIN: Full access
    admin_role = Role.objects.filter(name='admin').first()
    if admin_role:
        admin_role.can_provide_port_training = True
        admin_role.can_provide_port_corrections = True
        admin_role.can_view_model_training_status = True
        admin_role.save()

    # EDITOR: Can annotate but not correct (to avoid premature retraining)
    editor_role = Role.objects.filter(name='editor').first()
    if editor_role:
        editor_role.can_provide_port_training = True
        editor_role.can_provide_port_corrections = False
        editor_role.can_view_model_training_status = True
        editor_role.save()

    # VIEWER: Read-only - can view training status but not submit
    viewer_role = Role.objects.filter(name='viewer').first()
    if viewer_role:
        viewer_role.can_provide_port_training = False
        viewer_role.can_provide_port_corrections = False
        viewer_role.can_view_model_training_status = True
        viewer_role.save()

    # GUEST: No training rights
    guest_role = Role.objects.filter(name='guest').first()
    if guest_role:
        guest_role.can_provide_port_training = False
        guest_role.can_provide_port_corrections = False
        guest_role.can_view_model_training_status = False
        guest_role.save()


def reverse_model_training_permissions(apps, schema_editor):
    """Reset all model training permissions to False."""
    Role = apps.get_model('accounts', 'Role')
    Role.objects.all().update(
        can_provide_port_training=False,
        can_provide_port_corrections=False,
        can_view_model_training_status=False,
    )


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0007_add_model_training_permissions'),
    ]

    operations = [
        migrations.RunPython(
            set_model_training_permissions,
            reverse_code=reverse_model_training_permissions
        ),
    ]
