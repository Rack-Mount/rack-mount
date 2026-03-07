from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('auth', '0012_alter_user_first_name_max_length'),
    ]

    operations = [
        migrations.CreateModel(
            name='Role',
            fields=[
                ('id', models.BigAutoField(auto_created=True,
                 primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(
                    choices=[
                        ('admin', 'Admin'),
                        ('editor', 'Editor'),
                        ('viewer', 'Viewer'),
                        ('guest', 'Guest'),
                    ],
                    max_length=20,
                    unique=True,
                    verbose_name='Name',
                )),
                ('can_create', models.BooleanField(
                    default=False, verbose_name='Can create')),
                ('can_edit', models.BooleanField(
                    default=False, verbose_name='Can edit')),
                ('can_delete', models.BooleanField(
                    default=False, verbose_name='Can delete')),
                ('can_import_export', models.BooleanField(
                    default=False, verbose_name='Can import/export')),
                ('can_access_assets', models.BooleanField(
                    default=False, verbose_name='Can access assets')),
                ('can_access_catalog', models.BooleanField(
                    default=False, verbose_name='Can access catalog')),
                ('can_manage_users', models.BooleanField(
                    default=False, verbose_name='Can manage users')),
            ],
            options={
                'verbose_name': 'Role',
                'verbose_name_plural': 'Roles',
                'ordering': ['name'],
            },
        ),
        migrations.CreateModel(
            name='UserProfile',
            fields=[
                ('id', models.BigAutoField(auto_created=True,
                 primary_key=True, serialize=False, verbose_name='ID')),
                ('user', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='profile',
                    to='auth.user',
                    verbose_name='User',
                )),
                ('role', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='user_profiles',
                    to='accounts.role',
                    verbose_name='Role',
                )),
            ],
            options={
                'verbose_name': 'User Profile',
                'verbose_name_plural': 'User Profiles',
            },
        ),
    ]
