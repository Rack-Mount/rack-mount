# Generated by Django 5.1.6 on 2025-02-09 18:59

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('asset', '0036_rackunit'),
    ]

    operations = [
        migrations.AlterField(
            model_name='rackunit',
            name='device',
            field=models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to='asset.asset'),
        ),
    ]
