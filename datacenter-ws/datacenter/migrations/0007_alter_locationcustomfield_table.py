# Generated by Django 5.1.6 on 2025-02-09 10:38

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('datacenter', '0006_delete_rack_delete_racktype'),
    ]

    operations = [
        migrations.AlterModelTable(
            name='locationcustomfield',
            table='location_custom_field',
        ),
    ]
