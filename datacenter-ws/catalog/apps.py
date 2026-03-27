from django.apps import AppConfig


class CatalogConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'catalog'
    verbose_name = 'Catalog'

    def ready(self):
        """Reset any stuck is_training flag left by a mid-training server restart."""
        try:
            import json
            import os
            from django.conf import settings

            media_root = os.path.realpath(settings.MEDIA_ROOT)
            state_path = os.path.join(media_root, 'models', 'training_state.json')
            if not os.path.isfile(state_path):
                return
            with open(state_path) as f:
                state = json.load(f)
            if state.get('is_training'):
                state['is_training'] = False
                with open(state_path, 'w') as f:
                    json.dump(state, f, indent=2)
        except Exception:
            pass
