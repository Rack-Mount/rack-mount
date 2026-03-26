"""
Migration 0068: Extract catalog models from the asset app state.

Uses SeparateDatabaseAndState to remove Vendor, AssetType, CustomFieldName,
AssetModel, AssetModelPort and NetworkSwitchAssetModel from the asset migration
state without touching the database.  These models are now owned by the
catalog app (see catalog/migrations/0001_initial.py).

Also updates ForeignKey references in the remaining asset models (Asset,
AssetCustomField) so the state reflects that they now point to catalog.*.
"""
import django.db.models.deletion
from django.db import migrations, models

import asset.utils.upload_paths


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0001_initial'),
        ('asset', '0067_alter_assetrequest_clarification_notes_and_more'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                # Remove child models first (they depend on AssetModel)
                migrations.DeleteModel('NetworkSwitchAssetModel'),
                migrations.DeleteModel('AssetModelPort'),
                # Update Asset.model FK to point to catalog.AssetModel
                migrations.AlterField(
                    model_name='asset',
                    name='model',
                    field=models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name='assets',
                        to='catalog.assetmodel',
                    ),
                ),
                # Update AssetCustomField.field_name FK to catalog.CustomFieldName
                migrations.AlterField(
                    model_name='assetcustomfield',
                    name='field_name',
                    field=models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='field_name',
                        to='catalog.customfieldname',
                    ),
                ),
                # Now safe to remove the catalog models from asset state
                migrations.DeleteModel('AssetModel'),
                migrations.DeleteModel('CustomFieldName'),
                migrations.DeleteModel('AssetType'),
                migrations.DeleteModel('Vendor'),
            ],
            database_operations=[],
        ),
    ]
