"""
Migration: replace generic permission flags with per-section granular ones.

Old flags removed:
  can_create, can_edit, can_delete, can_import_export,
  can_access_assets, can_access_catalog

New flags added (per section):
  Assets   : can_view_assets, can_create_assets, can_edit_assets,
             can_delete_assets, can_import_export_assets, can_clone_assets
  Catalog  : can_view_catalog, can_create_catalog, can_edit_catalog,
             can_delete_catalog, can_import_catalog
  Racks    : can_create_racks, can_edit_racks, can_delete_racks, can_edit_map
  (can_manage_users unchanged)
"""
from django.db import migrations, models

# Desired per-role values for the new flags
ROLE_PERMISSIONS = {
    'admin': {
        'can_view_assets': True,
        'can_create_assets': True,
        'can_edit_assets': True,
        'can_delete_assets': True,
        'can_import_export_assets': True,
        'can_clone_assets': True,
        'can_view_catalog': True,
        'can_create_catalog': True,
        'can_edit_catalog': True,
        'can_delete_catalog': True,
        'can_import_catalog': True,
        'can_create_racks': True,
        'can_edit_racks': True,
        'can_delete_racks': True,
        'can_edit_map': True,
    },
    'editor': {
        'can_view_assets': True,
        'can_create_assets': True,
        'can_edit_assets': True,
        'can_delete_assets': True,
        'can_import_export_assets': True,
        'can_clone_assets': True,
        'can_view_catalog': True,
        'can_create_catalog': True,
        'can_edit_catalog': True,
        'can_delete_catalog': True,
        'can_import_catalog': True,
        'can_create_racks': True,
        'can_edit_racks': True,
        'can_delete_racks': True,
        'can_edit_map': True,
    },
    'viewer': {
        'can_view_assets': True,
        'can_create_assets': False,
        'can_edit_assets': False,
        'can_delete_assets': False,
        'can_import_export_assets': False,
        'can_clone_assets': False,
        'can_view_catalog': True,
        'can_create_catalog': False,
        'can_edit_catalog': False,
        'can_delete_catalog': False,
        'can_import_catalog': False,
        'can_create_racks': False,
        'can_edit_racks': False,
        'can_delete_racks': False,
        'can_edit_map': False,
    },
    'guest': {
        'can_view_assets': False,
        'can_create_assets': False,
        'can_edit_assets': False,
        'can_delete_assets': False,
        'can_import_export_assets': False,
        'can_clone_assets': False,
        'can_view_catalog': False,
        'can_create_catalog': False,
        'can_edit_catalog': False,
        'can_delete_catalog': False,
        'can_import_catalog': False,
        'can_create_racks': False,
        'can_edit_racks': False,
        'can_delete_racks': False,
        'can_edit_map': False,
    },
}


def seed_new_flags(apps, schema_editor):
    Role = apps.get_model('accounts', 'Role')
    for role in Role.objects.all():
        perms = ROLE_PERMISSIONS.get(role.name, {})
        for field, value in perms.items():
            setattr(role, field, value)
        role.save()


def reverse_seed(apps, schema_editor):
    pass  # no meaningful reverse


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0002_seed_roles'),
    ]

    operations = [
        # ── 1. Add new fields ─────────────────────────────────────────────
        migrations.AddField('Role', 'can_view_assets',
                            models.BooleanField(default=False, verbose_name='Can view assets')),
        migrations.AddField('Role', 'can_create_assets',
                            models.BooleanField(default=False, verbose_name='Can create assets')),
        migrations.AddField('Role', 'can_edit_assets',
                            models.BooleanField(default=False, verbose_name='Can edit assets')),
        migrations.AddField('Role', 'can_delete_assets',
                            models.BooleanField(default=False, verbose_name='Can delete assets')),
        migrations.AddField('Role', 'can_import_export_assets',
                            models.BooleanField(default=False, verbose_name='Can import/export assets')),
        migrations.AddField('Role', 'can_clone_assets',
                            models.BooleanField(default=False, verbose_name='Can clone assets')),
        migrations.AddField('Role', 'can_view_catalog',
                            models.BooleanField(default=False, verbose_name='Can view catalog')),
        migrations.AddField('Role', 'can_create_catalog',
                            models.BooleanField(default=False, verbose_name='Can create catalog entries')),
        migrations.AddField('Role', 'can_edit_catalog',
                            models.BooleanField(default=False, verbose_name='Can edit catalog entries')),
        migrations.AddField('Role', 'can_delete_catalog',
                            models.BooleanField(default=False, verbose_name='Can delete catalog entries')),
        migrations.AddField('Role', 'can_import_catalog',
                            models.BooleanField(default=False, verbose_name='Can import catalog')),
        migrations.AddField('Role', 'can_create_racks',
                            models.BooleanField(default=False, verbose_name='Can create racks')),
        migrations.AddField('Role', 'can_edit_racks',
                            models.BooleanField(default=False, verbose_name='Can edit racks and rack units')),
        migrations.AddField('Role', 'can_delete_racks',
                            models.BooleanField(default=False, verbose_name='Can delete racks')),
        migrations.AddField('Role', 'can_edit_map',
                            models.BooleanField(default=False, verbose_name='Can edit floor plans')),

        # ── 2. Seed values based on role name ─────────────────────────────
        migrations.RunPython(seed_new_flags, reverse_seed),

        # ── 3. Remove old generic flags ───────────────────────────────────
        migrations.RemoveField('Role', 'can_create'),
        migrations.RemoveField('Role', 'can_edit'),
        migrations.RemoveField('Role', 'can_delete'),
        migrations.RemoveField('Role', 'can_import_export'),
        migrations.RemoveField('Role', 'can_access_assets'),
        migrations.RemoveField('Role', 'can_access_catalog'),
    ]
