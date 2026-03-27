"""Tests for auth flow, permissions, and user management viewset behavior."""

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import Role


class BaseAccountsTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()

    def _get_or_update_role(self, role_name, **flags):
        role, _ = Role.objects.get_or_create(name=role_name, defaults=flags)
        dirty_fields = []
        for field_name, expected in flags.items():
            if getattr(role, field_name) != expected:
                setattr(role, field_name, expected)
                dirty_fields.append(field_name)
        if dirty_fields:
            role.save(update_fields=dirty_fields)
        return role

    def _create_user_with_role(self, username, password, role):
        user = User.objects.create_user(username=username, password=password)
        user.profile.role = role
        user.profile.save(update_fields=['role'])
        return user


class UserManagementViewSetTests(BaseAccountsTestCase):
    def setUp(self):
        super().setUp()
        self.url = '/auth/users/'
        self.admin_role = self._get_or_update_role(
            Role.Name.ADMIN,
            can_manage_users=True,
        )
        self.viewer_role = self._get_or_update_role(
            Role.Name.VIEWER,
            can_manage_users=False,
        )

        self.admin_user = self._create_user_with_role(
            'admin-list',
            'Passw0rd!234',
            self.admin_role,
        )
        self.viewer_user = self._create_user_with_role(
            'viewer-list',
            'Passw0rd!234',
            self.viewer_role,
        )

    def test_user_list_allowed_for_admin(self):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 2)

    def test_user_list_forbidden_for_non_admin(self):
        self.client.force_authenticate(user=self.viewer_user)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_create_user_via_viewset(self):
        self.client.force_authenticate(user=self.admin_user)

        payload = {
            'username': 'created-user',
            'email': 'created@example.com',
            'password': 'StrongPassw0rd!123',
            'role_id': self.viewer_role.id,
        }
        response = self.client.post(self.url, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['username'], 'created-user')
        self.assertEqual(response.data['role']['id'], self.viewer_role.id)
        self.assertTrue(User.objects.filter(username='created-user').exists())

    def test_unauthenticated_cannot_access_user_list(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_non_admin_cannot_create_user(self):
        self.client.force_authenticate(user=self.viewer_user)
        payload = {
            'username': 'should-not-be-created',
            'email': 'x@example.com',
            'password': 'StrongPassw0rd!123',
            'role_id': self.viewer_role.id,
        }

        response = self.client.post(self.url, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_create_user_with_weak_password_returns_400(self):
        self.client.force_authenticate(user=self.admin_user)
        payload = {
            'username': 'weak-pw-user',
            'email': 'weak@example.com',
            'password': '123',
            'role_id': self.viewer_role.id,
        }

        response = self.client.post(self.url, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_can_retrieve_single_user(self):
        self.client.force_authenticate(user=self.admin_user)
        url = f'{self.url}{self.viewer_user.id}/'

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['username'], self.viewer_user.username)

    def test_admin_can_partial_update_user(self):
        self.client.force_authenticate(user=self.admin_user)
        url = f'{self.url}{self.viewer_user.id}/'

        response = self.client.patch(
            url, {'email': 'updated@example.com'}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.viewer_user.refresh_from_db()
        self.assertEqual(self.viewer_user.email, 'updated@example.com')

    def test_update_user_with_duplicate_username_returns_400(self):
        self.client.force_authenticate(user=self.admin_user)
        url = f'{self.url}{self.viewer_user.id}/'

        response = self.client.patch(
            url, {'username': self.admin_user.username}, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_can_delete_user(self):
        target = self._create_user_with_role(
            'to-delete', 'Passw0rd!234', self.viewer_role)
        self.client.force_authenticate(user=self.admin_user)
        url = f'{self.url}{target.id}/'

        response = self.client.delete(url)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(User.objects.filter(pk=target.id).exists())

    def test_admin_cannot_delete_self(self):
        self.client.force_authenticate(user=self.admin_user)
        url = f'{self.url}{self.admin_user.id}/'

        response = self.client.delete(url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class JwtFlowTests(BaseAccountsTestCase):
    def setUp(self):
        super().setUp()
        self.token_url = '/auth/token/'
        self.refresh_url = '/auth/token/refresh/'
        self.blacklist_url = '/auth/token/blacklist/'
        self.logout_url = '/auth/logout/'

        viewer_role = self._get_or_update_role(Role.Name.VIEWER)
        self.user = self._create_user_with_role(
            'jwt-user',
            'Passw0rd!234',
            viewer_role,
        )

    def _login(self, username='jwt-user', password='Passw0rd!234'):
        return self.client.post(
            self.token_url,
            {'username': username, 'password': password},
            format='json',
        )

    def test_token_obtain_success_returns_access_and_refresh(self):
        response = self._login()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.assertEqual(response.data['username'], self.user.username)

    def test_token_obtain_invalid_credentials_returns_401(self):
        response = self._login(password='wrong-password')

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_token_refresh_with_valid_refresh_returns_new_access(self):
        login_response = self._login()
        refresh_token = login_response.data['refresh']

        response = self.client.post(
            self.refresh_url,
            {'refresh': refresh_token},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertEqual(response.data['username'], self.user.username)

    def test_blacklisted_refresh_token_cannot_be_used_again(self):
        login_response = self._login()
        access_token = login_response.data['access']
        refresh_token = login_response.data['refresh']

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access_token}')
        blacklist_response = self.client.post(
            self.blacklist_url,
            {'refresh': refresh_token},
            format='json',
        )
        self.assertEqual(blacklist_response.status_code, status.HTTP_200_OK)

        self.client.credentials()
        refresh_response = self.client.post(
            self.refresh_url,
            {'refresh': refresh_token},
            format='json',
        )
        self.assertEqual(refresh_response.status_code,
                         status.HTTP_401_UNAUTHORIZED)

    def test_logout_blacklists_refresh_and_blocks_future_refresh(self):
        login_response = self._login()
        access_token = login_response.data['access']
        refresh_token = login_response.data['refresh']

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access_token}')
        logout_response = self.client.post(
            self.logout_url,
            {'refresh': refresh_token},
            format='json',
        )
        self.assertEqual(logout_response.status_code, status.HTTP_200_OK)

        self.client.credentials()
        refresh_response = self.client.post(
            self.refresh_url,
            {'refresh': refresh_token},
            format='json',
        )
        self.assertEqual(refresh_response.status_code,
                         status.HTTP_401_UNAUTHORIZED)

    def test_token_obtain_missing_credentials_returns_400(self):
        response = self.client.post(self.token_url, {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_logout_without_refresh_token_returns_400(self):
        login_response = self._login()
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {login_response.data["access"]}')

        response = self.client.post(self.logout_url, {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_logout_with_another_users_token_returns_403(self):
        other_role = self._get_or_update_role(Role.Name.VIEWER)
        other_user = self._create_user_with_role(
            'other-jwt-user', 'Passw0rd!234', other_role)
        other_login = self.client.post(
            self.token_url,
            {'username': other_user.username, 'password': 'Passw0rd!234'},
            format='json',
        )
        other_refresh = other_login.data['refresh']

        own_login = self._login()
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {own_login.data["access"]}')

        response = self.client.post(
            self.logout_url, {'refresh': other_refresh}, format='json')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_logout_unauthenticated_returns_401(self):
        login_response = self._login()
        refresh_token = login_response.data['refresh']

        response = self.client.post(
            self.logout_url, {'refresh': refresh_token}, format='json')

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class RoleListViewTests(BaseAccountsTestCase):
    def setUp(self):
        super().setUp()
        self.url = '/auth/roles/'
        self.admin_role = self._get_or_update_role(
            Role.Name.ADMIN,
            can_manage_users=True,
        )
        self.viewer_role = self._get_or_update_role(
            Role.Name.VIEWER,
            can_manage_users=False,
        )
        self.admin_user = self._create_user_with_role(
            'role-admin',
            'Passw0rd!234',
            self.admin_role,
        )
        self.viewer_user = self._create_user_with_role(
            'role-viewer',
            'Passw0rd!234',
            self.viewer_role,
        )

    def test_admin_can_list_roles(self):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 1)

    def test_non_admin_cannot_list_roles(self):
        self.client.force_authenticate(user=self.viewer_user)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_cannot_list_roles(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class ChangePasswordViewTests(BaseAccountsTestCase):
    def setUp(self):
        super().setUp()
        self.url = '/auth/change-password/'
        viewer_role = self._get_or_update_role(Role.Name.VIEWER)
        self.user = self._create_user_with_role(
            'changepw-user',
            'OldPassw0rd!',
            viewer_role,
        )

    def test_change_password_success(self):
        self.client.force_authenticate(user=self.user)
        payload = {
            'current_password': 'OldPassw0rd!',
            'new_password': 'NewPassw0rd!99',
        }

        response = self.client.post(self.url, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('NewPassw0rd!99'))

    def test_change_password_wrong_current_returns_400(self):
        self.client.force_authenticate(user=self.user)
        payload = {
            'current_password': 'WrongPassword!',
            'new_password': 'NewPassw0rd!99',
        }

        response = self.client.post(self.url, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_change_password_unauthenticated_returns_401(self):
        payload = {
            'current_password': 'OldPassw0rd!',
            'new_password': 'NewPassw0rd!99',
        }

        response = self.client.post(self.url, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class UserPreferencesViewTests(BaseAccountsTestCase):
    def setUp(self):
        super().setUp()
        self.url = '/auth/preferences/'
        viewer_role = self._get_or_update_role(Role.Name.VIEWER)
        self.user = self._create_user_with_role(
            'prefs-user',
            'Passw0rd!234',
            viewer_role,
        )

    def test_get_preferences_returns_200(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('measurement_system', response.data)

    def test_patch_preferences_valid_returns_200(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.patch(
            self.url, {'measurement_system': 'metric'}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['measurement_system'], 'metric')
        self.user.profile.refresh_from_db()
        self.assertEqual(self.user.profile.measurement_system, 'metric')

    def test_patch_preferences_invalid_value_returns_400(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.patch(
            self.url, {'measurement_system': 'invalid'}, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_preferences_unauthenticated_returns_401(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
