from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.translation import gettext_lazy as _
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers
from .models import Role, UserProfile


class UserPreferencesSerializer(serializers.Serializer):
    measurement_system = serializers.ChoiceField(
        choices=UserProfile.MeasurementSystem.choices,
    )

    def update(self, instance, validated_data):
        profile = instance.profile
        profile.measurement_system = validated_data['measurement_system']
        profile.save(update_fields=['measurement_system'])
        return instance


class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = [
            'id', 'name',
            # Assets
            'can_view_assets', 'can_create_assets', 'can_edit_assets',
            'can_delete_assets', 'can_import_assets', 'can_export_assets', 'can_clone_assets',
            # Catalog
            'can_view_catalog', 'can_create_catalog', 'can_edit_catalog',
            'can_delete_catalog', 'can_import_catalog',
            # Infrastructure
            'can_view_infrastructure',
            'can_create_racks', 'can_edit_racks', 'can_delete_racks',
            'can_edit_map',
            # Warehouse
            'can_view_warehouse', 'can_manage_warehouse',
            # Asset requests
            'can_view_requests', 'can_create_requests', 'can_manage_requests',
            # Admin
            'can_manage_users',
            # Model training
            'can_provide_port_training', 'can_provide_port_corrections',
            'can_view_model_training_status',
        ]
        read_only_fields = fields


class UserListSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    role_id = serializers.PrimaryKeyRelatedField(
        queryset=Role.objects.all(),
        source='profile.role',
        write_only=True,
        required=False,
    )

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'is_active',
                  'date_joined', 'role', 'role_id']
        read_only_fields = ['id', 'username', 'date_joined']

    @extend_schema_field(RoleSerializer)
    def get_role(self, obj):
        try:
            return RoleSerializer(obj.profile.role).data
        except UserProfile.DoesNotExist:
            return None


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    role_id = serializers.PrimaryKeyRelatedField(
        queryset=Role.objects.all(),
        source='profile.role',
    )

    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'role_id']

    def validate_password(self, value):
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value

    def create(self, validated_data):
        profile_data = validated_data.pop('profile')
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        # The signal creates a default UserProfile; update it with the chosen role.
        user.profile.role = profile_data['role']
        user.profile.save()
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    username = serializers.CharField(required=False, max_length=150)
    role_id = serializers.PrimaryKeyRelatedField(
        queryset=Role.objects.all(),
        source='profile.role',
        required=False,
    )
    password = serializers.CharField(
        write_only=True, min_length=8, required=False)

    class Meta:
        model = User
        fields = ['username', 'email', 'is_active', 'role_id', 'password']

    def validate_username(self, value):
        value = value.strip()
        qs = User.objects.filter(username=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                _('A user with this username already exists.'))
        return value

    def validate_password(self, value):
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value

    def update(self, instance, validated_data):
        profile_data = validated_data.pop('profile', None)
        password = validated_data.pop('password', None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if password:
            instance.set_password(password)

        instance.save()

        if profile_data:
            profile, _ = UserProfile.objects.get_or_create(
                user=instance,
                defaults={'role': Role.objects.get(name=Role.Name.VIEWER)},
            )
            profile.role = profile_data['role']
            profile.save()

        return instance


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_new_password(self, value):
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value


class LogoutRequestSerializer(serializers.Serializer):
    refresh = serializers.CharField(required=True)


class AuthDetailSerializer(serializers.Serializer):
    detail = serializers.CharField()


class CookieTokenObtainRequestSerializer(serializers.Serializer):
    username = serializers.CharField(required=True)
    password = serializers.CharField(required=True, write_only=True)


class TokenObtainResponseSerializer(AuthDetailSerializer):
    username = serializers.CharField()
    access = serializers.CharField()
    refresh = serializers.CharField()
    role = RoleSerializer(allow_null=True)


class TokenRefreshRequestSerializer(serializers.Serializer):
    refresh = serializers.CharField(required=True)


class TokenRefreshResponseSerializer(AuthDetailSerializer):
    access = serializers.CharField()
    refresh = serializers.CharField(allow_null=True)
    username = serializers.CharField(allow_null=True)
    role = RoleSerializer(allow_null=True)


# Keep old name as alias for backwards compatibility with existing OpenAPI imports
CookieTokenObtainResponseSerializer = TokenObtainResponseSerializer
