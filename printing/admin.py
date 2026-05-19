from django.contrib import admin
from .models import Unit, Category, Workstation, LabelTemplate, Product, PrintJob, ConfigurationImprimante

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