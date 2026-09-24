from django.contrib import admin
from .models import (
    Workstation,
    LabelTemplate,
    PrintJob,
    ConfigurationImprimante,
    Client,
    ImpressionEtiquette,
)

# -----------------------------------------------------------------
# 1. MODÈLES D'ÉTIQUETTES (ZPL)
# -----------------------------------------------------------------

@admin.register(LabelTemplate)
class LabelTemplateAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_default')
    list_filter = ('is_default', 'categories')
    filter_horizontal = ('categories',)  # Sélecteur à double colonne pour lier les catégories


# -----------------------------------------------------------------
# 2. CLIENTS, POSTES & CONFIGURATIONS MATÉRIELLES
# -----------------------------------------------------------------

@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ('numero_client', 'nom')
    search_fields = ('nom', 'numero_client')


@admin.register(Workstation)
class WorkstationAdmin(admin.ModelAdmin):
    list_display = ('name', 'ip_address')
    filter_horizontal = ('allowed_categories',)


@admin.register(ConfigurationImprimante)
class ConfigurationImprimanteAdmin(admin.ModelAdmin):
    list_display = (
        'code_poste',
        'nom_emplacement',
        'mode_connexion',
        'ip_poste_client',
        'adresse_ip',
        'nom_systeme_windows',
    )
    list_filter = ('mode_connexion',)
    search_fields = ('code_poste', 'nom_emplacement', 'ip_poste_client', 'adresse_ip')


@admin.register(PrintJob)
class PrintJobAdmin(admin.ModelAdmin):
    list_display = ('lot_number', 'product', 'quantity_printed', 'timestamp')
    list_filter = ('timestamp',)
    search_fields = ('lot_number', 'product__name', 'product__sku')


# -----------------------------------------------------------------
# 3. HISTORIQUE D'IMPRESSION (TRAÇABILITÉ EN LECTURE SEULE)
# -----------------------------------------------------------------

@admin.register(ImpressionEtiquette)
class ImpressionEtiquetteAdmin(admin.ModelAdmin):
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
    list_filter = ('code_poste', 'date_impression', 'unite')
    search_fields = ('numero_lot', 'produit_nom', 'sku', 'client_nom')
    ordering = ('-date_impression',)
    list_per_page = 100

    def get_readonly_fields(self, request, obj=None):
        return [f.name for f in self.model._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    @admin.display(description="Colis")
    def colis_display(self, obj):
        return f"{obj.colis_index} / {obj.colis_total}"