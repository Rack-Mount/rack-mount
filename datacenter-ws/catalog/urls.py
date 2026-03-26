from django.urls import path, include
from rest_framework.routers import DefaultRouter
from catalog.views import (
    VendorViewSet, AssetTypeViewSet, AssetModelViewSet, AssetModelPortViewSet,
    AssetModelImportView, CatalogExportView, CatalogImportView,
    PortAnalyzeView, PortAnnotateView, PortClickAnalyzeView, PortCorrectionView,
)

router = DefaultRouter(trailing_slash=False)
router.register('vendor', VendorViewSet)
router.register('asset_type', AssetTypeViewSet)
router.register('asset_model', AssetModelViewSet)
router.register('asset_model_port', AssetModelPortViewSet)

urlpatterns = [
    path('asset-model/import', AssetModelImportView.as_view(), name='asset-model-import'),
    path('catalog/export', CatalogExportView.as_view(), name='catalog-export'),
    path('catalog/import', CatalogImportView.as_view(), name='catalog-import'),
    path('port-analyze', PortAnalyzeView.as_view(), name='port-analyze'),
    path('port-annotate', PortAnnotateView.as_view(), name='port-annotate'),
    path('port-click-analyze', PortClickAnalyzeView.as_view(), name='port-click-analyze'),
    path('port-correction', PortCorrectionView.as_view(), name='port-correction'),
    path('', include(router.urls)),
]
