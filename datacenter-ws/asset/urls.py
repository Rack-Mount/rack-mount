from django.urls import path, include
from rest_framework.routers import DefaultRouter
from asset.views import (
    AssetViewSet, AssetStateViewSet, RackUnitViewSet,
    AssetCustomFieldViewSet, GenericComponentViewSet, AssetRequestViewSet,
    AssetNetworkInterfaceViewSet,
)
from asset.views.AssetExportView import AssetExportView
from asset.views.AssetImportCsvView import AssetImportCsvView
from asset.views.PrivateMediaSignedUrlView import PrivateMediaSignedUrlView

router = DefaultRouter(trailing_slash=False)
router.register('asset', AssetViewSet)
router.register('asset_state', AssetStateViewSet)
router.register('rack_unit', RackUnitViewSet)
router.register('asset_custom_field', AssetCustomFieldViewSet)
router.register('generic_component', GenericComponentViewSet)
router.register('asset_request', AssetRequestViewSet)
router.register('network_interface', AssetNetworkInterfaceViewSet)

urlpatterns = [
    path('asset/export', AssetExportView.as_view(), name='asset-export'),
    path('asset/import-csv', AssetImportCsvView.as_view(), name='asset-import-csv'),
    path('private-media-url', PrivateMediaSignedUrlView.as_view(),
         name='private-media-url'),
    path('', include(router.urls)),
]
