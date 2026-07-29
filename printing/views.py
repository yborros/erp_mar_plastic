import os
import socket
import datetime
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import viewsets, status
from rest_framework.serializers import ModelSerializer
from dotenv import load_dotenv

from .models import (
    Category, LabelTemplate, Product, ConfigurationImprimante, 
    Client, ImpressionEtiquette
)
from .serializers import CategorySerializer, LabelTemplateSerializer, ProductSerializer

# Chargement du fichier .env au démarrage du serveur
load_dotenv()

# =================================================================
# HELPER : DÉTECTION DYNAMIQUE DE L'IP CLIENT
# =================================================================

def get_client_ip(request):
    """
    Extrait l'adresse IP réelle du poste ayant émis la requête.
    Prend en compte les reverse proxies (ex: Nginx) via HTTP_X_FORWARDED_FOR.
    """
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0].strip()
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip


# =================================================================
# 1. VIEWSETS POUR L'API REST (LECTURE DES DONNÉES & HISTORIQUE)
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


# Serializer et ViewSet pour l'historique des impressions
class ImpressionEtiquetteSerializer(ModelSerializer):
    class Meta:
        model = ImpressionEtiquette
        fields = '__all__'

class ImpressionEtiquetteViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ImpressionEtiquette.objects.all()
    serializer_class = ImpressionEtiquetteSerializer


# =================================================================
# 2. PILOTAGE DES IMPRIMANTES WINDOWS
# =================================================================

try:
    import win32print
except ImportError:
    win32print = None


