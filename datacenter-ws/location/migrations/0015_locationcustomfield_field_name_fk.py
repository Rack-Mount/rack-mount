from django.db import migrations, models
import django.db.models.deletion


def migrate_field_name_to_fk(apps, schema_editor):
    LocationCustomField = apps.get_model('location', 'LocationCustomField')
    CustomFieldName = apps.get_model('asset', 'CustomFieldName')

    for lcf in LocationCustomField.objects.all():
        field_name_obj, _ = CustomFieldName.objects.get_or_create(
            name=lcf.field_name
        )
        lcf.field_name_fk = field_name_obj
        lcf.save(update_fields=['field_name_fk'])


class Migration(migrations.Migration):

    dependencies = [
        ('location', '0014_alter_room_capacity'),
        ('asset', '0059_rename_power_cosumption_watt_asset_power_consumption_watt'),
    ]

    operations = [
        migrations.AddField(
            model_name='locationcustomfield',
            name='field_name_fk',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='location_custom_fields',
                to='asset.customfieldname',
            ),
        ),
        migrations.RunPython(
            migrate_field_name_to_fk,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
