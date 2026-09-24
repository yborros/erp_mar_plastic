from django.contrib import admin
from django import forms
from .models import Unit, Category, AttributeDefinition, Product, ProductAttributeValue


# ==========================================
# 1. GESTION DES UNITÉS
# ==========================================
@admin.register(Unit)
class UnitAdmin(admin.ModelAdmin):
    list_display = ('name', 'abbreviation', 'input_mode', 'conversion_factor', 'base_unit')
    list_filter = ('input_mode',)
    search_fields = ('name', 'abbreviation')


# ==========================================
# 2. GESTION DES CARACTÉRISTIQUES PAR CATÉGORIE
# ==========================================
class AttributeDefinitionInline(admin.TabularInline):
    """
    Permet d'ajouter ou modifier les caractéristiques directement 
    depuis la fiche de la catégorie (ex: Laize, Épaisseur, etc.).
    """
    model = AttributeDefinition
    extra = 2
    fields = ('name', 'data_type', 'unit', 'options')


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'default_template', 'attributes_count')
    search_fields = ('name',)
    inlines = [AttributeDefinitionInline]

    @admin.display(description="Nb Caractéristiques")
    def attributes_count(self, obj):
        return obj.attribute_definitions.count()


# ==========================================
# 3. SAISIE DES VALEURS PAR PRODUIT
# ==========================================
class ProductAttributeValueInline(admin.TabularInline):
    """
    Permet de renseigner les valeurs techniques d'un produit.
    Filtre les attributs disponibles pour correspondre à la catégorie du produit.
    """
    model = ProductAttributeValue
    extra = 1
    fields = ('attribute', 'valeur')

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        # Si on édite un produit existant, on restreint les attributs à sa catégorie
        if db_field.name == "attribute" and request.resolver_match.kwargs.get('object_id'):
            product_id = request.resolver_match.kwargs['object_id']
            try:
                product = Product.objects.get(pk=product_id)
                if product.category:
                    kwargs["queryset"] = AttributeDefinition.objects.filter(category=product.category)
            except Product.DoesNotExist:
                pass
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('sku', 'name', 'category', 'unit', 'custom_template')
    list_filter = ('category', 'unit')
    search_fields = ('sku', 'name')
    autocomplete_fields = ('category', 'unit')
    inlines = [ProductAttributeValueInline]
    fieldsets = (
        ("Identification Produit", {
            'fields': ('sku', 'name', 'category', 'unit')
        }),
        ("Personnalisation Impression (Optionnel)", {
            'fields': ('custom_template',),
            'classes': ('collapse',),
            'description': "À renseigner uniquement si ce produit utilise un gabarit ZPL différent de sa catégorie."
        }),
    )


# ==========================================
# 4. RECHERCHE DIRECTE DES VALEURS / ATTRIBUTS
# ==========================================
@admin.register(AttributeDefinition)
class AttributeDefinitionAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'data_type', 'unit')
    list_filter = ('category', 'data_type')
    search_fields = ('name', 'category__name')