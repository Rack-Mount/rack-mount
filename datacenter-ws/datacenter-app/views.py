from accounts.serializers import RoleSerializer
from drf_spectacular.utils import extend_schema, inline_serializer
from django.core.cache import cache
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


@extend_schema(
    tags=['auth'],
    responses={
        200: inline_serializer(
            name='MeResponse',
            fields={
                'id': serializers.IntegerField(),
                'username': serializers.CharField(),
                'email': serializers.EmailField(),
                'role': RoleSerializer(allow_null=True),
                'measurement_system': serializers.CharField(),
            },
        )
    },
    description='Returns basic info, role permissions, and user preferences for the currently authenticated user.',
)
class MeView(APIView):
    """GET /auth/me/ — available to any authenticated user. Cached per user for 5 minutes."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        cache_key = f"auth:me:user:{request.user.id}"
        cached_payload = cache.get(cache_key)
        if cached_payload is not None:
            return Response(cached_payload)

        user = request.user
        role_data = None
        measurement_system = 'auto'
        try:
            role_data = RoleSerializer(user.profile.role).data
            measurement_system = user.profile.measurement_system
        except Exception:  # noqa: BLE001 — catches RelatedObjectDoesNotExist and any profile misconfiguration
            pass

        payload = {
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'role': role_data,
            'measurement_system': measurement_system,
        }
        cache.set(cache_key, payload, 300)
        return Response(payload)
