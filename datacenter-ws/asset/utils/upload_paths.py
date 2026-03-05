"""
Callable upload_to helpers for AssetModel image fields.

Keeping them in a dedicated module ensures Django's migration serializer
can resolve the dotted import path without ambiguity (the asset.models
package re-exports AssetModel as a class, so 'asset.models.AssetModel'
resolves to the class, not the file module).
"""


def asset_model_front_upload(instance, filename: str) -> str:
    """Save front image as <uuid>_front.<ext>."""
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'jpg'
    return '{}_front.{}'.format(instance.uuid, ext)


def asset_model_rear_upload(instance, filename: str) -> str:
    """Save rear image as <uuid>_rear.<ext>."""
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'jpg'
    return '{}_rear.{}'.format(instance.uuid, ext)


def generic_component_front_upload(instance, filename: str) -> str:
    """Save generic component front image as components/<uuid>_front.<ext>."""
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'jpg'
    return 'components/{}_front.{}'.format(instance.uuid, ext)


def generic_component_rear_upload(instance, filename: str) -> str:
    """Save generic component rear image as components/<uuid>_rear.<ext>."""
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'jpg'
    return 'components/{}_rear.{}'.format(instance.uuid, ext)
