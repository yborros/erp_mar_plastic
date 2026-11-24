from rest_framework import serializers
from .models import StockMovement
from catalog.models import Product


class StockMovementSerializer(serializers.ModelSerializer):
    product_sku = serializers.CharField(source='product.sku', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)
    movement_type_display = serializers.CharField(source='get_movement_type_display', read_only=True)

    class Meta:
        model = StockMovement
        fields = [
            'id', 'product', 'product_sku', 'product_name', 
            'movement_type', 'movement_type_display', 
            'quantity', 'stock_after', 'note', 'created_at'
        ]


class StockItemSerializer(serializers.ModelSerializer):
    """Vue simplifiée d'un article pour le tableau de bord de stock"""
    category_name = serializers.CharField(source='category.name', read_only=True)
    unit_symbol = serializers.CharField(source='unit.abbreviation', read_only=True, default='')

    class Meta:
        model = Product
        fields = [
            'id', 'sku', 'name', 'category', 'category_name', 
            'unit_symbol', 'stock_actuel', 'seuil_alerte', 'is_low_stock'
        ]