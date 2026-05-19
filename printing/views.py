import os
import socket
import datetime
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import viewsets, status
from dotenv import load_dotenv

from .models import Category, LabelTemplate, Product, ConfigurationImprimante
from .serializers import CategorySerializer, LabelTemplateSerializer, ProductSerializer

# Chargement du fichier .env au démarrage du serveur
load_dotenv()

class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer

class LabelTemplateViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = LabelTemplate.objects.all()
    serializer_class = LabelTemplateSerializer

class ProductViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer

# Essai d'import de win32print (Windows uniquement)
try:
    import win32print
except ImportError:
    win32print = None


class PrintLabelAPIView(APIView):
    def post(self, request):
        product_id = request.data.get('product_id')
        value = request.data.get('value', '')
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
        
        # 3. Récupération du produit
        try:
            product = Product.objects.get(id=product_id)
        except Product.DoesNotExist:
            return Response({"error": "Produit introuvable"}, status=status.HTTP_404_NOT_FOUND)

        # 4. Récupération du template ZPL
        if product.custom_template:
            zpl_template = product.custom_template.zpl_code
        elif product.category and product.category.default_template:
            zpl_template = product.category.default_template.zpl_code
        else:
            return Response({"error": "Aucun modèle ZPL configuré pour ce produit"}, status=status.HTTP_400_BAD_REQUEST)

        # 5. Construction de la chaîne ZPL globale
        zpl_final_global = ""
        now = datetime.datetime.now()
        today_str = now.strftime("%Y%m%d")
        # On fige le timestamp au moment précis où l'API reçoit le clic sur le bouton vert
        timestamp_commande = now.strftime("%H%M%S") 

        for i in range(colis_count):
            # L'index i+1 garantit qu'aucun carton n'aura le même numéro de lot
            lot_unique = f"MP-{today_str}-{timestamp_commande}-{i+1}"
            
            texte_etiquette = zpl_template
            texte_etiquette = texte_etiquette.replace("{NAME}", product.name)
            texte_etiquette = texte_etiquette.replace("{SKU}", product.sku)
            texte_etiquette = texte_etiquette.replace("{LOT}", lot_unique)
            texte_etiquette = texte_etiquette.replace("{VALUE}", str(value))
            texte_etiquette = texte_etiquette.replace("{UNIT}", product.unit_symbol if hasattr(product, 'unit_symbol') else "U")
            
            if labels_per_colis > 1:
                texte_etiquette = texte_etiquette.replace("^XZ", f"^PQ{labels_per_colis}^XZ")
            
            zpl_final_global += texte_etiquette + "\n"

        # =================================================================
        # 6. AIGUILLAGE DE L'IMPRESSION SELON LA CONFIGURATION DE L'ADMIN
        # =================================================================

        # --- MODE A : DÉSACTIVÉ / SIMULÉ (Parfait pour ton laptop) ---
        if config.mode_connexion == 'DESACTIVE':
            print(f"\n--- 📝 [MODE TEST - {code_du_poste}] Flux ZPL généré ---")
            print(zpl_final_global)
            print("--------------------------------------------------\n")
            return Response({
                "status": "success",
                "message": f"[Mode Test] {colis_count * labels_per_colis} étiquette(s) simulée(s) dans le terminal du laptop."
            })

        # --- MODE B : RÉSEAU (IP direct) ---
        elif config.mode_connexion == 'RESEAU':
            if not config.adresse_ip:
                return Response({"error": "Adresse IP non configurée pour ce poste dans l'admin"}, status=status.HTTP_400_BAD_REQUEST)
            try:
                # Connexion TCP brute sur le port de la Zebra (9100 par défaut)
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
                # Utilisation du nom d'imprimante dynamique spécifié dans l'admin du poste
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