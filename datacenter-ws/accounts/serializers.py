from django.contrib.auth.models import User
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers
from .models import Role, UserProfile


class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = [
            'id', 'name',
            'can_create', 'can_edit', 'can_delete',
            'can_import_export', 'can_access_assets', 'can_access_catalog',
            'can_manage_users',
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
    role_id = serializers.PrimaryKeyRelatedField(
        queryset=Role.objects.all(),
        source='profile.role',
        required=False,
    )
    password = serializers.CharField(
        write_only=True, min_length=8, required=False)

    class Meta:
        model = User
        fields = ['email', 'is_active', 'role_id', 'password']

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
