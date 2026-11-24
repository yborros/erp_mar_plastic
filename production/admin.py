from django.contrib import admin
from .models import OrdreFabrication

@admin.register(OrdreFabrication)
class OrdreFabricationAdmin(admin.ModelAdmin):
    list_display = (
        'numero_of',
        'produit',
        'client',
        'quantite_cible',
        'quantite_produite',
        'unite',
        'statut',
        'poste_travail',
        'date_debut_prevue',
    )
    list_filter = ('statut', 'poste_travail', 'date_debut_prevue')
    search_fields = ('numero_of', 'produit__name', 'produit__sku', 'client__nom')
    readonly_fields = ('quantite_produite', 'created_at')