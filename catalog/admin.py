from django import forms
from django.contrib import admin
from django.utils.html import format_html, mark_safe
from .models import (
    Unit,
    Category,
    AttributeDefinition,
    Product,
    ProductAttributeValue,
    DrawingType,
    ProductDrawing,
)


# =================================================================
# 1. GESTION DES UNITÉS & CATÉGORIES
# =================================================================

@admin.register(Unit)
class UnitAdmin(admin.ModelAdmin):
    list_display = ('name', 'abbreviation', 'input_mode', 'base_unit', 'conversion_factor')
    list_filter = ('input_mode',)
    search_fields = ('name', 'abbreviation')


class AttributeDefinitionInline(admin.TabularInline):
    model = AttributeDefinition
    extra = 1
    # 'visible_pesee' permet de cocher directement les champs actifs à la balance
    fields = ('name', 'data_type', 'unit', 'options', 'visible_pesee')


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'parent', 'is_printable', 'default_template')
    list_editable = ('is_printable',)
    list_filter = ('parent', 'is_printable')
    search_fields = ('name',)
    inlines = [AttributeDefinitionInline]


@admin.register(AttributeDefinition)
class AttributeDefinitionAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'data_type', 'unit', 'visible_pesee')
    list_editable = ('visible_pesee',)
    list_filter = ('category', 'data_type', 'visible_pesee')
    search_fields = ('name', 'category__name')


# =================================================================
# 2. TYPES DE PLANS / CROQUIS
# =================================================================

@admin.register(DrawingType)
class DrawingTypeAdmin(admin.ModelAdmin):
    list_display = ('name', 'code')
    search_fields = ('name', 'code')
    prepopulated_fields = {'code': ('name',)}


# =================================================================
# 3. TABLEAUX EN LIGNE (INLINES PRODUIT)
# =================================================================

class ProductAttributeValueInline(admin.TabularInline):
    model = ProductAttributeValue
    extra = 1
    fields = ('attribute', 'valeur')

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "attribute" and request.resolver_match.kwargs.get('object_id'):
            product_id = request.resolver_match.kwargs['object_id']
            try:
                product = Product.objects.get(pk=product_id)
                if product.category:
                    kwargs["queryset"] = AttributeDefinition.objects.filter(category=product.category)
            except Product.DoesNotExist:
                pass
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


class ProductDrawingInline(admin.TabularInline):
    model = ProductDrawing
    extra = 1
    fields = ('drawing_type', 'title', 'file', 'apercu_fichier', 'instructions')
    readonly_fields = ('apercu_fichier',)

    def apercu_fichier(self, obj):
        if obj.file:
            ext = obj.file.name.split('.')[-1].lower()
            if ext in ['png', 'jpg', 'jpeg', 'webp', 'gif']:
                return format_html(
                    '<a href="{0}" target="_blank">'
                    '<img src="{0}" style="max-height: 45px; border-radius: 4px; border: 1px solid #ccc;" />'
                    '</a>',
                    obj.file.url
                )
            return format_html(
                '<a href="{0}" target="_blank" style="font-weight: bold; color: #1976d2;">Voir le PDF</a>',
                obj.file.url
            )
        return "Aucun fichier"

    apercu_fichier.short_description = "Aperçu"


# =================================================================
# 4. FORMULAIRE AVEC CASCADE PARENT > ENFANT > PRODUIT
# =================================================================

class ProductAdminForm(forms.ModelForm):
    parent_category_filter = forms.ModelChoiceField(
        queryset=Category.objects.filter(parent__isnull=True).order_by('name'),
        required=False,
        label="1. Famille Générale (Mère)",
        help_text="Sélectionnez la catégorie mère (ex: Emballages, Matières, Produits Finis...)"
    )

    sub_category_filter = forms.ModelChoiceField(
        queryset=Category.objects.filter(parent__isnull=False).order_by('name'),
        required=False,
        label="2. Sous-Famille (Enfant)",
        help_text="Affinez par la sous-catégorie (ex: Cartons, Palettes, Sachets...)"
    )

    class Meta:
        model = Product
        fields = '__all__'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance and self.instance.pk and self.instance.default_packaging:
            pkg = self.instance.default_packaging
            if pkg.category:
                if pkg.category.parent:
                    self.fields['parent_category_filter'].initial = pkg.category.parent
                    self.fields['sub_category_filter'].initial = pkg.category
                else:
                    self.fields['parent_category_filter'].initial = pkg.category


