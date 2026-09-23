from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    CategoryViewSet, 
    LabelTemplateViewSet, 
    ProductViewSet, 
    ClientViewSet, 
    ConfigurationImprimanteViewSet,
    ImpressionEtiquetteViewSet,
    PrintLabelAPIView
)

router = DefaultRouter()
router.register(r'products', ProductViewSet)
router.register(r'categories', CategoryViewSet)
router.register(r'templates', LabelTemplateViewSet)
router.register(r'clients', ClientViewSet)
router.register(r'printers', ConfigurationImprimanteViewSet)
router.register(r'history', ImpressionEtiquetteViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('print/', PrintLabelAPIView.as_view(), name='print-label'),
]