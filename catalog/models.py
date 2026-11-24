from django.db import models
from django.core.exceptions import ValidationError
import re


class Unit(models.Model):
    INPUT_MODES = [
        ('STANDARD', "Standard (Quantité simple)"),
        ('WEIGHT', "Poids (Demander le poids)"),
        ('PACK_COUNT', "Conditionnement (Unités par carton)"),
    ]
    name = models.CharField(max_length=50, verbose_name="Nom de l'unité")
    abbreviation = models.CharField(max_length=10, unique=True, verbose_name="Symbole (ex: kg, U)")
    input_mode = models.CharField(max_length=20, choices=INPUT_MODES, default='STANDARD')
    
    base_unit = models.ForeignKey(
        'self', 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='sub_units'
    )
    conversion_factor = models.DecimalField(max_digits=12, decimal_places=6, default=1.0)

    class Meta:
        db_table = 'printing_unit'
        verbose_name = "Unité"
        verbose_name_plural = "Unités"

    def __str__(self):
        return f"{self.name} ({self.abbreviation})"


class Category(models.Model):
    """Ex: 'Emballages & Consommables' (mère), 'Cartons' (fille), 'Bobines' (mère/fille)"""
    name = models.CharField(max_length=100, verbose_name="Nom de la catégorie")
    parent = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='subcategories',
        verbose_name="Catégorie parente (mère)"
    )
    description = models.TextField(blank=True, null=True, verbose_name="Description")
    
    is_printable = models.BooleanField(
        default=True,
        verbose_name="Actif pour l'étiquetage atelier",
        help_text="Décochez pour masquer cette catégorie du catalogue d'étiquetage (ex: Cartons, Consommables, Matières)"
    )
    default_template = models.ForeignKey(
        'printing.LabelTemplate', 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name="default_for_categories",
        verbose_name="Template d'impression par défaut"
    )

    class Meta:
        db_table = 'printing_category'
        verbose_name = "Catégorie"
        verbose_name_plural = "Catégories"
        unique_together = ('parent', 'name')

    def get_full_name(self):
        """Affiche l'arborescence (ex: Emballages > Cartons)."""
        if self.parent:
            return f"{self.parent.get_full_name()} > {self.name}"
        return self.name

    def get_all_attribute_definitions(self):
        """Récupère les caractéristiques de la catégorie et de ses parents sans doublon."""
        attrs_dict = {attr.id: attr for attr in self.attribute_definitions.all()}
        if self.parent:
            for parent_attr in self.parent.get_all_attribute_definitions():
                if parent_attr.id not in attrs_dict:
                    attrs_dict[parent_attr.id] = parent_attr
        return list(attrs_dict.values())

    def __str__(self):
        return self.get_full_name()


class AttributeDefinition(models.Model):
    """
    Définition d'une caractéristique technique attachée à une Catégorie.
    """
    DATA_TYPE_CHOICES = [
        ('NUMBER', 'Nombre décimal ou entier (ex: 50, 42.5)'),
        ('INTEGER', 'Nombre entier strict (ex: 500, 12)'),
        ('CHOICE', 'Liste déroulante / Choix fermé (défini dans options)'),
        ('TEXT', 'Texte libre'),
        ('BOOLEAN', 'Oui / Non'),
    ]

    category = models.ForeignKey(
        Category, 
        on_delete=models.CASCADE, 
        related_name='attribute_definitions',
        verbose_name="Catégorie"
    )
    name = models.CharField(max_length=100, verbose_name="Nom de la caractéristique")
    data_type = models.CharField(
        max_length=20, 
        choices=DATA_TYPE_CHOICES, 
        default='NUMBER', 
        verbose_name="Type de donnée"
    )
    unit = models.ForeignKey(
        Unit, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        verbose_name="Unité de mesure"
    )
    options = models.CharField(
        max_length=500, 
        blank=True, 
        null=True, 
        help_text="Pour les choix, séparez par des virgules (ex: PEBD, PEHD, PP, CPP)",
        verbose_name="Options autorisées"
    )
    visible_pesee = models.BooleanField(
        default=True,
        verbose_name="Visible au poste de pesée / atelier",
        help_text="Cochez pour demander la saisie de cette caractéristique à l'employé lors de la pesée bobine."
    )

    class Meta:
        db_table = 'printing_attributedefinition'
        verbose_name = "Définition de caractéristique"
        verbose_name_plural = "Définitions de caractéristiques"
        unique_together = ('category', 'name')

    def get_options_list(self):
        if not self.options:
            return []
        return [opt.strip() for opt in self.options.split(',') if opt.strip()]

    def __str__(self):
        unit_str = f" [{self.unit.abbreviation}]" if self.unit else ""
        return f"{self.name}{unit_str} ({self.get_data_type_display()})"


