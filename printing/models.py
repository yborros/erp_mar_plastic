from django.db import models
from django.utils import timezone


class LabelTemplate(models.Model):
    """Les fichiers de code ZPL pour l'imprimante Zebra"""
    name = models.CharField(max_length=100, unique=True, verbose_name="Nom du modèle")
    zpl_code = models.TextField(verbose_name="Code ZPL")
    
    def __str__(self):
        return self.name
    
    class Meta:
        verbose_name = "Modèle d'étiquette"
        verbose_name_plural = "Modèles d'étiquettes"


class Client(models.Model):
    nom = models.CharField(max_length=100, unique=True)
    numero_client = models.CharField(max_length=50, unique=True, verbose_name="Numéro de client")
    # data_sup = models.JSONField(blank=True, null=True)

    def __str__(self):
        return f"{self.numero_client} - {self.nom}"


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


class Category(models.Model):
    """Ex: 'Sachets', 'Bobines', 'Mandrins'"""
    name = models.CharField(max_length=100, unique=True, verbose_name="Nom de la catégorie")
    
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
        verbose_name_plural = "Catégories"


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
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, verbose_name="Catégorie")
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
    
    # 🔹 NOUVEAU : IP du poste client (navigateur web React)
    ip_poste_client = models.GenericIPAddressField(
        blank=True, null=True, 
        verbose_name="IP Poste Client (Navigateur)",
        help_text="Ex: 192.168.100.26 (L'IP du PC qui envoie la commande d'impression)"
    )

    mode_connexion = models.CharField(max_length=15, choices=MODE_CHOICES, default='RESEAU')
    
    # Paramètres USB
    nom_systeme_windows = models.CharField(
        max_length=255, 
        default="ZDesigner ZM400 200 dpi (ZPL)",
        blank=True,
        help_text="Nom exact de l'imprimante sous Windows (requis si mode USB)"
    )
    
    # 🔹 IP de destination (Raspberry Pi ou Imprimante réseau direct)
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
    """ Historique complet des tirages d'étiquettes en usine (Traçabilité) """
    date_impression = models.DateTimeField(auto_now_add=True, verbose_name="Date & Heure")
    code_poste = models.CharField(max_length=50, verbose_name="Code Poste / Machine")
    ip_client = models.GenericIPAddressField(null=True, blank=True, verbose_name="IP Utilisateur")
    
    # Informations Produit / Client
    produit_nom = models.CharField(max_length=255, verbose_name="Désignation Produit")
    sku = models.CharField(max_length=100, blank=True, null=True, verbose_name="SKU / Réf")
    client_nom = models.CharField(max_length=255, blank=True, null=True, verbose_name="Nom Client")
    
    # Données techniques spécifiques (Plastique / Bobines / Sachets)
    laize = models.CharField(max_length=20, blank=True, null=True, verbose_name="Laize (cm)")
    micron = models.CharField(max_length=20, blank=True, null=True, verbose_name="Épaisseur (µm)")
    quantite_valeur = models.CharField(max_length=50, verbose_name="Valeur (Poids / Pcs)")
    unite = models.CharField(max_length=20, default="Kg", verbose_name="Unité")
    
    # Détail de tirage
    colis_count = models.IntegerField(default=1, verbose_name="Nombre de Colis/Cartons")
    labels_per_colis = models.IntegerField(default=1, verbose_name="Étiquettes par Colis")
    total_etiquettes = models.IntegerField(default=1, verbose_name="Total Étiquettes Imprimées")

    # Code ZPL brut conservé pour réimpression à l'identique
    zpl_genere = models.TextField(blank=True, null=True, verbose_name="Code ZPL Généré")

    # Relations optionnelles vers la base si besoin de filtres croisés
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True, blank=True, related_name="historique_impressions")
    client = models.ForeignKey(Client, on_delete=models.SET_NULL, null=True, blank=True, related_name="historique_impressions")

    class Meta:
        verbose_name = "Historique d'impression"
        verbose_name_plural = "Historique des impressions"
        ordering = ['-date_impression']

    def __str__(self):
        return f"[{self.date_impression.strftime('%d/%m/%Y %H:%M')}] {self.produit_nom} ({self.total_etiquettes} ex.)"