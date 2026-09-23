from django.contrib import admin
from .models import (
    Unit, Category, Workstation, LabelTemplate, AttributeDefinition,
    Product, ProductAttributeValue, PrintJob, ConfigurationImprimante, 
    Client, ImpressionEtiquette
)

# -----------------------------------------------------------------
# 1. UNITÉS, CATÉGORIES & CARACTÉRISTIQUES
# -----------------------------------------------------------------

@admin.register(Unit)
class UnitAdmin(admin.ModelAdmin):
    list_display = ('name', 'abbreviation', 'input_mode')


class AttributeDefinitionInline(admin.TabularInline):
    """Permet de définir les caractéristiques propres à la catégorie (ex: Laize, Épaisseur)."""
    model = AttributeDefinition
    extra = 2


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'default_template')
    inlines = [AttributeDefinitionInline]


# -----------------------------------------------------------------
# 2. MODÈLES D'ÉTIQUETTES (ZPL)
# -----------------------------------------------------------------

@admin.register(LabelTemplate)
class LabelTemplateAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_default')
    list_filter = ('is_default', 'categories')
    filter_horizontal = ('categories',)  # Sélecteur à deux colonnes pour associer les catégories


# -----------------------------------------------------------------
# 3. PRODUITS & VALEURS DES CARACTÉRISTIQUES
# -----------------------------------------------------------------

class ProductAttributeValueInline(admin.TabularInline):
    """Tableau modifiable des caractéristiques directement dans la fiche Produit."""
    model = ProductAttributeValue
    extra = 1

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        """Filtre les caractéristiques affichées selon la catégorie du produit en cours d'édition."""
        if db_field.name == "attribute" and request.resolver_match.kwargs.get('object_id'):
            product_id = request.resolver_match.kwargs['object_id']
            try:
                product = Product.objects.get(pk=product_id)
                kwargs["queryset"] = AttributeDefinition.objects.filter(category=product.category)
            except Product.DoesNotExist:
                pass
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('sku', 'name', 'category', 'unit')
    list_filter = ('category',)
    search_fields = ('sku', 'name')
    fields = ('sku', 'name', 'category', 'unit', 'custom_template')
    inlines = [ProductAttributeValueInline]


# -----------------------------------------------------------------
# 4. POSTES, CLIENTS & TÂCHES
# -----------------------------------------------------------------

@admin.register(Workstation)
class WorkstationAdmin(admin.ModelAdmin):
    list_display = ('name', 'ip_address')


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ('numero_client', 'nom')
    search_fields = ('nom', 'numero_client')


@admin.register(PrintJob)
class PrintJobAdmin(admin.ModelAdmin):
    list_display = ('lot_number', 'product', 'timestamp')


@admin.register(ConfigurationImprimante)
class ConfigurationImprimanteAdmin(admin.ModelAdmin):
    list_display = ('code_poste', 'nom_emplacement', 'mode_connexion', 'nom_systeme_windows', 'adresse_ip')


# -----------------------------------------------------------------
# 5. HISTORIQUE D'IMPRESSION (TRAÇABILITÉ SÉCURISÉE EN LECTURE SEULE)
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