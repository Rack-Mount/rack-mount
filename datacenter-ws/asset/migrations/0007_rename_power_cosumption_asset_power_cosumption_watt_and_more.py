# Generated by Django 5.1.6 on 2025-02-08 09:32

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('asset', '0006_asset_model_alter_asset_vendor'),
    ]

    operations = [
        migrations.RenameField(
            model_name='asset',
            old_name='power_cosumption',
            new_name='power_cosumption_watt',
        ),
        migrations.AlterField(
            model_name='asset',
            name='serial_number',
            field=models.CharField(default='', max_length=50),
        ),
    ]
