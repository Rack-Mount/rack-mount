"""
Data migration: seed the four predefined roles with their permission flags.
"""
from django.db import migrations


ROLES = [
    {
        'name': 'admin',
        'can_create': True,
        'can_edit': True,
        'can_delete': True,
        'can_import_export': True,
        'can_access_assets': True,
        'can_access_catalog': True,
        'can_manage_users': True,
    },
    {
        'name': 'editor',
        'can_create': True,
        'can_edit': True,
        'can_delete': True,
        'can_import_export': True,
        'can_access_assets': True,
        'can_access_catalog': True,
        'can_manage_users': False,
    },
    {
        'name': 'viewer',
        'can_create': False,
        'can_edit': False,
        'can_delete': False,
        'can_import_export': False,
        'can_access_assets': True,
        'can_access_catalog': True,
        'can_manage_users': False,
    },
    {
        'name': 'guest',
        'can_create': False,
        'can_edit': False,
        'can_delete': False,
        'can_import_export': False,
        'can_access_assets': False,
        'can_access_catalog': False,
        'can_manage_users': False,
    },
]


def seed_roles(apps, schema_editor):
    Role = apps.get_model('accounts', 'Role')
    for role_data in ROLES:
        Role.objects.update_or_create(
            name=role_data['name'], defaults=role_data)


def unseed_roles(apps, schema_editor):
    Role = apps.get_model('accounts', 'Role')
    Role.objects.filter(name__in=[r['name'] for r in ROLES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_roles, reverse_code=unseed_roles),
    ]
