from django.db import models
from django.utils import timezone


class Category(models.Model):
    """Ex: 'Sachets', 'Bobines', 'Mandrins', 'Cartons Expédition'"""
    name = models.CharField(max_length=100, unique=True, verbose_name="Nom de la catégorie")
    description = models.TextField(blank=True, null=True, verbose_name="Description")

    # Template d'impression par défaut pour cette famille
    default_template = models.ForeignKey(
        'LabelTemplate', 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name="default_for_categories",
        verbose_name="Template d'impression par défaut"
    )

    def __str__(self):
        return self.name
    
    class Meta:
        verbose_name = "Catégorie"
        verbose_name_plural = "Catégories"


class LabelTemplate(models.Model):
    """Les fichiers de code ZPL pour l'imprimante Zebra"""
    name = models.CharField(max_length=100, unique=True, verbose_name="Nom du modèle")
    
    # 🔹 Liaison ManyToMany : permet d'affecter ce modèle à 1 ou plusieurs catégories
    categories = models.ManyToManyField(
        Category,
        related_name="label_templates",
        blank=True,
        verbose_name="Catégories compatibles"
    )
    
    zpl_code = models.TextField(verbose_name="Code ZPL")
    is_default = models.BooleanField(default=False, verbose_name="Modèle par défaut global")
    
    def __str__(self):
        return self.name
    
    class Meta:
        verbose_name = "Modèle d'étiquette"
        verbose_name_plural = "Modèles d'étiquettes"


class AttributeDefinition(models.Model):
    """
    Définition des caractéristiques techniques propres à chaque catégorie.
    Ex pour 'Bobines' : Laize (cm), Épaisseur (µm), Matière (PE/PP).
    Ex pour 'Sachets' : Largeur (mm), Hauteur (mm), Soufflet (mm).
    """
    category = models.ForeignKey(
        Category, 
        on_delete=models.CASCADE, 
        related_name='attribute_definitions',
        verbose_name="Catégorie"
    )
    name = models.CharField(max_length=100, verbose_name="Caractéristique")
    unit = models.CharField(max_length=20, blank=True, null=True, verbose_name="Unité (ex: cm, µm, mm, kg)")

    class Meta:
        verbose_name = "Définition de caractéristique"
        verbose_name_plural = "Définitions de caractéristiques"
        unique_together = ('category', 'name')

    def __str__(self):
        return f"{self.name} ({self.unit})" if self.unit else self.name


class Client(models.Model):
    nom = models.CharField(max_length=100, unique=True)
    numero_client = models.CharField(max_length=50, unique=True, verbose_name="Numéro de client")

    def __str__(self):
        return f"{self.numero_client} - {self.nom}"

    class Meta:
        verbose_name = "Client"
        verbose_name_plural = "Clients"


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
        verbose_name_plural = "Unités"


class Workstation(models.Model):
    name = models.CharField(max_length=100, unique=True, verbose_name="Nom du poste")
    ip_address = models.GenericIPAddressField(blank=True, null=True)
    allowed_categories = models.ManyToManyField(Category, related_name="workstations")

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "Poste de travail"
        verbose_name_plural = "Postes de travail"


class Product(models.Model):
    name = models.CharField(max_length=200, verbose_name="Nom du produit")
    sku = models.CharField(max_length=100, unique=True, verbose_name="Référence / SKU")
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, verbose_name="Catégorie", related_name="products")
    unit = models.ForeignKey(Unit, on_delete=models.PROTECT, verbose_name="Unité de mesure")
    
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

    class Meta:
        verbose_name = "Produit"
        verbose_name_plural = "Produits"


class ProductAttributeValue(models.Model):
    """Valeur réelle saisie pour chaque caractéristique sur la fiche produit."""
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
        verbose_name = "Caractéristique du produit"
        verbose_name_plural = "Caractéristiques du produit"
        unique_together = ('product', 'attribute')

    def __str__(self):
        return f"{self.attribute.name}: {self.valeur}"


class PrintJob(models.Model):
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    template = models.ForeignKey(LabelTemplate, on_delete=models.PROTECT)
    workstation = models.ForeignKey(Workstation, on_delete=models.SET_NULL, null=True, blank=True)
    lot_number = models.CharField(max_length=100, unique=True)
    recorded_weight = models.DecimalField(max_digits=6, decimal_places=2, blank=True, null=True)
    recorded_pack_count = models.PositiveIntegerField(blank=True, null=True)
    quantity_printed = models.PositiveIntegerField(default=1)
    timestamp = models.DateTimeField(default=timezone.now)

    class Meta:
        verbose_name = "Tâche d'impression"
        verbose_name_plural = "Tâches d'impression"


