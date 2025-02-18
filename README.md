# Rack Mount

# Migrate databse

1. python manage.py dumpdata > datadump.json
2. Change settings.py to your mysql Make sure you can connect on your mysql (permissions,etc)
3. python manage.py migrate --run-syncdb

4. Exclude contentype data with this snippet in shell

```python
python manage.py shell

from django.contrib.contenttypes.models import ContentType
ContentType.objects.all().delete()
quit()
```

5. python manage.py loaddata datadump.json
