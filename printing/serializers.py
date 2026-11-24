from rest_framework import serializers
from .models import (
    Category, LabelTemplate, Product, 
    AttributeDefinition, ProductAttributeValue, 
    ConfigurationImprimante, Client, ImpressionEtiquette
)


class AttributeDefinitionSerializer(serializers.ModelSerializer):
    unit_symbol = serializers.CharField(source='unit.abbreviation', read_only=True, default='')
    options_list = serializers.SerializerMethodField()

    class Meta:
        model = AttributeDefinition
        fields = [
            'id', 'name', 'data_type', 'unit', 'unit_symbol', 
            'options', 'options_list', 'visible_pesee'
        ]

    def get_options_list(self, obj):
        return obj.get_options_list()


class CategorySerializer(serializers.ModelSerializer):
    applicable_attributes = AttributeDefinitionSerializer(
        source='get_all_attribute_definitions', 
        many=True, 
        read_only=True
    )

    class Meta:
        model = Category
        fields = ['id', 'name', 'parent', 'is_printable', 'default_template', 'applicable_attributes']


class LabelTemplateSerializer(serializers.ModelSerializer):
    category_ids = serializers.PrimaryKeyRelatedField(
        many=True, read_only=True, source='categories'
    )

    class Meta:
        model = LabelTemplate
        fields = ['id', 'name', 'zpl_code', 'category_ids', 'is_default']


class ProductAttributeValueSerializer(serializers.ModelSerializer):
    attribute_name = serializers.CharField(source='attribute.name', read_only=True)
    unit = serializers.CharField(source='attribute.unit.abbreviation', read_only=True, default='')
    data_type = serializers.CharField(source='attribute.data_type', read_only=True)
    options_list = serializers.SerializerMethodField()

    class Meta:
        model = ProductAttributeValue
        fields = ['id', 'attribute', 'attribute_name', 'valeur', 'unit', 'data_type', 'options_list']

    def get_options_list(self, obj):
        return obj.attribute.get_options_list()


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    unit_symbol = serializers.CharField(source='unit.abbreviation', read_only=True, default='')
    input_mode = serializers.CharField(source='unit.input_mode', read_only=True, default='STANDARD')
    attributes = ProductAttributeValueSerializer(source='attribute_values', many=True, read_only=True)
    zpl_template = serializers.SerializerMethodField()

    stock_actuel = serializers.IntegerField(read_only=True, default=0)
    seuil_alerte = serializers.IntegerField(read_only=True, default=0)
    is_low_stock = serializers.BooleanField(read_only=True, default=False)
    is_default_packaging = serializers.BooleanField(read_only=True, default=False)
    default_packaging_id = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            'id', 'sku', 'name', 'category', 'category_name', 
            'unit_symbol', 'input_mode', 'attributes', 'zpl_template',
            'stock_actuel', 'seuil_alerte', 'is_low_stock', 
            'default_packaging_id', 'is_default_packaging'
        ]

    def get_default_packaging_id(self, obj):
        # 1. Carton assigné au produit
        if obj.default_packaging_id:
            return obj.default_packaging_id
        
        # 2. Carton standard usine configuré via is_default_packaging
        fallback_box = Product.objects.filter(is_default_packaging=True).first()
        return fallback_box.id if fallback_box else None

    def get_zpl_template(self, obj):
        if obj.custom_template:
            return obj.custom_template.zpl_code
        if obj.category and obj.category.default_template:
            return obj.category.default_template.zpl_code
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


class ConfigurationImprimanteSerializer(serializers.ModelSerializer):
    nom = serializers.CharField(source='nom_emplacement', read_only=True)
    ip_address = serializers.CharField(source='adresse_ip', read_only=True)
    port = serializers.IntegerField(source='port_reseau', read_only=True)

    class Meta:
        model = ConfigurationImprimante
        fields = ['id', 'nom', 'code_poste', 'ip_address', 'port', 'mode_connexion']


class ClientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        fields = ['id', 'nom', 'numero_client']


class ImpressionEtiquetteSerializer(serializers.ModelSerializer):
    class Meta:
        model = ImpressionEtiquette
        fields = '__all__'