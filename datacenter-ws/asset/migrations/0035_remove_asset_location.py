# Generated by Django 5.1.6 on 2025-02-09 14:07

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('asset', '0034_alter_customfieldname_table'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='asset',
            name='location',
        ),
    ]
