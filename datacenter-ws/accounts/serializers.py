from django.contrib.auth.models import User
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers
from .models import Role, UserProfile


class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = [
            'id', 'name',
            # Assets
            'can_view_assets', 'can_create_assets', 'can_edit_assets',
            'can_delete_assets', 'can_import_export_assets', 'can_clone_assets',
            # Catalog
            'can_view_catalog', 'can_create_catalog', 'can_edit_catalog',
            'can_delete_catalog', 'can_import_catalog',
            # Infrastructure
            'can_create_racks', 'can_edit_racks', 'can_delete_racks',
            'can_edit_map',
            # Admin
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
                'A user with this username already exists.')
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
