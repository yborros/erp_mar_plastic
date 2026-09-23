from django.contrib import admin
from .models import Unit, Category, Workstation, LabelTemplate, Product, PrintJob, ConfigurationImprimante, Client, ImpressionEtiquette

@admin.register(Unit)
class UnitAdmin(admin.ModelAdmin):
    list_display = ('name', 'abbreviation', 'input_mode')

@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'default_template') # On affiche le template par défaut ici

@admin.register(LabelTemplate)
class LabelTemplateAdmin(admin.ModelAdmin):
    list_display = ('name',)

@admin.register(Workstation)
class WorkstationAdmin(admin.ModelAdmin):
    list_display = ('name', 'ip_address')

@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('sku', 'name', 'category', 'unit')
    fields = ('sku', 'name', 'category', 'unit', 'custom_template') # 'custom_template' devient optionnel

@admin.register(PrintJob)
class PrintJobAdmin(admin.ModelAdmin):
    list_display = ('lot_number', 'product', 'timestamp')

@admin.register(ConfigurationImprimante)
class ConfigurationImprimanteAdmin(admin.ModelAdmin):
    list_display = ('code_poste', 'nom_emplacement', 'mode_connexion', 'nom_systeme_windows', 'adresse_ip')

# =================================================================
# ENREGISTREMENT DU MODÈLE CLIENT
# =================================================================
@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ('numero_client', 'nom') # Affiche le numéro et le nom dans la liste globale
    search_fields = ('nom', 'numero_client') # Permet de chercher rapidement un client par son nom ou son code

from django.contrib import admin
from .models import ConfigurationImprimante, ImpressionEtiquette, Product, Client

@admin.register(ImpressionEtiquette)
class ImpressionEtiquetteAdmin(admin.ModelAdmin):
    # Colonnes affichées dans la liste
    list_display = (
        'numero_lot',
        'colis_display',
        'date_impression',
        'produit_nom',
        'client_nom',
        'poids_net',
        'poids_brut',
        'code_poste',
    )

    # Filtres latéraux pratiques
    list_filter = ('code_poste', 'date_impression', 'unite')

    # Barre de recherche rapide
    search_fields = ('numero_lot', 'produit_nom', 'sku', 'client_nom')

    # Tri par défaut : les plus récents en premier
    ordering = ('-date_impression',)

    # Pagination par 100 lignes
    list_per_page = 100

    # 1. Rendre TOUS les champs non modifiables lors de la consultation d'une ligne
    def get_readonly_fields(self, request, obj=None):
        return [f.name for f in self.model._meta.fields]

    # 2. Supprimer le bouton "Ajouter impression étiquette" (+ Add)
    def has_add_permission(self, request):
        return False

    # 3. Interdire l'enregistrement / modification (pas de bouton Sauvegarder)
    def has_change_permission(self, request, obj=None):
        return False

    # 4. Interdire la suppression (supprime le bouton Supprimer et les actions de masse)
    def has_delete_permission(self, request, obj=None):
        return False

    # Affichage personnalisé du colis (ex: Colis 2 / 5)
    @admin.display(description="Colis")
    def colis_display(self, obj):
        return f"{obj.colis_index} / {obj.colis_total}"