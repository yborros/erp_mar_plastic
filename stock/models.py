from django.db import models
from catalog.models import Product


class StockMovement(models.Model):
    MOVEMENT_TYPES = [
        ('RECEPTION', 'Entrée en stock (Achat / Réception)'),
        ('ADJUSTMENT', 'Ajustement inventaire (Écart / Recomptage)'),
        ('PRINT_CONSUMPTION', 'Consommation étiquetage (Sortie atelier)'),
        ('SCRAP', 'Rebut / Perte / Déchet'),
    ]

    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='stock_movements',
        verbose_name="Article"
    )
    movement_type = models.CharField(
        max_length=30,
        choices=MOVEMENT_TYPES,
        verbose_name="Type de mouvement"
    )
    # Quantité mouvementée : positive pour une entrée/ajustement +, négative pour une sortie
    quantity = models.IntegerField(verbose_name="Quantité mouvementée")
    stock_after = models.IntegerField(verbose_name="Stock résultant")
    note = models.CharField(
        max_length=255, 
        blank=True, 
        null=True, 
        verbose_name="Justification (ex: N° BL Fournisseur, Écart d'inventaire)"
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Date & Heure")

    class Meta:
        db_table = 'stock_movement'
        verbose_name = "Mouvement de stock"
        verbose_name_plural = "Mouvements de stock"
        ordering = ['-created_at']

    def __str__(self):
        sign = "+" if self.quantity > 0 else ""
        return f"[{self.created_at.strftime('%d/%m/%Y %H:%M')}] {self.product.sku} : {sign}{self.quantity} ({self.get_movement_type_display()})"