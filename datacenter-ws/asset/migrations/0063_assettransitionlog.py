from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    """
    Create the AssetTransitionLog table.
    """

    dependencies = [
        ('asset', '0062_assetstate_code_asset_room'),
        ('location', '0017_move_rack_racktype_from_asset_state_create'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='AssetTransitionLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('notes', models.TextField(blank=True)),
                ('timestamp', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('asset', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='transitions',
                    to='asset.asset',
                )),
                ('from_room', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='transitions_from',
                    to='location.room',
                )),
                ('from_state', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='transitions_from',
                    to='asset.assetstate',
                )),
                ('to_room', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='transitions_to',
                    to='location.room',
                )),
                ('to_state', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='transitions_to',
                    to='asset.assetstate',
                )),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='asset_transitions',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'db_table': 'asset_transition_log',
                'ordering': ['-timestamp'],
            },
        ),
    ]
