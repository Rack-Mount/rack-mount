from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('asset', '0050_add_asset_model_port'),
    ]

    operations = [
        migrations.AddField(
            model_name='assetmodel',
            name='width_mm',
            field=models.PositiveSmallIntegerField(
                blank=True, null=True,
                help_text='Equipment width in millimeters'),
        ),
        migrations.AddField(
            model_name='assetmodel',
            name='height_mm',
            field=models.PositiveSmallIntegerField(
                blank=True, null=True,
                help_text='Equipment height in millimeters'),
        ),
        migrations.AddField(
            model_name='assetmodel',
            name='depth_mm',
            field=models.PositiveSmallIntegerField(
                blank=True, null=True,
                help_text='Equipment depth in millimeters'),
        ),
        migrations.AddField(
            model_name='assetmodel',
            name='weight_kg',
            field=models.DecimalField(
                blank=True, null=True,
                max_digits=6, decimal_places=2,
                help_text='Equipment weight in kilograms'),
        ),
    ]