# =================================================================
# 3. API D'IMPRESSION DES ÉTIQUETTES (DÉTECTION IP & TRAÇABILITÉ)
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

        # Données spécifiques à l'étiquette Carton / Expédition
        type_details = request.data.get('type_details', '')
        qty_details = request.data.get('qty_details', '')
        destination = request.data.get('destination', '')
        poids_net = request.data.get('poids_net', '')
        poids_brut = request.data.get('poids_brut', '')

        colis_count = int(request.data.get('colis_count', 1))
        labels_per_colis = int(request.data.get('labels_per_colis', 1))
        
        # -----------------------------------------------------------------
        # 1. IDENTIFICATION DU POSTE PAR IP OU VIA CODE EN SECOURS
        # -----------------------------------------------------------------
        client_ip = get_client_ip(request)
        code_du_poste = request.data.get('code_poste')

        config = None

        # A) Recherche explicite si un code_poste est fourni dans le payload
        if code_du_poste:
            config = ConfigurationImprimante.objects.filter(code_poste=code_du_poste).first()

        # B) Détection dynamique par adresse IP en BDD
        if not config:
            config = ConfigurationImprimante.objects.filter(adresse_ip=client_ip).first()

        # C) Cas particulier : Serveur local (127.0.0.1 / localhost) -> fallback sur .env local
        if not config and client_ip in ['127.0.0.1', '::1', 'localhost']:
            env_code = os.environ.get('IDENTIFIANT_POSTE', 'PC_BUREAU')
            config = ConfigurationImprimante.objects.filter(code_poste=env_code).first()

        # D) REPLI AUTOMATIQUE RÉSEAU : Si l'IP client n'est pas reconnue,
        #    on sélectionne la première imprimante configurée en mode RÉSEAU
        if not config:
            config = ConfigurationImprimante.objects.filter(mode_connexion='RESEAU').first()

        # E) Repli d'urgence si AUCUNE configuration n'existe dans la base
        if not config:
            config = ConfigurationImprimante.objects.first()

        if not config:
            return Response({
                "error": f"Poste non reconnu pour l'IP client '{client_ip}'. Veuillez créer une configuration dans l'admin Django."
            }, status=status.HTTP_400_BAD_REQUEST)

        print(f"🖨️ [Impression] Reçue de l'IP {client_ip} -> Configuration utilisée: {config.code_poste} ({config.adresse_ip})")

        # -----------------------------------------------------------------
        # 2. RÉCUPÉRATION DU PRODUIT ET DU TEMPLATE ZPL
        # -----------------------------------------------------------------
        template_id = request.data.get('template_id')  # <--- ID du modèle sélectionné dans le menu déroulant
        zpl_template = None

        # A) Si un modèle spécifique est sélectionné dans le menu déroulant
        if template_id:
            try:
                template_selected = LabelTemplate.objects.get(id=template_id)
                zpl_template = template_selected.zpl_code
            except LabelTemplate.DoesNotExist:
                pass

        product_obj = None
        if product_id:
            try:
                product_obj = Product.objects.get(id=product_id)
                product_name = product_obj.name
                sku_display = product_obj.sku
                unit_str = product_obj.unit.abbreviation if product_obj.unit else "U"

                # Si aucun modèle explicite n'a été choisi dans le menu déroulant, on utilise le template du produit/catégorie
                if not zpl_template:
                    if product_obj.custom_template:
                        zpl_template = product_obj.custom_template.zpl_code
                    elif product_obj.category and product_obj.category.default_template:
                        zpl_template = product_obj.category.default_template.zpl_code
                    else:
                        template_fallback = LabelTemplate.objects.first()
                        zpl_template = template_fallback.zpl_code if template_fallback else ""
            except Product.DoesNotExist:
                return Response({"error": "Produit introuvable dans la base de données"}, status=status.HTTP_404_NOT_FOUND)
        else:
            product_name = custom_name
            sku_display = f"BOB-{laize}-{micron}MIC" if laize and micron else "FAB-DIRECTE"
            
            # Si aucun modèle explicite n'a été choisi dans le menu déroulant, on cherche un modèle "Bobine"
            if not zpl_template:
                template_bobine = LabelTemplate.objects.filter(name__icontains="Bobine").first()
                if not template_bobine:
                    template_bobine = LabelTemplate.objects.first()
                
                if template_bobine:
                    zpl_template = template_bobine.zpl_code

        if not zpl_template:
            return Response({"error": "Aucun modèle d'étiquette ZPL valide n'a pu être chargé."}, status=status.HTTP_400_BAD_REQUEST)
        
        # -----------------------------------------------------------------
        # 3. CONSTRUCTION DE LA CHAÎNE ZPL
        # -----------------------------------------------------------------
        zpl_final_global = ""
        now = datetime.datetime.now()
        today_str = now.strftime("%Y%m%d")
        timestamp_commande = now.strftime("%H%M%S")

        # Détermination de la destination (Client ou saisie manuelle)
        dest_val = client_name if client_name else (destination if destination else "SUISSE")

        for i in range(colis_count):
            lot_unique = f"SO-{today_str[2:]}-{timestamp_commande[-4:]}"
            
            texte_etiquette = zpl_template
            
            # --- Substitutions Standard ---
            texte_etiquette = texte_etiquette.replace("{NAME}", str(product_name))
            texte_etiquette = texte_etiquette.replace("{SKU}", str(sku_display))
            texte_etiquette = texte_etiquette.replace("{LOT}", lot_unique)
            texte_etiquette = texte_etiquette.replace("{VALUE}", str(value))
            texte_etiquette = texte_etiquette.replace("{UNIT}", str(unit_str))
            texte_etiquette = texte_etiquette.replace("{LAIZE}", str(laize))
            texte_etiquette = texte_etiquette.replace("{MICRON}", str(micron))
            texte_etiquette = texte_etiquette.replace("{CLIENT_NAME}", str(client_name) if client_name else "")
            texte_etiquette = texte_etiquette.replace("{CLIENT_NUM}", str(client_num) if client_num else "")
            
            # --- Substitutions spécifiques Étiquette Carton Expédition ---
            texte_etiquette = texte_etiquette.replace("{TYPE_DETAILS}", str(type_details))
            texte_etiquette = texte_etiquette.replace("{QTY_DETAILS}", str(qty_details))
            texte_etiquette = texte_etiquette.replace("{DESTINATION}", str(dest_val).upper())
            texte_etiquette = texte_etiquette.replace("{POIDS_NET}", str(poids_net))
            texte_etiquette = texte_etiquette.replace("{POIDS_BRUT}", str(poids_brut))
            
            if labels_per_colis > 1:
                texte_etiquette = texte_etiquette.replace("^XZ", f"^PQ{labels_per_colis}^XZ")
            
            zpl_final_global += texte_etiquette + "\n"

        # -----------------------------------------------------------------
        # 4. ENREGISTREMENT DANS L'HISTORIQUE DE PRODUCTION (TRAÇABILITÉ)
        # -----------------------------------------------------------------
        total_etiquettes_imprimees = colis_count * labels_per_colis
        client_obj = Client.objects.filter(nom__iexact=client_name).first() if client_name else None

        ImpressionEtiquette.objects.create(
            code_poste=config.code_poste,
            ip_client=client_ip,
            produit_nom=product_name,
            sku=sku_display,
            client_nom=client_name,
            laize=str(laize) if laize else None,
            micron=str(micron) if micron else None,
            quantite_valeur=str(value),
            unite=str(unit_str),
            colis_count=colis_count,
            labels_per_colis=labels_per_colis,
            total_etiquettes=total_etiquettes_imprimees,
            zpl_genere=zpl_final_global,
            product=product_obj,
            client=client_obj
        )

        # -----------------------------------------------------------------
        # 5. ROUTAGE ET ENVOI À L'IMPRIMANTE
        # -----------------------------------------------------------------

        # --- MODE A : DÉSACTIVÉ / TEST ---
        if config.mode_connexion == 'DESACTIVE':
            print(f"\n--- 📝 [MODE TEST - {config.code_poste}] Flux ZPL généré ---")
            print(zpl_final_global)
            print("--------------------------------------------------\n")
            return Response({
                "status": "success",
                "message": f"[Mode Test - {config.code_poste}] {total_etiquettes_imprimees} étiquette(s) enregistrée(s) et simulée(s)."
            })

        # --- MODE B : RÉSEAU (IP direct sur port 9100) ---
        elif config.mode_connexion == 'RESEAU':
            if not config.adresse_ip:
                return Response({"error": f"Adresse IP non configurée pour le poste '{config.code_poste}' dans l'admin"}, status=status.HTTP_400_BAD_REQUEST)
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.settimeout(5)
                s.connect((config.adresse_ip, config.port_reseau))
                s.sendall(zpl_final_global.encode('utf-8'))
                s.close()
                return Response({
                    "status": "success",
                    "message": f"Flux envoyé en réseau au poste {config.code_poste} ({config.adresse_ip})."
                })
            except Exception as e:
                return Response({
                    "status": "error",
                    "message": f"Impossible de joindre l'imprimante sur le réseau ({config.adresse_ip}:{config.port_reseau}) : {str(e)}"
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # --- MODE C : USB LOCAL (Windows Spooler) ---
        elif config.mode_connexion == 'USB':
            if not win32print:
                return Response({
                    "error": "Le module win32print n'est pas disponible sur ce serveur."
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
                    "message": f"Ordre envoyé à l'imprimante USB '{config.nom_systeme_windows}' ({config.code_poste})."
                })
            except Exception as e:
                return Response({
                    "status": "error", 
                    "message": f"Erreur avec l'imprimante USB Windows ({config.nom_systeme_windows}) : {str(e)}"
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({"error": "Mode de connexion inconnu"}, status=status.HTTP_400_BAD_REQUEST)