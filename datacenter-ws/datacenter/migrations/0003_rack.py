# Generated by Django 5.1.6 on 2025-02-08 23:55

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('datacenter', '0002_alter_location_options'),
    ]

    operations = [
        migrations.CreateModel(
            name='Rack',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100)),
                ('capacity', models.IntegerField()),
                ('occupied_units', models.IntegerField(default=0)),
                ('location', models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name='racks', to='datacenter.location')),
            ],
            options={
                'verbose_name': 'Rack',
                'verbose_name_plural': 'Racks',
                'ordering': ['name'],
                'unique_together': {('name', 'location')},
            },
        ),
    ]
