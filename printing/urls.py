from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CategoryViewSet, LabelTemplateViewSet, ProductViewSet

# Le routeur génère automatiquement toutes les adresses standard pour l'API
router = DefaultRouter()
router.register(r'categories', CategoryViewSet)
router.register(r'templates', LabelTemplateViewSet)
router.register(r'products', ProductViewSet)

urlpatterns = [
    path('', include(router.urls)),
]