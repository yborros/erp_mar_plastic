from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import StockOverviewViewSet, StockMovementHistoryViewSet, RecordStockMovementAPIView

router = DefaultRouter()
router.register(r'items', StockOverviewViewSet, basename='stock-items')
router.register(r'history', StockMovementHistoryViewSet, basename='stock-history')

urlpatterns = [
    path('', include(router.urls)),
    path('movement/', RecordStockMovementAPIView.as_view(), name='record-stock-movement'),
]