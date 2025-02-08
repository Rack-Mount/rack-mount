# Generated by Django 5.1.6 on 2025-02-08 10:14

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('asset', '0011_assetstate'),
    ]

    operations = [
        migrations.AddField(
            model_name='asset',
            name='state2',
            field=models.ForeignKey(default=1, on_delete=django.db.models.deletion.CASCADE, related_name='assets', to='asset.assetstate'),
            preserve_default=False,
        ),
        migrations.AlterField(
            model_name='asset',
            name='state',
            field=models.CharField(default='in-use', max_length=100),
        ),
    ]
