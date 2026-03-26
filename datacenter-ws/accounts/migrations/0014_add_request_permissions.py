from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0013_seed_warehouse_roles'),
    ]

    operations = [
        # Nuovi flag di permesso sul modello Role
        migrations.AddField(
            model_name='role',
            name='can_view_requests',
            field=models.BooleanField(default=False, verbose_name='Can view asset requests'),
        ),
        migrations.AddField(
            model_name='role',
            name='can_create_requests',
            field=models.BooleanField(default=False, verbose_name='Can create asset requests'),
        ),
        migrations.AddField(
            model_name='role',
            name='can_manage_requests',
            field=models.BooleanField(default=False, verbose_name='Can plan, execute, reject or clarify asset requests'),
        ),
        # Ampliamento max_length del campo action in SecurityAuditLog
        # (i nuovi codici 'asset_request_*' arrivano fino a 22 caratteri)
        migrations.AlterField(
            model_name='securityauditlog',
            name='action',
            field=models.CharField(
                max_length=30,
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
                    ('asset_request_create', 'Asset request created'),
                    ('asset_request_plan', 'Asset request planned'),
                    ('asset_request_execute', 'Asset request executed'),
                    ('asset_request_reject', 'Asset request rejected'),
                    ('asset_request_clarify', 'Asset request sent for clarification'),
                    ('asset_request_resubmit', 'Asset request resubmitted'),
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
                verbose_name='Action',
            ),
        ),
    ]
