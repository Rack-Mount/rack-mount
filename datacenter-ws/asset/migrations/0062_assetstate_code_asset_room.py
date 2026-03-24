from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    """
    Schema migration:
    - Add AssetState.code (nullable, unique, choices)
    - Add Asset.room (nullable FK to location.Room)
    """

    dependencies = [
        ('asset', '0061_rackunit_rack_fk_to_location'),
        ('location', '0017_move_rack_racktype_from_asset_state_create'),
    ]

    operations = [
        migrations.AddField(
            model_name='assetstate',
            name='code',
            field=models.CharField(
                blank=True,
                choices=[
                    ('in_stock', 'In Stock'),
                    ('in_preparazione', 'In Preparazione'),
                    ('in_manutenzione', 'In Manutenzione'),
                    ('in_produzione', 'In Produzione'),
                    ('dismesso', 'Dismesso'),
                ],
                default=None,
                max_length=30,
                null=True,
                unique=True,
            ),
        ),
        migrations.AddField(
            model_name='asset',
            name='room',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='assets',
                to='location.room',
            ),
        ),
    ]
