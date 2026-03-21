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
                help_text='Larghezza apparato in millimetri'),
        ),
        migrations.AddField(
            model_name='assetmodel',
            name='height_mm',
            field=models.PositiveSmallIntegerField(
                blank=True, null=True,
                help_text='Altezza apparato in millimetri'),
        ),
        migrations.AddField(
            model_name='assetmodel',
            name='depth_mm',
            field=models.PositiveSmallIntegerField(
                blank=True, null=True,
                help_text='Profondità apparato in millimetri'),
        ),
        migrations.AddField(
            model_name='assetmodel',
            name='weight_kg',
            field=models.DecimalField(
                blank=True, null=True,
                max_digits=6, decimal_places=2,
                help_text='Peso apparato in chilogrammi'),
        ),
    ]