# =================================================================
# 5. FICHE PRODUIT GLOBALE
# =================================================================

@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    form = ProductAdminForm
    list_display = (
        'sku', 
        'name', 
        'category', 
        'unit', 
        'is_default_packaging',
        'default_packaging', 
        'stock_actuel', 
        'seuil_alerte', 
        'is_low_stock_display', 
        'nombre_plans'
    )
    list_editable = ('is_default_packaging',)
    list_filter = ('category', 'unit', 'is_default_packaging')
    search_fields = ('sku', 'name')
    autocomplete_fields = ('category', 'unit')
    
    inlines = [ProductAttributeValueInline, ProductDrawingInline]

    fieldsets = (
        ("Informations Générales", {
            'fields': (
                ('sku', 'name'), 
                ('category', 'unit'), 
                'custom_template'
            )
        }),
        ("📦 Emballage Associé & Gestion des Stocks", {
            'fields': (
                'is_default_packaging',
                'parent_category_filter',
                'sub_category_filter',
                'default_packaging',
                ('stock_actuel', 'seuil_alerte')
            ),
            'description': mark_safe("""
                Sélectionnez une catégorie Mère pour filtrer les Sous-Familles et restreindre les articles correspondants.<br/>
                Cochez <strong>Est l'emballage standard par défaut</strong> si cet article est le carton/support universel d'usine.
                <script>
                document.addEventListener('DOMContentLoaded', function () {
                    const parentSelect = document.getElementById('id_parent_category_filter');
                    const subSelect = document.getElementById('id_sub_category_filter');
                    const pkgSelect = document.getElementById('id_default_packaging');

                    if (!parentSelect || !subSelect || !pkgSelect) return;

                    function reloadProducts(categoryId) {
                        const currentVal = pkgSelect.value;
                        fetch('/admin-api/products-by-category/?category_id=' + (categoryId || ''))
                            .then(r => r.json())
                            .then(data => {
                                pkgSelect.innerHTML = '<option value="">---------</option>';
                                data.forEach(item => {
                                    const opt = document.createElement('option');
                                    opt.value = item.id;
                                    opt.textContent = '[' + item.sku + '] ' + item.name;
                                    if (String(item.id) === String(currentVal)) {
                                        opt.selected = true;
                                    }
                                    pkgSelect.appendChild(opt);
                                });
                            })
                            .catch(err => console.error("Erreur chargement articles :", err));
                    }

                    parentSelect.addEventListener('change', function () {
                        const parentId = this.value;
                        subSelect.innerHTML = '<option value="">-- Toutes les sous-familles --</option>';

                        if (parentId) {
                            fetch('/admin-api/subcategories/?parent_id=' + parentId)
                                .then(r => r.json())
                                .then(subs => {
                                    subs.forEach(s => {
                                        const opt = document.createElement('option');
                                        opt.value = s.id;
                                        opt.textContent = s.name;
                                        subSelect.appendChild(opt);
                                    });
                                })
                                .catch(err => console.error("Erreur chargement sous-catégories :", err));
                        }
                        reloadProducts(parentId);
                    });

                    subSelect.addEventListener('change', function () {
                        const subId = this.value;
                        if (subId) {
                            reloadProducts(subId);
                        } else {
                            reloadProducts(parentSelect.value);
                        }
                    });
                });
                </script>
            """)
        }),
    )

    def is_low_stock_display(self, obj):
        if getattr(obj, 'is_low_stock', False):
            return mark_safe('<span style="color: #dc2626; font-weight: bold;">🚨 BAS</span>')
        return mark_safe('<span style="color: #16a34a; font-weight: bold;">OK</span>')
    is_low_stock_display.short_description = "Statut Stock"

    def nombre_plans(self, obj):
        return obj.drawings.count()
    nombre_plans.short_description = "Nb Croquis"