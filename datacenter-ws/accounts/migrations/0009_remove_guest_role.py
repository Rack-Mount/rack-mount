"""
Data migration: remove the guest role.

- Reassigns any UserProfile with role=guest to the viewer role.
- Deletes the guest Role record.
- Removes 'guest' from the Role.name field choices.
"""
from django.db import migrations, models


def remove_guest_role(apps, schema_editor):
    Role = apps.get_model('accounts', 'Role')
    UserProfile = apps.get_model('accounts', 'UserProfile')

    guest_role = Role.objects.filter(name='guest').first()
    if guest_role is None:
        return

    viewer_role = Role.objects.filter(name='viewer').first()
    if viewer_role:
        UserProfile.objects.filter(role=guest_role).update(role=viewer_role)

    guest_role.delete()


def restore_guest_role(apps, schema_editor):
    Role = apps.get_model('accounts', 'Role')
    Role.objects.get_or_create(
        name='guest',
        defaults={
            'can_view_assets': False,
            'can_create_assets': False,
            'can_edit_assets': False,
            'can_delete_assets': False,
            'can_import_assets': False,
            'can_export_assets': False,
            'can_clone_assets': False,
            'can_view_catalog': False,
            'can_create_catalog': False,
            'can_edit_catalog': False,
            'can_delete_catalog': False,
            'can_import_catalog': False,
            'can_view_infrastructure': False,
            'can_create_racks': False,
            'can_edit_racks': False,
            'can_delete_racks': False,
            'can_edit_map': False,
            'can_manage_users': False,
            'can_provide_port_training': False,
            'can_provide_port_corrections': False,
            'can_view_model_training_status': False,
        },
    )


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0008_role_model_training_defaults'),
    ]

    operations = [
        migrations.RunPython(remove_guest_role, reverse_code=restore_guest_role),
        migrations.AlterField(
            model_name='role',
            name='name',
            field=models.CharField(
                choices=[
                    ('admin', 'Admin'),
                    ('editor', 'Editor'),
                    ('viewer', 'Viewer'),
                ],
                max_length=20,
                unique=True,
                verbose_name='Name',
            ),
        ),
    ]
