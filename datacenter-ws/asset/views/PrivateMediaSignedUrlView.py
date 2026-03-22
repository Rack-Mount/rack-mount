import pathlib

from django.conf import settings
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import ViewModelTrainingStatusPermission
from asset.utils.signed_url import generate_signed_url


class PrivateMediaSignedUrlView(APIView):
    """
    POST /asset/private-media-url

    Returns a short-lived signed URL for files under PRIVATE_MEDIA_SUBDIR.
    """

    permission_classes = [IsAuthenticated, ViewModelTrainingStatusPermission]

    @extend_schema(
        request=inline_serializer(
            name='PrivateMediaSignedUrlRequest',
            fields={
                'filename': serializers.CharField(),
                'expiry_seconds': serializers.IntegerField(required=False),
            },
        ),
        responses={
            200: inline_serializer(
                name='PrivateMediaSignedUrlResponse',
                fields={
                    'url': serializers.CharField(),
                    'expiry_seconds': serializers.IntegerField(),
                },
            )
        },
    )
    def post(self, request):
        filename = (request.data.get('filename') or '').strip()
        expiry_seconds = request.data.get('expiry_seconds')

        if not self._is_safe_relpath(filename):
            return Response(
                {'detail': 'Invalid filename path.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        private_subdir = getattr(settings, 'PRIVATE_MEDIA_SUBDIR', 'private')
        if not filename.startswith(private_subdir + '/'):
            return Response(
                {'detail': 'Signed URL can be generated only for private media.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        relative_private_path = filename[len(private_subdir) + 1:]

        default_expiry = int(
            getattr(settings, 'SIGNED_URL_EXPIRY_SECONDS', 259200))
        if expiry_seconds is None:
            expiry_seconds = default_expiry
        else:
            try:
                expiry_seconds = int(expiry_seconds)
            except (TypeError, ValueError):
                return Response(
                    {'detail': 'expiry_seconds must be an integer.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Clamp expiry to sane bounds to avoid unbounded links.
        expiry_seconds = max(60, min(expiry_seconds, default_expiry))

        try:
            signed_url = generate_signed_url(
                relative_private_path,
                expiry_seconds=expiry_seconds,
            )
        except RuntimeError as exc:
            return Response(
                {'detail': str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(
            {
                'url': signed_url,
                'expiry_seconds': expiry_seconds,
            },
            status=status.HTTP_200_OK,
        )

    @staticmethod
    def _is_safe_relpath(relpath: str) -> bool:
        if not relpath or '\x00' in relpath:
            return False
        if relpath.startswith('/'):
            return False
        parts = pathlib.PurePosixPath(relpath).parts
        return not any(part in ('..', '.') for part in parts)
