from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import OrdreFabricationViewSet, fiche_fabrication_print_view

app_name = 'production'

router = DefaultRouter()
router.register(r'of', OrdreFabricationViewSet, basename='ordre-fabrication')

urlpatterns = [
    # 1. Route d'impression directe : /api/production/of/<id>/print/
    path('of/<int:of_id>/print/', fiche_fabrication_print_view, name='fiche_of_print_direct'),
    
    # 2. Routes API générées par DRF : /api/production/of/
    path('', include(router.urls)),
]