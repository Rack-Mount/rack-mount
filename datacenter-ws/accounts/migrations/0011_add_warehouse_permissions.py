from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0010_extend_audit_log_actions'),
    ]

    operations = [
        migrations.AddField(
            model_name='role',
            name='can_view_warehouse',
            field=models.BooleanField(default=False, verbose_name='Can view warehouse'),
        ),
        migrations.AddField(
            model_name='role',
            name='can_manage_warehouse',
            field=models.BooleanField(default=False, verbose_name='Can manage warehouse (stock movements, inventory)'),
        ),
    ]
