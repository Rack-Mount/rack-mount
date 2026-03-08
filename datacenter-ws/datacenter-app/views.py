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
                        'can_view_assets': {'type': 'boolean'},
                        'can_create_assets': {'type': 'boolean'},
                        'can_edit_assets': {'type': 'boolean'},
                        'can_delete_assets': {'type': 'boolean'},
                        'can_import_export_assets': {'type': 'boolean'},
                        'can_clone_assets': {'type': 'boolean'},
                        'can_view_catalog': {'type': 'boolean'},
                        'can_create_catalog': {'type': 'boolean'},
                        'can_edit_catalog': {'type': 'boolean'},
                        'can_delete_catalog': {'type': 'boolean'},
                        'can_import_catalog': {'type': 'boolean'},
                        'can_view_infrastructure': {'type': 'boolean'},
                        'can_create_racks': {'type': 'boolean'},
                        'can_edit_racks': {'type': 'boolean'},
                        'can_delete_racks': {'type': 'boolean'},
                        'can_edit_map': {'type': 'boolean'},
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
                'can_view_assets': role.can_view_assets,
                'can_create_assets': role.can_create_assets,
                'can_edit_assets': role.can_edit_assets,
                'can_delete_assets': role.can_delete_assets,
                'can_import_export_assets': role.can_import_export_assets,
                'can_clone_assets': role.can_clone_assets,
                'can_view_catalog': role.can_view_catalog,
                'can_create_catalog': role.can_create_catalog,
                'can_edit_catalog': role.can_edit_catalog,
                'can_delete_catalog': role.can_delete_catalog,
                'can_import_catalog': role.can_import_catalog,
                'can_view_infrastructure': role.can_view_infrastructure,
                'can_create_racks': role.can_create_racks,
                'can_edit_racks': role.can_edit_racks,
                'can_delete_racks': role.can_delete_racks,
                'can_edit_map': role.can_edit_map,
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
