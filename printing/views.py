import datetime
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import viewsets, status
from .models import Category, LabelTemplate, Product
from .serializers import CategorySerializer, LabelTemplateSerializer, ProductSerializer

class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer

class LabelTemplateViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = LabelTemplate.objects.all()
    serializer_class = LabelTemplateSerializer

class ProductViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer

try:
    import win32print
except ImportError:
    win32print = None

class USBPrintAPIView(APIView):
    def post(self, request):
        product_id = request.data.get('product_id')
        value = request.data.get('value', '')
        colis_count = int(request.data.get('colis_count', 1))
        labels_per_colis = int(request.data.get('labels_per_colis', 1))
        
        # Le nom exact récupéré via PowerShell :
        NOM_IMPRIMANTE = "ZDesigner ZM400 200 dpi (ZPL)" 

        try:
            product = Product.objects.get(id=product_id)
        except Product.DoesNotExist:
            return Response({"error": "Produit introuvable"}, status=status.HTTP_404_NOT_FOUND)

        # 1. Récupération du template ZPL (custom ou par défaut)
        if product.custom_template:
            zpl_template = product.custom_template.zpl_code
        elif product.category and product.category.default_template:
            zpl_template = product.category.default_template.zpl_code
        else:
            return Response({"error": "Aucun modèle ZPL configuré pour ce produit"}, status=status.HTTP_400_BAD_REQUEST)

        # 2. Construction de la chaîne ZPL globale
        zpl_final_global = ""
        now = datetime.datetime.now()
        today_str = now.strftime("%Y%m%d")

        # Boucle pour créer X lots uniques (Nombre de colis)
        for i in range(colis_count):
            # Génération d'un lot unique à la seconde près pour chaque carton
            timestamp = now.strftime("%H%M%S")
            lot_unique = f"MP-{today_str}-{timestamp}-{i+1}"
            
            # Injection des données dans le template
            texte_etiquette = zpl_template
            texte_etiquette = texte_etiquette.replace("{NAME}", product.name)
            texte_etiquette = texte_etiquette.replace("{SKU}", product.sku)
            texte_etiquette = texte_etiquette.replace("{LOT}", lot_unique)
            texte_etiquette = texte_etiquette.replace("{VALUE}", str(value))
            texte_etiquette = texte_etiquette.replace("{UNIT}", product.unit_symbol if hasattr(product, 'unit_symbol') else "U")
            
            # Gestion des faces/doublons identiques via la commande Zebra ^PQ
            if labels_per_colis > 1:
                texte_etiquette = texte_etiquette.replace("^XZ", f"^PQ{labels_per_colis}^XZ")
            
            zpl_final_global += texte_etiquette + "\n"

        # 3. Envoi direct au Spooler USB de Windows
        if not win32print:
            return Response({"error": "Le module win32print n'est pas disponible (Vérifiez que vous êtes sur Windows)"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        try:
            # Ouverture de la connexion vers l'imprimante
            hPrinter = win32print.OpenPrinter(NOM_IMPRIMANTE)
            try:
                # Création d'un travail d'impression en mode texte brut (RAW)
                hJob = win32print.StartDocPrinter(hPrinter, 1, ("Flux ERP Mar Plastic", None, "RAW"))
                win32print.StartPagePrinter(hPrinter)
                
                # On envoie les octets du ZPL
                win32print.WritePrinter(hPrinter, zpl_final_global.encode('utf-8'))
                
                win32print.EndPagePrinter(hPrinter)
                win32print.EndDocPrinter(hPrinter)
            finally:
                win32print.ClosePrinter(hPrinter)
                
            return Response({
                "status": "success", 
                "message": f"Ordre envoyé ! {colis_count * labels_per_colis} étiquette(s) en cours d'impression."
            })
            
        except Exception as e:
            return Response({
                "status": "error", 
                "message": f"Impossible de joindre l'imprimante USB : {str(e)}"
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)