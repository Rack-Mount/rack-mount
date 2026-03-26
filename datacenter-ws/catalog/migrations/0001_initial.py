"""
Initial migration for the catalog app.

Uses SeparateDatabaseAndState to declare ownership of models whose tables
already exist in the database (created by the asset app migrations).
No database operations are performed — the tables are reused as-is.
"""
import uuid

import django.db.models.deletion
import reversion.models
from django.db import migrations, models

import asset.utils.upload_paths


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('asset', '0067_alter_assetrequest_clarification_notes_and_more'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.CreateModel(
                    name='Vendor',
                    fields=[
                        ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('name', models.CharField(max_length=255, unique=True)),
                        ('created_at', models.DateTimeField(auto_now_add=True)),
                        ('updated_at', models.DateTimeField(auto_now=True)),
                    ],
                    options={'db_table': 'vendor', 'app_label': 'catalog'},
                ),
                migrations.CreateModel(
                    name='AssetType',
                    fields=[
                        ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('name', models.CharField(max_length=100, unique=True)),
                        ('description', models.TextField(blank=True, default='')),
                    ],
                    options={'db_table': 'asset_type', 'app_label': 'catalog'},
                ),
                migrations.CreateModel(
                    name='CustomFieldName',
                    fields=[
                        ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('name', models.CharField(max_length=255, unique=True)),
                    ],
                    options={'db_table': 'custom_field_name', 'app_label': 'catalog'},
                ),
                migrations.CreateModel(
                    name='AssetModel',
                    fields=[
                        ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('uuid', models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                        ('name', models.CharField(default='', max_length=100)),
                        ('rack_units', models.PositiveIntegerField(default=1)),
                        ('width_mm', models.PositiveSmallIntegerField(blank=True, null=True)),
                        ('height_mm', models.PositiveSmallIntegerField(blank=True, null=True)),
                        ('depth_mm', models.PositiveSmallIntegerField(blank=True, null=True)),
                        ('weight_kg', models.DecimalField(blank=True, decimal_places=2, max_digits=6, null=True)),
                        ('power_consumption_watt', models.PositiveIntegerField(default=0)),
                        ('front_image', models.ImageField(null=True, upload_to=asset.utils.upload_paths.asset_model_front_upload)),
                        ('rear_image', models.ImageField(null=True, upload_to=asset.utils.upload_paths.asset_model_rear_upload)),
                        ('note', models.TextField(blank=True)),
                        ('created_at', models.DateTimeField(auto_now_add=True)),
                        ('updated_at', models.DateTimeField(auto_now=True)),
                        ('vendor', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='asset_vendor', to='catalog.vendor')),
                        ('type', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='asset_type', to='catalog.assettype')),
                    ],
                    options={
                        'db_table': 'asset_model',
                        'app_label': 'catalog',
                        'unique_together': {('name', 'vendor', 'type')},
                    },
                ),
                migrations.CreateModel(
                    name='AssetModelPort',
                    fields=[
                        ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('name', models.CharField(max_length=64)),
                        ('port_type', models.CharField(
                            choices=[('RJ45', 'RJ45 (1GbE)'), ('SFP', 'SFP (1G)'), ('SFP+', 'SFP+ (10G)'),
                                     ('SFP28', 'SFP28 (25G)'), ('QSFP+', 'QSFP+ (40G)'), ('QSFP28', 'QSFP28 (100G)'),
                                     ('QSFP-DD', 'QSFP-DD (400G)'), ('LC', 'LC Fiber'), ('SC', 'SC Fiber'),
                                     ('FC', 'Fibre Channel'), ('USB-A', 'USB-A'), ('USB-C', 'USB-C'),
                                     ('SERIAL', 'Serial Console'), ('MGMT', 'Management'), ('HDMI', 'HDMI'),
                                     ('VGA', 'VGA'), ('OTHER', 'Other')],
                            default='RJ45',
                            max_length=16,
                        )),
                        ('side', models.CharField(
                            choices=[('front', 'Front'), ('rear', 'Rear')],
                            default='rear',
                            max_length=5,
                        )),
                        ('pos_x', models.FloatField(blank=True, null=True)),
                        ('pos_y', models.FloatField(blank=True, null=True)),
                        ('notes', models.TextField(blank=True)),
                        ('asset_model', models.ForeignKey(
                            on_delete=django.db.models.deletion.CASCADE,
                            related_name='network_ports',
                            to='catalog.assetmodel',
                        )),
                    ],
                    options={
                        'db_table': 'asset_model_port',
                        'app_label': 'catalog',
                        'ordering': ['side', 'name'],
                    },
                ),
                migrations.CreateModel(
                    name='NetworkSwitchAssetModel',
                    fields=[
                        ('assetmodel_ptr', models.OneToOneField(
                            auto_created=True,
                            on_delete=django.db.models.deletion.CASCADE,
                            parent_link=True,
                            primary_key=True,
                            serialize=False,
                            to='catalog.assetmodel',
                        )),
                        ('ports', models.PositiveIntegerField(default=24)),
                        ('uplink_ports', models.PositiveIntegerField(default=2)),
                    ],
                    options={
                        'db_table': 'network_switch_asset_model',
                        'app_label': 'catalog',
                    },
                    bases=('catalog.assetmodel',),
                ),
            ],
            database_operations=[],
        ),
    ]
