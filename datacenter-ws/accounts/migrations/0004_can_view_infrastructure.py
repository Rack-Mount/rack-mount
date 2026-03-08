"""
Migration: add can_view_infrastructure permission flag to Role.

Aligns the infrastructure section with assets and catalog, which already have
explicit can_view_* flags.  Previously, GET/HEAD/OPTIONS on infrastructure
endpoints was open to any authenticated user regardless of role.

Default seed values:
  admin   → True
  editor  → True
  viewer  → True   (viewers can browse racks and the room map)
  guest   → False
"""
from django.db import migrations, models

ROLE_VALUES = {
    'admin':  True,
    'editor': True,
    'viewer': True,
    'guest':  False,
}


def seed_flag(apps, schema_editor):
    Role = apps.get_model('accounts', 'Role')
    for role in Role.objects.all():
        role.can_view_infrastructure = ROLE_VALUES.get(role.name, False)
        role.save()


def reverse_seed(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0003_granular_permissions'),
    ]

    operations = [
        migrations.AddField(
            model_name='role',
            name='can_view_infrastructure',
            field=models.BooleanField(
                default=False,
                verbose_name='Can view infrastructure (racks, rooms, map)',
            ),
        ),
        migrations.RunPython(seed_flag, reverse_seed),
    ]
