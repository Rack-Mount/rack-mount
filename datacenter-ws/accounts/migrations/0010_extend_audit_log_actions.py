"""
Schema migration: extend SecurityAuditLog.action choices to cover
CRUD operations on assets, catalog items, and infrastructure.

No database column changes — choices are enforced at the Python layer only.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0009_remove_guest_role'),
    ]

    operations = [
        migrations.AlterField(
            model_name='securityauditlog',
            name='action',
            field=models.CharField(
                choices=[
                    ('login_success', 'Login successful'),
                    ('login_failed', 'Failed login attempt'),
                    ('logout', 'User logged out'),
                    ('asset_create', 'Asset created'),
                    ('asset_update', 'Asset updated'),
                    ('asset_delete', 'Asset deleted'),
                    ('asset_clone', 'Asset cloned'),
                    ('asset_bulk_state', 'Asset bulk state update'),
                    ('asset_bulk_delete', 'Asset bulk delete'),
                    ('catalog_create', 'Catalog item created'),
                    ('catalog_update', 'Catalog item updated'),
                    ('catalog_delete', 'Catalog item deleted'),
                    ('infra_create', 'Infrastructure item created'),
                    ('infra_update', 'Infrastructure item updated'),
                    ('infra_delete', 'Infrastructure item deleted'),
                    ('port_annotate', 'Port annotation submitted'),
                    ('port_correction', 'Port correction submitted'),
                    ('model_retrain', 'Model retraining triggered'),
                    ('model_update', 'Model weights updated'),
                ],
                db_index=True,
                max_length=20,
                verbose_name='Action',
            ),
        ),
    ]
