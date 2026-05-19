from django.urls import path, include
from rest_framework.routers import DefaultRouter
# On remplace USBPrintAPIView par PrintLabelAPIView dans l'import
from .views import CategoryViewSet, LabelTemplateViewSet, ProductViewSet, PrintLabelAPIView

router = DefaultRouter()
router.register(r'products', ProductViewSet)
router.register(r'categories', CategoryViewSet)
router.register(r'templates', LabelTemplateViewSet)

urlpatterns = [
    path('', include(router.urls)),
    
    # L'unique route d'impression qui gère intelligemment l'USB ou l'IP selon le PC
    path('print/', PrintLabelAPIView.as_view(), name='print-label'),
]