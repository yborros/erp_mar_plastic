from django.db import models
from django.utils import timezone

class LabelTemplate(models.Model):
    """ Les fichiers de code ZPL pour l'imprimante Zebra """
    name = models.CharField(max_length=100, unique=True, verbose_name="Nom du modèle")
    zpl_code = models.TextField(verbose_name="Code ZPL")
    
    def __str__(self):
        return self.name
    
    class Meta:
        verbose_name = "Modèle d'étiquette"
        verbose_name_plural = "Modèles d'étiquettes"


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

    def __str__(self):
        return f"{self.name} ({self.abbreviation})"

    class Meta:
        verbose_name = "Unité"


class Category(models.Model):
    """ Ex: 'Sachets', 'Bobines', 'Mandrins' """
    name = models.CharField(max_length=100, unique=True, verbose_name="Nom de la catégorie")
    
    # TA LOGIQUE : Un template par défaut pour toute la catégorie (Optionnel)
    default_template = models.ForeignKey(
        LabelTemplate, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name="categories",
        verbose_name="Template d'impression par défaut"
    )

    def __str__(self):
        return self.name
    
    class Meta:
        verbose_name = "Catégorie"


class Workstation(models.Model):
    name = models.CharField(max_length=100, unique=True, verbose_name="Nom du poste")
    ip_address = models.GenericIPAddressField(blank=True, null=True)
    allowed_categories = models.ManyToManyField(Category, related_name="workstations")

    def __str__(self):
        return self.name


class Product(models.Model):
    name = models.CharField(max_length=200, verbose_name="Nom du produit")
    sku = models.CharField(max_length=100, unique=True, verbose_name="Référence / SKU")
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, verbose_name="Catégorie")
    unit = models.ForeignKey(Unit, on_delete=models.PROTECT, verbose_name="Unité de mesure")
    
    # Optionnel : uniquement si ce produit spécifique déroge à la règle de sa catégorie
    custom_template = models.ForeignKey(
        LabelTemplate, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name="custom_products",
        verbose_name="Template spécifique (écrase celui de la catégorie)"
    )

    def __str__(self):
        return f"[{self.sku}] {self.name}"


class PrintJob(models.Model):
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    template = models.ForeignKey(LabelTemplate, on_delete=models.PROTECT)
    workstation = models.ForeignKey(Workstation, on_delete=models.SET_NULL, null=True, blank=True)
    lot_number = models.CharField(max_length=100, unique=True)
    recorded_weight = models.DecimalField(max_digits=6, decimal_places=2, blank=True, null=True)
    recorded_pack_count = models.PositiveIntegerField(blank=True, null=True)
    quantity_printed = models.PositiveIntegerField(default=1)
    timestamp = models.DateTimeField(default=timezone.now)