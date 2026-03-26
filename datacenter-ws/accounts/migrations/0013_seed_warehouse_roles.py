"""
Data migration: add two dedicated warehouse roles.

warehouse_manager
  - Gestisce il magazzino: riceve asset, aggiorna stati/location, gestisce
    l'inventario consumabili. Può vedere il catalogo per consultare i modelli.
  - NON accede all'infrastruttura rack, non cancella asset, non gestisce utenti.

warehouse_viewer
  - Accesso in sola lettura ad asset, catalogo e magazzino.
"""
from django.db import migrations

WAREHOUSE_ROLES = [
    {
        'name': 'warehouse_manager',
        # Assets: può vedere, creare (ricezione), modificare (spostamento),
        # importare da CSV. Non cancella, non clona, non esporta.
        'can_view_assets': True,
        'can_create_assets': True,
        'can_edit_assets': True,
        'can_delete_assets': False,
        'can_import_assets': True,
        'can_export_assets': False,
        'can_clone_assets': False,
        # Catalog: sola lettura (consultazione modelli)
        'can_view_catalog': True,
        'can_create_catalog': False,
        'can_edit_catalog': False,
        'can_delete_catalog': False,
        'can_import_catalog': False,
        # Infrastructure: nessun accesso
        'can_view_infrastructure': False,
        'can_create_racks': False,
        'can_edit_racks': False,
        'can_delete_racks': False,
        'can_edit_map': False,
        # Warehouse: accesso completo
        'can_view_warehouse': True,
        'can_manage_warehouse': True,
        # Amministrazione
        'can_manage_users': False,
        # Model training
        'can_provide_port_training': False,
        'can_provide_port_corrections': False,
        'can_view_model_training_status': False,
    },
    {
        'name': 'warehouse_viewer',
        # Assets: sola lettura
        'can_view_assets': True,
        'can_create_assets': False,
        'can_edit_assets': False,
        'can_delete_assets': False,
        'can_import_assets': False,
        'can_export_assets': False,
        'can_clone_assets': False,
        # Catalog: sola lettura
        'can_view_catalog': True,
        'can_create_catalog': False,
        'can_edit_catalog': False,
        'can_delete_catalog': False,
        'can_import_catalog': False,
        # Infrastructure: nessun accesso
        'can_view_infrastructure': False,
        'can_create_racks': False,
        'can_edit_racks': False,
        'can_delete_racks': False,
        'can_edit_map': False,
        # Warehouse: sola lettura
        'can_view_warehouse': True,
        'can_manage_warehouse': False,
        # Amministrazione
        'can_manage_users': False,
        # Model training
        'can_provide_port_training': False,
        'can_provide_port_corrections': False,
        'can_view_model_training_status': False,
    },
]


def seed_warehouse_roles(apps, schema_editor):
    Role = apps.get_model('accounts', 'Role')
    for role_data in WAREHOUSE_ROLES:
        Role.objects.update_or_create(
            name=role_data['name'],
            defaults={k: v for k, v in role_data.items() if k != 'name'},
        )


def remove_warehouse_roles(apps, schema_editor):
    Role = apps.get_model('accounts', 'Role')
    Role.objects.filter(name__in=[r['name'] for r in WAREHOUSE_ROLES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0012_seed_warehouse_permissions'),
    ]

    operations = [
        migrations.RunPython(seed_warehouse_roles, reverse_code=remove_warehouse_roles),
    ]
