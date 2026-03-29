from django.db import migrations

STANDARD_STATES = [
    {'code': 'in_stock',        'name': 'In Stock',        'description': 'Asset in warehouse, ready for deployment.'},
    {'code': 'in_preparation',  'name': 'In Preparation',  'description': 'Asset being configured or tested in a technical room.'},
    {'code': 'in_maintenance',  'name': 'In Maintenance',  'description': 'Asset temporarily removed from production for repair or upgrade.'},
    {'code': 'in_production',   'name': 'In Production',   'description': 'Asset active in the datacenter.'},
    {'code': 'decommissioned',  'name': 'Decommissioned',  'description': 'Asset retired from service (historical).'},
]


def populate_states(apps, schema_editor):
    AssetState = apps.get_model('asset', 'AssetState')
    for s in STANDARD_STATES:
        obj, created = AssetState.objects.get_or_create(
            code=s['code'],
            defaults={'name': s['name'], 'description': s['description']},
        )
        if not created and obj.name != s['name']:
            # Update name/description only if name still matches the expected value
            pass  # Don't overwrite user-customised names


def remove_states(apps, schema_editor):
    AssetState = apps.get_model('asset', 'AssetState')
    codes = [s['code'] for s in STANDARD_STATES]
    AssetState.objects.filter(code__in=codes).delete()


class Migration(migrations.Migration):
    dependencies = [
        ('asset', '0063_assettransitionlog'),
    ]

    operations = [
        migrations.RunPython(populate_states, remove_states),
    ]
