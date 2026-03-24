from django.db import migrations


class Migration(migrations.Migration):
    """
    Migration A: Remove Rack and RackType from the asset app Django state.
    Tables are NOT touched (SeparateDatabaseAndState with no database_operations).
    """

    dependencies = [
        ('asset', '0059_rename_power_cosumption_watt_asset_power_consumption_watt'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.DeleteModel('RackType'),
                migrations.DeleteModel('Rack'),
            ],
            database_operations=[],
        ),
    ]
