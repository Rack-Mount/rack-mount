"""
Pytest configuration for datacenter-ws project.
Configures Django with SQLite for test execution and sets up database schema.
"""

import importlib.util
import os
import sys

# Ensure the project directory is in the path
project_dir = os.path.dirname(os.path.abspath(__file__))
if project_dir not in sys.path:
    sys.path.insert(0, project_dir)

# Load the test settings module from datacenter-app folder by absolute path
datacenter_app_path = os.path.join(project_dir, 'datacenter-app')
settings_path = os.path.join(datacenter_app_path, 'settings_test.py')

# Load the settings module directly from file
spec = importlib.util.spec_from_file_location('django_settings', settings_path)
settings_module = importlib.util.module_from_spec(spec)
sys.modules['django_settings'] = settings_module
spec.loader.exec_module(settings_module)

# Create datacenter_app module alias
sys.modules['datacenter_app'] = settings_module

# Set Django settings module
os.environ['DJANGO_SETTINGS_MODULE'] = 'django_settings'

# Setup Django
import django
django.setup()

# Setup test database schema
import pytest
from django.core.management import call_command
from django.db import DEFAULT_DB_ALIAS


@pytest.fixture(scope='session', autouse=True)
def django_db_setup():
    """
    Create the test database schema from models.
    This runs once per test session.
    Uses --run_syncdb to create tables directly from models without migrations.
    """
    # Create all tables from model definitions without using migrations
    call_command('migrate', verbosity=0, interactive=False, 
                database=DEFAULT_DB_ALIAS, run_syncdb=True)
