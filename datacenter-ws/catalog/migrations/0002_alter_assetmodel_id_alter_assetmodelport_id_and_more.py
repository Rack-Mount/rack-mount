"""
Migration 0002: Update primary key field types in migration state (no DB ops).

The catalog app uses default_auto_field = BigAutoField, but the underlying
tables were created by asset migrations with regular AutoField (INT).
This migration updates the Django migration state to reflect BigAutoField
without touching the database (tables keep their existing INT primary keys).
"""
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0001_initial'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AlterField(
                    model_name='assetmodel',
                    name='id',
                    field=models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID'),
                ),
                migrations.AlterField(
                    model_name='assetmodelport',
                    name='id',
                    field=models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID'),
                ),
                migrations.AlterField(
                    model_name='assettype',
                    name='id',
                    field=models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID'),
                ),
                migrations.AlterField(
                    model_name='customfieldname',
                    name='id',
                    field=models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID'),
                ),
                migrations.AlterField(
                    model_name='vendor',
                    name='id',
                    field=models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID'),
                ),
            ],
            database_operations=[],
        ),
    ]
