from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from catalog.views import get_subcategories_api, get_products_by_category_api

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('printing.urls')),
    path('api/production/', include('production.urls')),
    path('api/stock/', include('stock.urls')),

    # Cascades Parent > Enfant > Articles
    path('admin-api/subcategories/', get_subcategories_api, name='admin_subcategories'),
    path('admin-api/products-by-category/', get_products_by_category_api, name='admin_products_by_category'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)