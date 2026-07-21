import os
import socket
import datetime
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import viewsets, status
from rest_framework.serializers import ModelSerializer
from dotenv import load_dotenv

from .models import Category, LabelTemplate, Product, ConfigurationImprimante, Client
from .serializers import CategorySerializer, LabelTemplateSerializer, ProductSerializer

# Chargement du fichier .env au démarrage du serveur
load_dotenv()

# =================================================================
# 1. VIEWSETS POUR L'API REST (LECTURE DES DONNÉES)
# =================================================================

class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer

class LabelTemplateViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = LabelTemplate.objects.all()
    serializer_class = LabelTemplateSerializer

class ProductViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer

class ClientSerializer(ModelSerializer):
    class Meta:
        model = Client
        fields = ['id', 'nom', 'numero_client']

class ClientViewSet(viewsets.ModelViewSet):
    queryset = Client.objects.all().order_by('nom')
    serializer_class = ClientSerializer


# =================================================================
# 2. PILOTAGE DES IMPRIMANTES WINDOWS
# =================================================================

# Essai d'import de win32print (Windows uniquement)
try:
    import win32print
except ImportError:
    win32print = None


# =================================================================
# 3. API D'IMPRESSION DES ÉTIQUETTES (MODE HYBRIDE)
# =================================================================

