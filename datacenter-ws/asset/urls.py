from django.urls import path, include
"""
This module defines the URL patterns for the asset application.

It includes the following view sets:
- AssetViewSet: Handles CRUD operations for assets.
- AssetModelViewSet: Handles CRUD operations for asset models.
- VendorViewSet: Handles CRUD operations for vendors.
- AssetStateViewSet: Handles CRUD operations for asset states.
- AssetTypeViewSet: Handles CRUD operations for asset types.

The URL patterns are registered with a DefaultRouter from the Django REST framework,
which automatically generates the appropriate URLs for the view sets without trailing slashes.

URL patterns:
- /asset
- /asset_model
- /vendor
- /asset_state
- /asset_type
"""
from rest_framework.routers import DefaultRouter
from asset.views import AssetViewSet, AssetModelViewSet, AssetModelPortViewSet, VendorViewSet, AssetStateViewSet, AssetTypeViewSet, RackViewSet, RackTypeViewSet, RackUnitViewSet, AssetCustomFieldViewSet, GenericComponentViewSet
from asset.views.AssetExportView import AssetExportView
from asset.views.AssetModelImportView import AssetModelImportView
from asset.views.AssetImportCsvView import AssetImportCsvView
from asset.views.CatalogExportView import CatalogExportView
from asset.views.CatalogImportView import CatalogImportView
from asset.views.PortAnalyzeView import PortAnalyzeView
from asset.views.PortAnnotateView import PortAnnotateView
from asset.views.PortClickAnalyzeView import PortClickAnalyzeView
from asset.views.PortCorrectionView import PortCorrectionView
from asset.views.PrivateMediaSignedUrlView import PrivateMediaSignedUrlView

router = DefaultRouter(trailing_slash=False)
router.register('asset', AssetViewSet)
router.register('asset_model', AssetModelViewSet)
router.register('asset_model_port', AssetModelPortViewSet)
router.register('vendor', VendorViewSet)
router.register('asset_state', AssetStateViewSet)
router.register('asset_type', AssetTypeViewSet)
router.register('rack', RackViewSet)
router.register('rack_type', RackTypeViewSet)
router.register('rack_unit', RackUnitViewSet)
router.register('asset_custom_field', AssetCustomFieldViewSet)
router.register('generic_component', GenericComponentViewSet)

urlpatterns = [
    path('asset/export', AssetExportView.as_view(), name='asset-export'),
    path('asset/import-csv', AssetImportCsvView.as_view(), name='asset-import-csv'),
    path('asset-model/import', AssetModelImportView.as_view(),
         name='asset-model-import'),
    path('catalog/export', CatalogExportView.as_view(), name='catalog-export'),
    path('catalog/import', CatalogImportView.as_view(), name='catalog-import'),
    path('port-analyze', PortAnalyzeView.as_view(), name='port-analyze'),
    path('port-annotate', PortAnnotateView.as_view(), name='port-annotate'),
    path('port-click-analyze', PortClickAnalyzeView.as_view(),
         name='port-click-analyze'),
    path('port-correction', PortCorrectionView.as_view(), name='port-correction'),
    path('private-media-url', PrivateMediaSignedUrlView.as_view(),
         name='private-media-url'),
    path('', include(router.urls)),
]
