from django.db import migrations, models


def copy_import_export(apps, schema_editor):
    Role = apps.get_model('accounts', 'Role')
    for role in Role.objects.all():
        role.can_import_assets = role.can_import_export_assets
        role.can_export_assets = role.can_import_export_assets
        role.save(update_fields=['can_import_assets', 'can_export_assets'])


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0004_can_view_infrastructure'),
    ]

    operations = [
        migrations.AddField(
            model_name='role',
            name='can_import_assets',
            field=models.BooleanField(
                default=False, verbose_name='Can import assets'),
        ),
        migrations.AddField(
            model_name='role',
            name='can_export_assets',
            field=models.BooleanField(
                default=False, verbose_name='Can export assets'),
        ),
        migrations.RunPython(copy_import_export, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='role',
            name='can_import_export_assets',
        ),
    ]
