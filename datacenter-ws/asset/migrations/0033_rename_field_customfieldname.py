# Generated by Django 5.1.6 on 2025-02-09 10:52

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('asset', '0032_alter_racktype_options_alter_assetcustomfield_table_and_more'),
    ]

    operations = [
        migrations.RenameModel(
            old_name='Field',
            new_name='CustomFieldName',
        ),
    ]
