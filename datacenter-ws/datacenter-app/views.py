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
            },
        }
    },
    description='Returns basic info about the currently authenticated user.',
)
class MeView(APIView):
    """GET /auth/me/ — available to any authenticated user."""

    def get(self, request):
        return Response({
            'id': request.user.id,
            'username': request.user.username,
        })
