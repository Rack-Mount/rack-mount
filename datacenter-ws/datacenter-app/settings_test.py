"""
Test settings for datacenter project.
Extends production settings but uses SQLite instead of MySQL to avoid permission issues.
"""

import os
import sys
from pathlib import Path

# Add parent directory to path for importing settings module
sys.path.insert(0, str(Path(__file__).parent))

# Import all settings from production
from importlib.util import spec_from_file_location, module_from_spec
settings_path = Path(__file__).parent / 'settings.py'
spec = spec_from_file_location('settings_module', settings_path)
settings_module = module_from_spec(spec)
spec.loader.exec_module(settings_module)

# Copy all attributes from production settings
for attr in dir(settings_module):
    if not attr.startswith('_'):
        globals()[attr] = getattr(settings_module, attr)

# Override database to use SQLite for testing
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',  # Use in-memory database for fast tests
    }
}

# Reduce password hasher iterations for faster test execution
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.MD5PasswordHasher',
]

