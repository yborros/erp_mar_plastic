from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CategoryViewSet, LabelTemplateViewSet, ProductViewSet, USBPrintAPIView

router = DefaultRouter()
router.register(r'products', ProductViewSet)
router.register(r'categories', CategoryViewSet)
router.register(r'templates', LabelTemplateViewSet)

urlpatterns = [
    path('', include(router.urls)),
    # Juste 'print-usb/' car le préfixe 'api/' est déjà géré à la racine !
    path('print-usb/', USBPrintAPIView.as_view(), name='print-usb'),
]