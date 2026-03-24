from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('location', '0015_locationcustomfield_field_name_fk'),
        ('asset', '0059_rename_power_cosumption_watt_asset_power_consumption_watt'),
    ]

    operations = [
        migrations.AlterField(
            model_name='locationcustomfield',
            name='field_name_fk',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='location_custom_fields',
                to='asset.customfieldname',
            ),
        ),
        migrations.RemoveField(
            model_name='locationcustomfield',
            name='field_name',
        ),
        migrations.RenameField(
            model_name='locationcustomfield',
            old_name='field_name_fk',
            new_name='field_name',
        ),
    ]
