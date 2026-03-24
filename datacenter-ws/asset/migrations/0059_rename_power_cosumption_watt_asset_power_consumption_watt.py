from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('asset', '0058_protect_fk_on_delete'),
    ]

    operations = [
        migrations.RenameField(
            model_name='asset',
            old_name='power_cosumption_watt',
            new_name='power_consumption_watt',
        ),
    ]
