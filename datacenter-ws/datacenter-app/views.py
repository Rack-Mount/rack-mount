from accounts.serializers import RoleSerializer
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
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
            },
        )
    },
    description='Returns basic info and role permissions for the currently authenticated user.',
)
class MeView(APIView):
    """GET /auth/me/ — available to any authenticated user."""

    def get(self, request):
        user = request.user
        role_data = None
        try:
            role_data = RoleSerializer(user.profile.role).data
        except Exception:  # noqa: BLE001 — catches RelatedObjectDoesNotExist and any profile misconfiguration
            pass

        return Response({
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'role': role_data,
        })
