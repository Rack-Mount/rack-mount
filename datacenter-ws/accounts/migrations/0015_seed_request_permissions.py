"""
Seed request permissions for existing roles:

  admin  → can_view_requests + can_create_requests + can_manage_requests
  editor → can_view_requests + can_create_requests + can_manage_requests
  viewer → can_view_requests + can_create_requests
"""
from django.db import migrations


def seed_request_permissions(apps, schema_editor):
    Role = apps.get_model('accounts', 'Role')

    admin = Role.objects.filter(name='admin').first()
    editor = Role.objects.filter(name='editor').first()
    viewer = Role.objects.filter(name='viewer').first()

    if admin:
        admin.can_view_requests = True
        admin.can_create_requests = True
        admin.can_manage_requests = True
        admin.save()

    if editor:
        editor.can_view_requests = True
        editor.can_create_requests = True
        editor.can_manage_requests = True
        editor.save()

    if viewer:
        viewer.can_view_requests = True
        viewer.can_create_requests = True
        viewer.save()


def reverse_seed(apps, schema_editor):
    Role = apps.get_model('accounts', 'Role')
    Role.objects.filter(name__in=['admin', 'editor', 'viewer']).update(
        can_view_requests=False,
        can_create_requests=False,
        can_manage_requests=False,
    )


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0014_add_request_permissions'),
    ]

    operations = [
        migrations.RunPython(seed_request_permissions, reverse_code=reverse_seed),
    ]
