from rest_framework import serializers
from .models import Category, LabelTemplate, Product

class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = '__all__'

class LabelTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = LabelTemplate
        fields = '__all__'

class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    unit_symbol = serializers.CharField(source='unit.abbreviation', read_only=True, default='')
    input_mode = serializers.CharField(source='unit.input_mode', read_only=True, default='STANDARD')
    
    # On ajoute le champ dynamique pour récupérer le ZPL
    zpl_template = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = ['id', 'sku', 'name', 'category', 'category_name', 'unit_symbol', 'input_mode', 'zpl_template']

    def get_zpl_template(self, obj):
        # 1. Si le produit a un template spécifique
        if obj.custom_template:
            return obj.custom_template.zpl_code
        # 2. Sinon, si sa catégorie a un template par défaut
        if obj.category and obj.category.default_template:
            return obj.category.default_template.zpl_code
        # 3. Secours : Si aucun template n'est configuré dans l'admin, on renvoie un modèle de base
        return (
            "^XA\n"
            "^CF0,50^FO50,40^FD{NAME}^FS\n"
            "^CF0,25^FO50,110^FDSKU : {SKU}^FS\n"
            "^CF0,30^FO50,150^FDVALEUR : {VALUE} {UNIT}^FS\n"
            "^CF0,20^FO50,200^FDLOT SECURISE : {LOT}^FS\n"
            "^FO50,240^GB700,3,3^FS\n"
            "^FO50,270^BY3^BCN,80,Y,N,N^FD{SKU}^FS\n"
            "^XZ"
        )