from django.db import migrations

STANDARD_STATES = [
    {'code': 'in_stock',        'name': 'In Stock',        'description': 'Asset in magazzino, pronto per il deploy.'},
    {'code': 'in_preparazione', 'name': 'In Preparazione', 'description': 'Asset in fase di configurazione o test in stanza tecnica.'},
    {'code': 'in_manutenzione', 'name': 'In Manutenzione', 'description': 'Asset temporaneamente rimosso dalla produzione per riparazione o aggiornamento.'},
    {'code': 'in_produzione',   'name': 'In Produzione',   'description': 'Asset attivo in datacenter.'},
    {'code': 'dismesso',        'name': 'Dismesso',        'description': 'Asset ritirato dal servizio (storico).'},
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
