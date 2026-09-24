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
    
    base_unit = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='sub_units')
    conversion_factor = models.DecimalField(max_digits=12, decimal_places=6, default=1.0)

    class Meta:
        db_table = 'printing_unit'
        verbose_name = "Unité"
        verbose_name_plural = "Unités"

    def __str__(self):
        return f"{self.name} ({self.abbreviation})"


class Category(models.Model):
    """Ex: 'Sachets', 'Bobines', 'Mandrins', 'Cartons Expédition'"""
    name = models.CharField(max_length=100, unique=True, verbose_name="Nom de la catégorie")
    description = models.TextField(blank=True, null=True, verbose_name="Description")

    # Lien vers le modèle d'étiquette ZPL défini dans l'app printing
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

    def __str__(self):
        return self.name


class AttributeDefinition(models.Model):
    """
    Définition d'une caractéristique technique avec contrôle strict du type de saisie.
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
    unit = models.CharField(
        max_length=20, 
        blank=True, 
        null=True, 
        verbose_name="Unité (ex: cm, µm, mm, kg)"
    )
    options = models.CharField(
        max_length=500, 
        blank=True, 
        null=True, 
        help_text="Pour les listes de choix, séparez par des virgules (ex: PEBD, PEHD, PP, CPP)",
        verbose_name="Options autorisées"
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
        unit_str = f" [{self.unit}]" if self.unit else ""
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

    class Meta:
        db_table = 'printing_product'
        verbose_name = "Produit"
        verbose_name_plural = "Produits"

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