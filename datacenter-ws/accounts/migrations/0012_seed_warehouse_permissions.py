"""
Data migration: set default warehouse permissions per role.
- ADMIN:  can_view_warehouse=True,  can_manage_warehouse=True
- EDITOR: can_view_warehouse=True,  can_manage_warehouse=True
- VIEWER: can_view_warehouse=True,  can_manage_warehouse=False
"""
from django.db import migrations


def set_warehouse_permissions(apps, schema_editor):
    Role = apps.get_model('accounts', 'Role')

    admin = Role.objects.filter(name='admin').first()
    if admin:
        admin.can_view_warehouse = True
        admin.can_manage_warehouse = True
        admin.save()

    editor = Role.objects.filter(name='editor').first()
    if editor:
        editor.can_view_warehouse = True
        editor.can_manage_warehouse = True
        editor.save()

    viewer = Role.objects.filter(name='viewer').first()
    if viewer:
        viewer.can_view_warehouse = True
        viewer.can_manage_warehouse = False
        viewer.save()


def reverse_warehouse_permissions(apps, schema_editor):
    Role = apps.get_model('accounts', 'Role')
    Role.objects.all().update(can_view_warehouse=False, can_manage_warehouse=False)


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0011_add_warehouse_permissions'),
    ]

    operations = [
        migrations.RunPython(
            set_warehouse_permissions,
            reverse_code=reverse_warehouse_permissions,
        ),
    ]
