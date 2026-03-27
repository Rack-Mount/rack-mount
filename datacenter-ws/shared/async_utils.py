"""
Async utilities for Django 6.0 optimization.

Provides async-safe database operations and wrappers for heavy I/O operations.
Use these patterns to prevent blocking in CPU-heavy or I/O-heavy tasks.

Django 6.0 async views example:
    @sync_to_async
    def _get_user_profile(user_id):
        return User.objects.select_related('profile__role').get(pk=user_id)

    async def get(self, request):
        profile = await _get_user_profile(request.user.id)
        return Response(ProfileSerializer(profile).data)
"""

from asgiref.sync import sync_to_async, async_to_sync
from django.core.cache import cache
from typing import TypeVar, Callable, Any

T = TypeVar('T')


class AsyncCacheHelper:
    """
    Helper for caching expensive async operations.

    Example:
        @AsyncCacheHelper.cached('asset_list', ttl=300)
        @sync_to_async
        def get_all_assets():
            return list(Asset.objects.all())

        async def list_assets():
            assets = await get_all_assets()
            return Response(AssetSerializer(assets, many=True).data)
    """

    @staticmethod
    def cached(cache_key: str, ttl: int = 300):
        """Decorator to cache async function results."""
        def decorator(func: Callable) -> Callable:
            async def wrapper(*args, **kwargs) -> Any:
                cached_result = cache.get(cache_key)
                if cached_result is not None:
                    return cached_result

                result = await func(*args, **kwargs)
                cache.set(cache_key, result, ttl)
                return result

            return wrapper
        return decorator


@sync_to_async
def get_user_with_profile(user_id: int):
    """Async-safe user profile fetch (prevents N+1 queries)."""
    from django.contrib.auth.models import User
    return User.objects.select_related('profile__role').get(pk=user_id)


@sync_to_async
def get_asset_summary(asset_id: int):
    """Async-safe asset fetch with related objects."""
    from asset.models import Asset
    return Asset.objects.select_related(
        'model', 'model__vendor', 'model__type', 'state', 'rackunit__rack', 'room'
    ).get(pk=asset_id)


@sync_to_async
def bulk_fetch_asset_states():
    """Async-safe bulk fetch of asset states (cacheable)."""
    from asset.models import AssetState
    return list(AssetState.objects.all().values())


@sync_to_async
def validate_asset_serial(serial_number: str) -> bool:
    """Async-safe check if serial number exists."""
    from asset.models import Asset
    return Asset.objects.filter(serial_number=serial_number).exists()


# ── Example of async view using these utilities (for reference) ──

# from rest_framework.views import APIView
# from rest_framework.response import Response
# from rest_framework.permissions import IsAuthenticated
#
# class AsyncAssetDetailView(APIView):
#     """Example async view pattern for Django 6.0."""
#     permission_classes = [IsAuthenticated]
#
#     async def get(self, request, asset_id):
#         try:
#             asset = await get_asset_summary(asset_id)
#             serializer = AssetSerializer(asset)
#             return Response(serializer.data)
#         except Asset.DoesNotExist:
#             return Response({'detail': 'Not found'}, status=404)