class Product(models.Model):
    name = models.CharField(max_length=200, verbose_name="Nom du produit")
    sku = models.CharField(max_length=100, unique=True, verbose_name="Référence / SKU")
    category = models.ForeignKey(
        Category, 
        on_delete=models.SET_NULL, 
        null=True, 
        verbose_name="Catégorie", 
        related_name="products"
    )
    unit = models.ForeignKey(
        Unit, 
        on_delete=models.PROTECT, 
        verbose_name="Unité de mesure"
    )
    custom_template = models.ForeignKey(
        'printing.LabelTemplate', 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name="custom_products",
        verbose_name="Template spécifique (écrase celui de la catégorie)"
    )

    # --- SUIVI DES STOCKS ---
    stock_actuel = models.IntegerField(default=0, verbose_name="Stock disponible")
    seuil_alerte = models.IntegerField(default=50, verbose_name="Seuil d'alerte stock bas")

    # --- EMBALLAGE / SUPPORT D'EXPÉDITION PAR DÉFAUT ---
    default_packaging = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='packaged_items',
        verbose_name="Emballage / Support par défaut",
        help_text="Carton, Palette, Sachet ou Mandrin associé spécifiquement à cet article"
    )
    is_default_packaging = models.BooleanField(
        default=False,
        verbose_name="Est l'emballage standard par défaut de l'usine",
        help_text="Cochez pour définir cet emballage comme celui proposé d'office si aucun n'est spécifié."
    )
    
    class Meta:
        db_table = 'printing_product'
        verbose_name = "Produit"
        verbose_name_plural = "Produits"

    @property
    def is_low_stock(self):
        return self.stock_actuel <= self.seuil_alerte

    def decrement_stock(self, quantity=1):
        self.stock_actuel = max(0, self.stock_actuel - quantity)
        self.save()

    def save(self, *args, **kwargs):
        # Unicité stricte de l'emballage standard usine
        if self.is_default_packaging:
            Product.objects.filter(is_default_packaging=True).exclude(pk=self.pk).update(is_default_packaging=False)
        super().save(*args, **kwargs)

    def apply_movement(self, quantity, movement_type='RECEPTION', note=""):
        """Met à jour le stock et journalise l'événement dans le module stock."""
        from stock.models import StockMovement
        self.stock_actuel += quantity
        if self.stock_actuel < 0:
            self.stock_actuel = 0
        self.save()
        return StockMovement.objects.create(
            product=self,
            movement_type=movement_type,
            quantity=quantity,
            stock_after=self.stock_actuel,
            note=note
        )

    def set_inventory_stock(self, new_total, note="Inventaire"):
        """Recalibre le stock lors d'un inventaire physique."""
        from stock.models import StockMovement
        diff = new_total - self.stock_actuel
        self.stock_actuel = new_total
        self.save()
        return StockMovement.objects.create(
            product=self,
            movement_type='ADJUSTMENT',
            quantity=diff,
            stock_after=self.stock_actuel,
            note=note
        )

    def __str__(self):
        return f"[{self.sku}] {self.name}"


class ProductAttributeValue(models.Model):
    product = models.ForeignKey(
        Product, 
        on_delete=models.CASCADE, 
        related_name='attribute_values',
        verbose_name="Produit"
    )
    attribute = models.ForeignKey(
        AttributeDefinition, 
        on_delete=models.CASCADE, 
        verbose_name="Caractéristique"
    )
    valeur = models.CharField(max_length=255, verbose_name="Valeur")

    class Meta:
        db_table = 'printing_productattributevalue'
        verbose_name = "Caractéristique du produit"
        verbose_name_plural = "Caractéristiques du produit"
        unique_together = ('product', 'attribute')

    def clean(self):
        if not self.valeur:
            return

        val = self.valeur.strip()
        dtype = self.attribute.data_type

        if dtype == 'NUMBER':
            val_clean = val.replace(',', '.')
            try:
                float(val_clean)
                self.valeur = val_clean
            except ValueError:
                raise ValidationError({
                    'valeur': f"Pour '{self.attribute.name}', entrez un nombre valide (ex: 45 ou 45.5)."
                })

        elif dtype == 'INTEGER':
            if not re.match(r'^-?\d+$', val):
                raise ValidationError({
                    'valeur': f"Pour '{self.attribute.name}', entrez un nombre entier sans décimale."
                })

        elif dtype == 'CHOICE':
            allowed = self.attribute.get_options_list()
            matched = next((opt for opt in allowed if opt.lower() == val.lower()), None)
            if matched:
                self.valeur = matched
            else:
                options_str = ", ".join(allowed)
                raise ValidationError({
                    'valeur': f"Valeur invalide pour '{self.attribute.name}'. Choix possibles : {options_str}"
                })

        elif dtype == 'BOOLEAN':
            if val.lower() not in ['true', 'false', '1', '0', 'oui', 'non', 'o', 'n']:
                raise ValidationError({
                    'valeur': f"Pour '{self.attribute.name}', choisissez 'Oui' ou 'Non'."
                })

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.attribute.name}: {self.valeur}"


class DrawingType(models.Model):
    name = models.CharField(max_length=100, unique=True, verbose_name="Type de croquis / opération")
    code = models.SlugField(
        max_length=50, 
        unique=True, 
        help_text="Identifiant court (ex: soudure, impression, extrusion)"
    )

    class Meta:
        verbose_name = "Type de plan / croquis"
        verbose_name_plural = "Types de plans / croquis"
        ordering = ['name']

    def __str__(self):
        return self.name


class ProductDrawing(models.Model):
    product = models.ForeignKey(
        Product, 
        on_delete=models.CASCADE, 
        related_name='drawings', 
        verbose_name="Produit"
    )
    drawing_type = models.ForeignKey(
        DrawingType, 
        on_delete=models.PROTECT, 
        related_name='product_drawings',
        verbose_name="Type d'opération"
    )
    title = models.CharField(
        max_length=150, 
        blank=True, 
        verbose_name="Titre / Référence du plan",
        help_text="Ex: Plan soudure de fond lèvre 20mm, Cliché 2 couleurs recto"
    )
    file = models.FileField(
        upload_to='catalog/drawings/%Y/%m/', 
        verbose_name="Fichier du plan (Image ou PDF)"
    )
    instructions = models.TextField(
        blank=True, 
        null=True, 
        verbose_name="Consignes machine spécifiques",
        help_text="Consignes à imprimer sur la fiche atelier pour cette étape"
    )

    class Meta:
        verbose_name = "Croquis technique du produit"
        verbose_name_plural = "Croquis techniques du produit"
        unique_together = ('product', 'drawing_type')

    def __str__(self):
        return f"{self.product.sku} - {self.drawing_type.name}"