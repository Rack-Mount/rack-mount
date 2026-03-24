from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):
    """
    Migration B: Register Rack and RackType in the location app Django state.
    Tables already exist in DB (SeparateDatabaseAndState with no database_operations).
    """

    dependencies = [
        ('location', '0016_locationcustomfield_replace_field_name_with_fk'),
        ('asset', '0060_move_rack_racktype_to_location_state_delete'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.CreateModel(
                    name='RackType',
                    fields=[
                        ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('model', models.CharField(max_length=255)),
                        ('width', models.PositiveIntegerField()),
                        ('height', models.PositiveIntegerField(blank=True, null=True)),
                        ('depth', models.PositiveIntegerField()),
                        ('capacity', models.PositiveIntegerField(default=48)),
                        ('created_at', models.DateTimeField(auto_now_add=True)),
                        ('updated_at', models.DateTimeField(auto_now=True)),
                    ],
                    options={
                        'verbose_name': 'Rack Type',
                        'verbose_name_plural': 'Rack Types',
                        'db_table': 'rack_type',
                    },
                ),
                migrations.CreateModel(
                    name='Rack',
                    fields=[
                        ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('name', models.CharField(max_length=100)),
                        ('description', models.TextField(blank=True)),
                        ('created_at', models.DateTimeField(auto_now_add=True)),
                        ('updated_at', models.DateTimeField(auto_now=True)),
                        ('model', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='location.racktype')),
                        ('room', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='racks', to='location.room')),
                    ],
                    options={
                        'verbose_name': 'Rack',
                        'verbose_name_plural': 'Racks',
                        'db_table': 'rack',
                        'ordering': ['name'],
                    },
                ),
            ],
            database_operations=[],
        ),
    ]
