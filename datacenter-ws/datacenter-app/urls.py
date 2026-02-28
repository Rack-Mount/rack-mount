"""
URL configuration for datacenter project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from .permissions import AccessListPermission
from django.conf.urls.static import static
from django.conf import settings
from location import urls as location_urls
from asset import urls as asset_urls
from django.urls import path, include
from django.contrib import admin
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView
from asset.views.ImageView import ImageView

admin.site.site_header = "Rack-Mount Data Center Admin"
admin.site.site_title = "Rack-Mount Data Center Admin Portal"
admin.site.index_title = "Welcome to Rack-Mount Data Center Portal"

schema_url_patterns = [
    path('location/', include(location_urls.urlpatterns)),
    path('asset/', include(asset_urls.urlpatterns)),
]

urlpatterns = [
    path('location/', include(location_urls.urlpatterns)),
    path('asset/', include(asset_urls.urlpatterns)),
    path('admin/', admin.site.urls),
    # path('', get_schema_view(
    #      title="Datacenter API",
    #      description="API app Datacenter",
    #      version="1.0.0",
    #      patterns=schema_url_patterns,
    #      public=True,
    #      permission_classes=[AccessListPermission |
    #                          permissions.IsAuthenticated]
    #      ), name='openapi-schema'),
    path('openapi', SpectacularAPIView.as_view(), name='schema'),
    path('swagger/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger'),
    path('', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
    path('api-auth/', include('rest_framework.urls', namespace='rest_framework')),
    # Image serving with on-the-fly resize support (?w=<width>)
    path('files/<path:filename>', ImageView.as_view(), name='image-serve'),
]

if settings.DEBUG:
    urlpatterns += static(
        settings.STATIC_URL,
        document_root=settings.STATIC_ROOT
    )
