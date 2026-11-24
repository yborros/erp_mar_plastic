from rest_framework import serializers
from .models import OrdreFabrication


class OrdreFabricationSerializer(serializers.ModelSerializer):
    produit_nom = serializers.CharField(source='produit.name', read_only=True)
    produit_sku = serializers.CharField(source='produit.sku', read_only=True)
    client_nom = serializers.CharField(source='client.nom', read_only=True, default="")
    statut_display = serializers.CharField(source='get_statut_display', read_only=True)
    
    # Sécurisation : ne plante jamais si unite est temporairement None
    unite_symbole = serializers.SerializerMethodField()
    unite_nom = serializers.SerializerMethodField()

    class Meta:
        model = OrdreFabrication
        fields = [
            'id',
            'numero_of',
            'client',
            'client_nom',
            'produit',
            'produit_nom',
            'produit_sku',
            'quantite_cible',
            'quantite_produite',
            'unite',
            'unite_symbole',
            'unite_nom',
            'statut',
            'statut_display',
            'poste_travail',
            'pistes',
            'date_debut_prevue',
            'date_cloture',
            'lot_matiere',
            'notes',
            'created_at',
        ]
        read_only_fields = ['numero_of', 'unite', 'created_at']

    def get_unite_symbole(self, obj):
        if obj.unite:
            return obj.unite.abbreviation
        if obj.produit and hasattr(obj.produit, 'unit') and obj.produit.unit:
            return obj.produit.unit.abbreviation
        return "U"

    def get_unite_nom(self, obj):
        if obj.unite:
            return obj.unite.name
        if obj.produit and hasattr(obj.produit, 'unit') and obj.produit.unit:
            return obj.produit.unit.name
        return "Unité"