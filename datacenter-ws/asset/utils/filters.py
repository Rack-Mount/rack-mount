"""
asset/utils/filters.py
-----------------------
Django-filter FilterSet definitions for asset-related views.
"""

from django.utils.translation import gettext as _
from django_filters import rest_framework as df_filters

from asset.models import Asset, AssetRequest


class AssetFilter(df_filters.FilterSet):
    """FilterSet for :class:`~asset.views.AssetViewSet.AssetViewSet`."""

    not_in_rack = df_filters.BooleanFilter(
        method='filter_not_in_rack',
        label=_('Assets not installed in rack'),
    )

    def filter_not_in_rack(self, queryset, name, value):
        if value:
            return queryset.filter(rackunit__isnull=True)
        return queryset

    class Meta:
        model = Asset
        fields = [
            'hostname', 'sap_id', 'serial_number', 'order_id',
            'model', 'state', 'model__vendor', 'model__type',
        ]


class AssetRequestFilter(df_filters.FilterSet):
    """FilterSet for :class:`~asset.views.AssetRequestViewSet.AssetRequestViewSet`."""

    class Meta:
        model = AssetRequest
        fields = ['asset', 'request_type',
                  'status', 'created_by', 'assigned_to']
