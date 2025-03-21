# Generated by Django 5.1.6 on 2025-02-13 13:53

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('asset', '0038_rack_created_at_rack_updated_at_racktype_created_at_and_more'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='rackunit',
            options={'ordering': ['rack', '-position']},
        ),
        migrations.RenameField(
            model_name='rackunit',
            old_name='unit',
            new_name='position',
        ),
        migrations.AlterUniqueTogether(
            name='rackunit',
            unique_together={('rack', 'position', 'front')},
        ),
    ]
