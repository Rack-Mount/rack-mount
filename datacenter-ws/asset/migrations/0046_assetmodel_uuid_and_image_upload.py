import uuid

from django.db import migrations, models
import asset.utils.upload_paths


def _populate_uuid(apps, schema_editor):
    """Assign a fresh unique UUID to every row (overwrites any duplicates)."""
    AssetModel = apps.get_model('asset', 'AssetModel')
    for obj in AssetModel.objects.all():
        obj.uuid = uuid.uuid4()
        obj.save(update_fields=['uuid'])


class Migration(migrations.Migration):

    dependencies = [
        ('asset', '0045_asset_serial_sap_nullable'),
    ]

    operations = [
        # The uuid column and its data may already exist in the DB from a
        # previous partial run.  Use SeparateDatabaseAndState so Django's
        # migration state is updated without re-issuing the DDL.
        migrations.SeparateDatabaseAndState(
            database_operations=[],  # column already in DB — skip DDL
            state_operations=[
                migrations.AddField(
                    model_name='assetmodel',
                    name='uuid',
                    field=models.UUIDField(
                        default=uuid.uuid4, editable=False, null=True),
                ),
            ],
        ),
        # Back-fill any row that still has NULL (idempotent)
        migrations.RunPython(_populate_uuid, migrations.RunPython.noop),
        # Make uuid NOT NULL + UNIQUE (runs in DB)
        migrations.AlterField(
            model_name='assetmodel',
            name='uuid',
            field=models.UUIDField(
                default=uuid.uuid4, editable=False, unique=True),
        ),
        # Update upload_to for front_image
        migrations.AlterField(
            model_name='assetmodel',
            name='front_image',
            field=models.ImageField(
                null=True, upload_to=asset.utils.upload_paths.asset_model_front_upload),
        ),
        # Update upload_to for rear_image
        migrations.AlterField(
            model_name='assetmodel',
            name='rear_image',
            field=models.ImageField(
                null=True, upload_to=asset.utils.upload_paths.asset_model_rear_upload),
        ),
    ]
