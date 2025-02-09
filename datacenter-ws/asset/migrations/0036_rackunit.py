# Generated by Django 5.1.6 on 2025-02-09 18:59

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('asset', '0035_remove_asset_location'),
    ]

    operations = [
        migrations.CreateModel(
            name='RackUnit',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('unit', models.PositiveIntegerField()),
                ('front', models.BooleanField(default=True)),
                ('description', models.TextField(blank=True)),
                ('device', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to='asset.asset')),
                ('rack', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='asset.rack')),
            ],
            options={
                'db_table': 'rack_units',
                'unique_together': {('rack', 'unit', 'front')},
            },
        ),
    ]
