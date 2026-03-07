from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView


@extend_schema(
    tags=['auth'],
    responses={
        200: {
            'type': 'object',
            'properties': {
                'id': {'type': 'integer'},
                'username': {'type': 'string'},
                'email': {'type': 'string'},
                'role': {
                    'type': 'object',
                    'properties': {
                        'id': {'type': 'integer'},
                        'name': {'type': 'string'},
                        'can_create': {'type': 'boolean'},
                        'can_edit': {'type': 'boolean'},
                        'can_delete': {'type': 'boolean'},
                        'can_import_export': {'type': 'boolean'},
                        'can_access_assets': {'type': 'boolean'},
                        'can_access_catalog': {'type': 'boolean'},
                        'can_manage_users': {'type': 'boolean'},
                    },
                },
            },
        }
    },
    description='Returns basic info and role permissions for the currently authenticated user.',
)
class MeView(APIView):
    """GET /auth/me/ — available to any authenticated user."""

    def get(self, request):
        user = request.user
        role_data = None
        try:
            role = user.profile.role
            role_data = {
                'id': role.id,
                'name': role.name,
                'can_create': role.can_create,
                'can_edit': role.can_edit,
                'can_delete': role.can_delete,
                'can_import_export': role.can_import_export,
                'can_access_assets': role.can_access_assets,
                'can_access_catalog': role.can_access_catalog,
                'can_manage_users': role.can_manage_users,
            }
        except Exception:
            pass

        return Response({
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'role': role_data,
        })
