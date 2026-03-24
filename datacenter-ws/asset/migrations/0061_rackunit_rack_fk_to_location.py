from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    """
    Migration C: Update RackUnit.rack FK to point to location.Rack in Django state.
    The DB column already points to the 'rack' table — no SQL change needed.
    """

    dependencies = [
        ('asset', '0060_move_rack_racktype_to_location_state_delete'),
        ('location', '0017_move_rack_racktype_from_asset_state_create'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AlterField(
                    model_name='rackunit',
                    name='rack',
                    field=models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        to='location.rack',
                    ),
                ),
            ],
            database_operations=[],
        ),
    ]
