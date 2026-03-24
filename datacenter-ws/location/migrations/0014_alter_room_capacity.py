from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('location', '0013_alter_room_room_type'),
    ]

    operations = [
        migrations.AlterField(
            model_name='room',
            name='capacity',
            field=models.PositiveIntegerField(null=True, blank=True, default=None),
        ),
    ]
