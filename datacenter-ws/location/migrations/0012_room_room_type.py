from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('location', '0011_room_floor_plan_data'),
    ]

    operations = [
        migrations.AddField(
            model_name='room',
            name='room_type',
            field=models.CharField(
                choices=[
                    ('datacenter', 'Datacenter'),
                    ('warehouse', 'Magazzino'),
                    ('laboratory', 'Laboratorio'),
                    ('technical_office', 'Ufficio Tecnico'),
                ],
                default='datacenter',
                max_length=20,
                verbose_name='Tipo di stanza',
            ),
        ),
    ]