class ConfigurationImprimante(models.Model):
    MODE_CHOICES = [
        ('USB', 'Connexion USB (Locale)'),
        ('RESEAU', 'Connexion Réseau (IP)'),
        ('DESACTIVE', 'Pas d\'imprimante (Simulé / Mode Test)'),
    ]
    
    code_poste = models.CharField(
        max_length=50, 
        unique=True, 
        help_text="Ex: PC_LAPTOP, PC_BUREAU, PC_EXTRUSION_1. Doit correspondre au .env"
    )
    nom_emplacement = models.CharField(max_length=100, help_text="Ex: Bureau de Yaniv, Ligne Extrusion 1")
    
    ip_poste_client = models.GenericIPAddressField(
        blank=True, null=True, 
        verbose_name="IP Poste Client (Navigateur)",
        help_text="Ex: 192.168.100.26 (L'IP du PC qui envoie la commande d'impression)"
    )

    mode_connexion = models.CharField(max_length=15, choices=MODE_CHOICES, default='RESEAU')
    
    nom_systeme_windows = models.CharField(
        max_length=255, 
        default="ZDesigner ZM400 200 dpi (ZPL)",
        blank=True,
        help_text="Nom exact de l'imprimante sous Windows (requis si mode USB)"
    )
    
    adresse_ip = models.GenericIPAddressField(
        default="192.168.100.37", blank=True, null=True,
        verbose_name="IP Imprimante / Raspberry Pi",
        help_text="Ex: 192.168.100.37 (L'IP du Pi sur lequel est branchée la Zebra)"
    )
    port_reseau = models.IntegerField(default=9100, help_text="Par défaut 9100 pour les Zebra")

    class Meta:
        verbose_name = "Configuration Imprimante Poste"
        verbose_name_plural = "Configuration Imprimantes Postes"

    def __str__(self):
        return f"{self.nom_emplacement} ({self.code_poste}) -> Client:{self.ip_poste_client} | Pi:{self.adresse_ip}"


class ImpressionEtiquette(models.Model):
    """ Historique complet et traçabilité unitaire des tirages d'étiquettes """
    date_impression = models.DateTimeField(auto_now_add=True, verbose_name="Date & Heure")
    code_poste = models.CharField(max_length=50, verbose_name="Code Poste")
    ip_client = models.GenericIPAddressField(null=True, blank=True, verbose_name="IP Utilisateur")
    
    # --- Identifiants de Lot & Colis ---
    numero_lot = models.CharField(max_length=100, db_index=True, default="", verbose_name="N° de Lot")
    colis_index = models.IntegerField(default=1, verbose_name="Colis N°")
    colis_total = models.IntegerField(default=1, verbose_name="Total Colis")
    
    # --- Informations Produit / Client ---
    produit_nom = models.CharField(max_length=255, verbose_name="Désignation Produit")
    sku = models.CharField(max_length=100, blank=True, null=True, verbose_name="SKU / Réf")
    client_nom = models.CharField(max_length=255, blank=True, null=True, verbose_name="Nom Client")
    
    # --- Caractéristiques Techniques (Bobines / Sachets) ---
    laize = models.CharField(max_length=20, blank=True, null=True, verbose_name="Laize (cm)")
    micron = models.CharField(max_length=20, blank=True, null=True, verbose_name="Épaisseur (µm)")
    quantite_valeur = models.CharField(max_length=50, blank=True, null=True, verbose_name="Valeur (Poids / Pcs)")
    unite = models.CharField(max_length=20, default="Kg", verbose_name="Unité")
    
    # --- Données Spécifiques Carton / Expédition ---
    type_details = models.CharField(max_length=100, blank=True, null=True, verbose_name="Détail Type")
    qty_details = models.CharField(max_length=100, blank=True, null=True, verbose_name="Détail Qté/Pièces")
    poids_net = models.CharField(max_length=50, blank=True, null=True, verbose_name="Poids Net")
    poids_brut = models.CharField(max_length=50, blank=True, null=True, verbose_name="Poids Brut")

    # --- Quantités d'étiquettes ---
    labels_per_colis = models.IntegerField(default=1, verbose_name="Étiquettes par Colis")
    total_etiquettes = models.IntegerField(default=1, verbose_name="Total Étiquettes Imprimées")

    # --- Code ZPL brut conservé pour réimpression à l'identique ---
    zpl_genere = models.TextField(blank=True, null=True, verbose_name="Code ZPL Généré")

    # --- Relations optionnelles ---
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True, blank=True, related_name="historique_impressions")
    client = models.ForeignKey(Client, on_delete=models.SET_NULL, null=True, blank=True, related_name="historique_impressions")

    class Meta:
        verbose_name = "Historique d'impression"
        verbose_name_plural = "Historique des impressions"
        ordering = ['-date_impression']

    def __str__(self):
        return f"[{self.numero_lot}] {self.produit_nom} (Colis {self.colis_index}/{self.colis_total})"