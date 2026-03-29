from django.db import migrations


def migrate_assetrequest_values_to_english(apps, schema_editor):
    AssetRequest = apps.get_model('asset', 'AssetRequest')

    request_type_map = {
        'registrazione': 'registration',
        'spostamento': 'relocation',
        'manutenzione': 'maintenance',
        'dismissione': 'decommissioning',
    }
    status_map = {
        'inserita': 'submitted',
        'pianificata': 'planned',
        'evasa': 'executed',
        'rifiutata': 'rejected',
        'in_chiarimento': 'needs_clarification',
    }

    for old_value, new_value in request_type_map.items():
        AssetRequest.objects.filter(
            request_type=old_value).update(request_type=new_value)

    for old_value, new_value in status_map.items():
        AssetRequest.objects.filter(status=old_value).update(status=new_value)


def reverse_migrate_assetrequest_values_to_italian(apps, schema_editor):
    AssetRequest = apps.get_model('asset', 'AssetRequest')

    request_type_map = {
        'registration': 'registrazione',
        'relocation': 'spostamento',
        'maintenance': 'manutenzione',
        'decommissioning': 'dismissione',
    }
    status_map = {
        'submitted': 'inserita',
        'planned': 'pianificata',
        'executed': 'evasa',
        'rejected': 'rifiutata',
        'needs_clarification': 'in_chiarimento',
    }

    for old_value, new_value in request_type_map.items():
        AssetRequest.objects.filter(
            request_type=old_value).update(request_type=new_value)

    for old_value, new_value in status_map.items():
        AssetRequest.objects.filter(status=old_value).update(status=new_value)


class Migration(migrations.Migration):

    dependencies = [
        ('asset', '0070_alter_assetrequest_request_type_and_more'),
    ]

    operations = [
        migrations.RunPython(
            migrate_assetrequest_values_to_english,
            reverse_migrate_assetrequest_values_to_italian,
        ),
    ]
