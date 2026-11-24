from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, viewsets
from catalog.models import Product
from .models import StockMovement
from .serializers import StockMovementSerializer, StockItemSerializer


class StockOverviewViewSet(viewsets.ReadOnlyModelViewSet):
    """Renvoie la liste des articles gérés en stock avec statut d'alerte"""
    queryset = Product.objects.select_related('unit', 'category').all().order_by('name')
    serializer_class = StockItemSerializer


class StockMovementHistoryViewSet(viewsets.ReadOnlyModelViewSet):
    """Historique complet et traçable des mouvements"""
    queryset = StockMovement.objects.select_related('product', 'product__unit').all()
    serializer_class = StockMovementSerializer


class RecordStockMovementAPIView(APIView):
    """
    Point d'entrée pour :
    - Réception d'achat (mode='ADD')
    - Ajustement d'inventaire physique (mode='SET')
    """
    def post(self, request, *args, **kwargs):
        product_id = request.data.get('product_id')
        mode = request.data.get('mode', 'ADD')
        note = request.data.get('note', '')

        try:
            quantity = int(request.data.get('quantity', 0))
        except (ValueError, TypeError):
            return Response(
                {"status": "error", "message": "Quantité invalide."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not product_id:
            return Response(
                {"status": "error", "message": "L'identifiant de l'article est obligatoire."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            product = Product.objects.select_related('unit').get(id=product_id)
        except Product.DoesNotExist:
            return Response(
                {"status": "error", "message": "Article introuvable."},
                status=status.HTTP_404_NOT_FOUND
            )

        unit_str = product.unit.abbreviation if hasattr(product, 'unit') and product.unit else 'U'

        if mode == 'SET':
            # Inventaire physique
            diff = quantity - product.stock_actuel
            product.stock_actuel = quantity
            product.save()

            movement = StockMovement.objects.create(
                product=product,
                movement_type='ADJUSTMENT',
                quantity=diff,
                stock_after=product.stock_actuel,
                note=note or "Ajustement inventaire"
            )
            msg = f"Inventaire ajusté : [{product.sku}] {product.name} fixé à {product.stock_actuel} {unit_str}."

        else:
            # Réception achat
            product.stock_actuel += quantity
            if product.stock_actuel < 0:
                product.stock_actuel = 0
            product.save()

            movement = StockMovement.objects.create(
                product=product,
                movement_type='RECEPTION',
                quantity=quantity,
                stock_after=product.stock_actuel,
                note=note or "Réception achat"
            )
            msg = f"Réception enregistrée : +{quantity} {unit_str} sur [{product.sku}] {product.name}."

        return Response({
            "status": "success",
            "message": msg,
            "product_id": product.id,
            "current_stock": product.stock_actuel,
            "is_low_stock": getattr(product, 'is_low_stock', False)
        }, status=status.HTTP_200_OK)