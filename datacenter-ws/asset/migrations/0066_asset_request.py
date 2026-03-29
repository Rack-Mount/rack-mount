from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('asset', '0065_genericcomponent_warehouse_item'),
        ('location', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='AssetRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True,
                 primary_key=True, serialize=False, verbose_name='ID')),
                ('request_type', models.CharField(
                    choices=[
                        ('registrazione', 'Registration'),
                        ('spostamento', 'Relocation'),
                        ('manutenzione', 'Maintenance'),
                        ('dismissione', 'Decommissioning'),
                    ],
                    max_length=20,
                    verbose_name='Request type',
                )),
                ('status', models.CharField(
                    choices=[
                        ('inserita', 'Submitted'),
                        ('pianificata', 'Planned'),
                        ('evasa', 'Executed'),
                        ('rifiutata', 'Rejected'),
                        ('in_chiarimento', 'Needs Clarification'),
                    ],
                    db_index=True,
                    default='inserita',
                    max_length=20,
                    verbose_name='Request status',
                )),
                ('notes', models.TextField(blank=True, verbose_name='Note')),
                ('clarification_notes', models.TextField(
                    blank=True, verbose_name='Clarification notes')),
                ('rejection_notes', models.TextField(
                    blank=True, verbose_name='Rejection reason')),
                ('planned_date', models.DateField(
                    blank=True, null=True, verbose_name='Planned date')),
                ('created_at', models.DateTimeField(
                    auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('asset', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='requests',
                    to='asset.asset',
                    verbose_name='Asset',
                )),
                ('from_state', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='requests_from',
                    to='asset.assetstate',
                    verbose_name='Source asset state',
                )),
                ('to_state', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='requests_to',
                    to='asset.assetstate',
                    verbose_name='Target asset state',
                )),
                ('from_room', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='asset_requests_from',
                    to='location.room',
                    verbose_name='Source location',
                )),
                ('to_room', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='asset_requests_to',
                    to='location.room',
                    verbose_name='Target location',
                )),
                ('created_by', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='asset_requests_created',
                    to=settings.AUTH_USER_MODEL,
                    verbose_name='Created by',
                )),
                ('assigned_to', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='asset_requests_assigned',
                    to=settings.AUTH_USER_MODEL,
                    verbose_name='Assigned to',
                )),
                ('executed_by', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='asset_requests_executed',
                    to=settings.AUTH_USER_MODEL,
                    verbose_name='Executed by',
                )),
            ],
            options={
                'verbose_name': 'Asset request',
                'verbose_name_plural': 'Asset requests',
                'db_table': 'asset_request',
                'ordering': ['-created_at'],
            },
        ),
    ]
