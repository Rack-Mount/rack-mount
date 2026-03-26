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
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('request_type', models.CharField(
                    choices=[
                        ('registrazione', 'Registrazione'),
                        ('spostamento', 'Spostamento'),
                        ('manutenzione', 'Manutenzione'),
                        ('dismissione', 'Dismissione'),
                    ],
                    max_length=20,
                    verbose_name='Tipo richiesta',
                )),
                ('status', models.CharField(
                    choices=[
                        ('inserita', 'Inserita'),
                        ('pianificata', 'Pianificata'),
                        ('evasa', 'Evasa'),
                        ('rifiutata', 'Rifiutata'),
                        ('in_chiarimento', 'In Chiarimento'),
                    ],
                    db_index=True,
                    default='inserita',
                    max_length=20,
                    verbose_name='Stato richiesta',
                )),
                ('notes', models.TextField(blank=True, verbose_name='Note')),
                ('clarification_notes', models.TextField(blank=True, verbose_name='Note di chiarimento')),
                ('rejection_notes', models.TextField(blank=True, verbose_name='Motivo rifiuto')),
                ('planned_date', models.DateField(blank=True, null=True, verbose_name='Data pianificata')),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
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
                    verbose_name='Stato asset di partenza',
                )),
                ('to_state', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='requests_to',
                    to='asset.assetstate',
                    verbose_name='Stato asset di destinazione',
                )),
                ('from_room', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='asset_requests_from',
                    to='location.room',
                    verbose_name='Location di partenza',
                )),
                ('to_room', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='asset_requests_to',
                    to='location.room',
                    verbose_name='Location di destinazione',
                )),
                ('created_by', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='asset_requests_created',
                    to=settings.AUTH_USER_MODEL,
                    verbose_name='Creata da',
                )),
                ('assigned_to', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='asset_requests_assigned',
                    to=settings.AUTH_USER_MODEL,
                    verbose_name='Assegnata a',
                )),
                ('executed_by', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='asset_requests_executed',
                    to=settings.AUTH_USER_MODEL,
                    verbose_name='Evasa da',
                )),
            ],
            options={
                'verbose_name': 'Richiesta asset',
                'verbose_name_plural': 'Richieste asset',
                'db_table': 'asset_request',
                'ordering': ['-created_at'],
            },
        ),
    ]
