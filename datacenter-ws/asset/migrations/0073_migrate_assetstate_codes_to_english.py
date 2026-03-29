from django.db import migrations


def migrate_assetstate_codes_to_english(apps, schema_editor):
    AssetState = apps.get_model('asset', 'AssetState')

    code_map = {
        'in_preparazione': 'in_preparation',
        'in_manutenzione': 'in_maintenance',
        'in_produzione': 'in_production',
        'dismesso': 'decommissioned',
    }

    for old_value, new_value in code_map.items():
        AssetState.objects.filter(code=old_value).update(code=new_value)


def reverse_assetstate_codes_to_italian(apps, schema_editor):
    AssetState = apps.get_model('asset', 'AssetState')

    code_map = {
        'in_preparation': 'in_preparazione',
        'in_maintenance': 'in_manutenzione',
        'in_production': 'in_produzione',
        'decommissioned': 'dismesso',
    }

    for old_value, new_value in code_map.items():
        AssetState.objects.filter(code=old_value).update(code=new_value)


class Migration(migrations.Migration):

    dependencies = [
        ('asset', '0072_alter_assetstate_code'),
    ]

    operations = [
        migrations.RunPython(
            migrate_assetstate_codes_to_english,
            reverse_assetstate_codes_to_italian,
        ),
    ]