class PrintLabelAPIView(APIView):
    def post(self, request, *args, **kwargs):
        is_free_input = request.data.get('is_free_input', False)
        product_id = request.data.get('product_id')
        
        client_name = request.data.get('client_name', '')
        client_num = request.data.get('client_num', '')
        value = request.data.get('value', '')
        
        # Données de la saisie volante (Bobine / Extrusion)
        custom_name = request.data.get('custom_name', 'GAINE PEBD NEUTRE')
        laize = request.data.get('laize', '')
        micron = request.data.get('micron', '')
        unit_str = request.data.get('unit_str', 'Kg')

        colis_count = int(request.data.get('colis_count', 1))
        labels_per_colis = int(request.data.get('labels_per_colis', 1))
        
        # 1. Identification du poste physique via le fichier .env local
        code_du_poste = os.environ.get('IDENTIFIANT_POSTE', 'PC_LAPTOP')
        
        # 2. Récupération de la configuration d'impression pour ce poste spécifique
        config = ConfigurationImprimante.objects.filter(code_poste=code_du_poste).first()
        if not config:
            return Response({
                "error": f"Le poste informatique '{code_du_poste}' n'est pas configuré dans l'admin Django."
            }, status=status.HTTP_400_BAD_REQUEST)

        # 3. Récupération du Produit ou Mode Saisie Volante Directe
        if product_id:
            try:
                product = Product.objects.get(id=product_id)
                product_name = product.name
                sku_display = product.sku
                unit_str = product.unit.abbreviation if product.unit else "U"

                # Sélection du template ZPL (Spécifique > Catégorie > Secours)
                if product.custom_template:
                    zpl_template = product.custom_template.zpl_code
                elif product.category and product.category.default_template:
                    zpl_template = product.category.default_template.zpl_code
                else:
                    template_fallback = LabelTemplate.objects.first()
                    zpl_template = template_fallback.zpl_code if template_fallback else ""
            except Product.DoesNotExist:
                return Response({"error": "Produit introuvable dans la base de données"}, status=status.HTTP_404_NOT_FOUND)
        else:
            # Mode Saisie Volante (Sortie de machine / Pas de product_id)
            product_name = custom_name
            sku_display = f"BOB-{laize}-{micron}MIC" if laize and micron else "FAB-DIRECTE"
            
            # Cherche un modèle dédié "Bobine" ou prend le premier modèle disponible
            template_bobine = LabelTemplate.objects.filter(name__icontains="Bobine").first()
            if not template_bobine:
                template_bobine = LabelTemplate.objects.first()
            
            if template_bobine:
                zpl_template = template_bobine.zpl_code
            else:
                return Response({"error": "Aucun modèle d'étiquette ZPL n'est configuré dans l'admin."}, status=status.HTTP_400_BAD_REQUEST)

        # 4. Construction de la chaîne ZPL globale
        zpl_final_global = ""
        now = datetime.datetime.now()
        today_str = now.strftime("%Y%m%d")
        timestamp_commande = now.strftime("%H%M%S")

        for i in range(colis_count):
            lot_unique = f"MP-{today_str}-{timestamp_commande}-{i+1}"
            
            texte_etiquette = zpl_template
            texte_etiquette = texte_etiquette.replace("{NAME}", str(product_name))
            texte_etiquette = texte_etiquette.replace("{SKU}", str(sku_display))
            texte_etiquette = texte_etiquette.replace("{LOT}", lot_unique)
            texte_etiquette = texte_etiquette.replace("{VALUE}", str(value))
            texte_etiquette = texte_etiquette.replace("{UNIT}", str(unit_str))
            texte_etiquette = texte_etiquette.replace("{LAIZE}", str(laize))
            texte_etiquette = texte_etiquette.replace("{MICRON}", str(micron))
            
            # Injection des données clients (si absent ou vide -> laisse un espace blanc)
            texte_etiquette = texte_etiquette.replace("{CLIENT_NAME}", str(client_name) if client_name else "")
            texte_etiquette = texte_etiquette.replace("{CLIENT_NUM}", str(client_num) if client_num else "")
            
            if labels_per_colis > 1:
                texte_etiquette = texte_etiquette.replace("^XZ", f"^PQ{labels_per_colis}^XZ")
            
            zpl_final_global += texte_etiquette + "\n"

        # =================================================================
        # 5. AIGUILLAGE DE L'IMPRESSION SELON LA CONFIGURATION DE L'ADMIN
        # =================================================================

        # --- MODE A : DÉSACTIVÉ / SIMULÉ (Mode Test Laptop) ---
        if config.mode_connexion == 'DESACTIVE':
            print(f"\n--- 📝 [MODE TEST - {code_du_poste}] Flux ZPL généré ---")
            print(zpl_final_global)
            print("--------------------------------------------------\n")
            return Response({
                "status": "success",
                "message": f"[Mode Test] {colis_count * labels_per_colis} étiquette(s) simulée(s) dans le terminal du laptop."
            })

        # --- MODE B : RÉSEAU (IP direct sur port 9100) ---
        elif config.mode_connexion == 'RESEAU':
            if not config.adresse_ip:
                return Response({"error": "Adresse IP non configurée pour ce poste dans l'admin"}, status=status.HTTP_400_BAD_REQUEST)
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.settimeout(5)
                s.connect((config.adresse_ip, config.port_reseau))
                s.sendall(zpl_final_global.encode('utf-8'))
                s.close()
                return Response({
                    "status": "success",
                    "message": f"Flux envoyé en réseau à la Zebra ({config.adresse_ip})."
                })
            except Exception as e:
                return Response({
                    "status": "error",
                    "message": f"Impossible de joindre la Zebra sur le réseau à l'adresse {config.adresse_ip} : {str(e)}"
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # --- MODE C : USB LOCAL (Spooler Windows via win32print) ---
        elif config.mode_connexion == 'USB':
            if not win32print:
                return Response({
                    "error": "Le module win32print n'est pas disponible sur ce système."
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            try:
                hPrinter = win32print.OpenPrinter(config.nom_systeme_windows)
                try:
                    hJob = win32print.StartDocPrinter(hPrinter, 1, ("Flux ERP Mar Plastic", None, "RAW"))
                    win32print.StartPagePrinter(hPrinter)
                    win32print.WritePrinter(hPrinter, zpl_final_global.encode('utf-8'))
                    win32print.EndPagePrinter(hPrinter)
                    win32print.EndDocPrinter(hPrinter)
                finally:
                    win32print.ClosePrinter(hPrinter)
                    
                return Response({
                    "status": "success", 
                    "message": f"Ordre envoyé à l'imprimante USB '{config.nom_systeme_windows}'."
                })
            except Exception as e:
                return Response({
                    "status": "error", 
                    "message": f"Erreur avec l'imprimante USB Windows ({config.nom_systeme_windows}) : {str(e)}"
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({"error": "Mode de connexion inconnu"}, status=status.HTTP_400_BAD_REQUEST)