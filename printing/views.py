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
from .serializers import (
    CategorySerializer, LabelTemplateSerializer, ProductSerializer, 
    ConfigurationImprimanteSerializer
)

load_dotenv()

# =================================================================
# HELPER : DÉTECTION DYNAMIQUE DE L'IP CLIENT
# =================================================================

def get_client_ip(request):
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        return x_forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


# =================================================================
# 1. VIEWSETS POUR L'API REST
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

class ImpressionEtiquetteSerializer(ModelSerializer):
    class Meta:
        model = ImpressionEtiquette
        fields = '__all__'

class ImpressionEtiquetteViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ImpressionEtiquette.objects.all().order_by('-date_impression')
    serializer_class = ImpressionEtiquetteSerializer

class ConfigurationImprimanteViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ConfigurationImprimante.objects.filter(mode_connexion='RESEAU')
    serializer_class = ConfigurationImprimanteSerializer


# =================================================================
# 2. PILOTAGE DES IMPRIMANTES WINDOWS
# =================================================================

try:
    import win32print
except ImportError:
    win32print = None


# =================================================================
# 3. API D'IMPRESSION (INCRÉMENTATION UNITAIRE & ROUTAGE SÉCURISÉ)
# =================================================================

class PrintLabelAPIView(APIView):
    def post(self, request, *args, **kwargs):
        is_free_input = request.data.get('is_free_input', False)
        product_id = request.data.get('product_id')
        
        client_name = request.data.get('client_name', '')
        client_num = request.data.get('client_num', '')
        value = request.data.get('value', '')
        
        # Données de saisie directe (Bobine / Extrusion)
        custom_name = request.data.get('custom_name', 'GAINE PEBD NEUTRE')
        laize = request.data.get('laize', '')
        micron = request.data.get('micron', '')
        unit_str = request.data.get('unit_str', 'Kg')

        # Données spécifiques étiquette Carton / Expédition
        type_details = request.data.get('type_details', '')
        qty_details = request.data.get('qty_details', '')
        destination = request.data.get('destination', '')
        poids_net = request.data.get('poids_net', '')
        poids_brut = request.data.get('poids_brut', '')

        # Calcul du nombre total d'étiquettes à générer
        colis_count_in = int(request.data.get('colis_count', 1))
        labels_per_colis_in = int(request.data.get('labels_per_colis', 1))
        total_etiquettes = max(1, colis_count_in * labels_per_colis_in)

        # -----------------------------------------------------------------
        # A. IDENTIFICATION DE L'IMPRIMANTE CIBLE
        # -----------------------------------------------------------------
        client_ip = get_client_ip(request)
        printer_id = request.data.get('printer_id')
        station_code = request.data.get('station_code')

        config = None

        if printer_id:
            config = ConfigurationImprimante.objects.filter(id=printer_id).first()

        if not config and station_code:
            config = ConfigurationImprimante.objects.filter(code_poste=station_code).first()

        if not config:
            config = ConfigurationImprimante.objects.filter(adresse_ip=client_ip).first()

        if not config and client_ip in ['127.0.0.1', '::1', 'localhost']:
            env_code = os.environ.get('IDENTIFIANT_POSTE', 'PC_BUREAU')
            config = ConfigurationImprimante.objects.filter(code_poste=env_code).first()

        if not config:
            config = ConfigurationImprimante.objects.filter(mode_connexion='RESEAU').first()

        if not config:
            config = ConfigurationImprimante.objects.first()

        if not config:
            return Response({
                "error": f"Aucune imprimante configurée pour le poste '{station_code or client_ip}'."
            }, status=status.HTTP_400_BAD_REQUEST)

        print(f"🖨️ [Impression] Cible: {config.code_poste} ({config.adresse_ip or config.nom_systeme_windows}) - {total_etiquettes} étiquette(s)")

        # -----------------------------------------------------------------
        # B. RÉCUPÉRATION DU TEMPLATE ZPL
        # -----------------------------------------------------------------
        template_id = request.data.get('template_id')
        zpl_template = None

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
            
            if not zpl_template:
                template_bobine = LabelTemplate.objects.filter(name__icontains="Bobine").first()
                if not template_bobine:
                    template_bobine = LabelTemplate.objects.first()
                if template_bobine:
                    zpl_template = template_bobine.zpl_code

        if not zpl_template:
            return Response({"error": "Aucun modèle d'étiquette ZPL valide trouvé."}, status=status.HTTP_400_BAD_REQUEST)

        # -----------------------------------------------------------------
        # C. GÉNÉRATION UNITAIRE : UN LOT ET UNE LIGNE PAR ÉTIQUETTE
        # -----------------------------------------------------------------
        zpl_final_global = ""
        now = datetime.datetime.now()
        today_str = now.strftime("%Y%m%d")
        timestamp_commande = now.strftime("%H%M%S")

        dest_val = client_name if client_name else (destination if destination else "")
        client_obj = Client.objects.filter(nom__iexact=client_name).first() if client_name else None

        records_to_create = []

        for idx in range(1, total_etiquettes + 1):
            # Incrémentation séquentielle du numéro de lot pour chaque étiquette
            lot_unique = f"SO-{today_str[2:]}-{timestamp_commande[-4:]}-{idx}"
            texte_etiquette = zpl_template
            
            # Remplacement des variables ZPL
            texte_etiquette = texte_etiquette.replace("{NAME}", str(product_name))
            texte_etiquette = texte_etiquette.replace("{SKU}", str(sku_display))
            texte_etiquette = texte_etiquette.replace("{LOT}", lot_unique)
            texte_etiquette = texte_etiquette.replace("{VALUE}", str(value) if value else "")
            texte_etiquette = texte_etiquette.replace("{UNIT}", str(unit_str))
            texte_etiquette = texte_etiquette.replace("{LAIZE}", str(laize) if laize else "")
            texte_etiquette = texte_etiquette.replace("{MICRON}", str(micron) if micron else "")
            texte_etiquette = texte_etiquette.replace("{CLIENT_NAME}", str(client_name) if client_name else "")
            texte_etiquette = texte_etiquette.replace("{CLIENT_NUM}", str(client_num) if client_num else "")
            
            texte_etiquette = texte_etiquette.replace("{TYPE_DETAILS}", str(type_details) if type_details else "")
            texte_etiquette = texte_etiquette.replace("{QTY_DETAILS}", str(qty_details) if qty_details else "")
            texte_etiquette = texte_etiquette.replace("{DESTINATION}", str(dest_val).upper() if dest_val else "")
            texte_etiquette = texte_etiquette.replace("{POIDS_NET}", str(poids_net) if poids_net else "")
            texte_etiquette = texte_etiquette.replace("{POIDS_BRUT}", str(poids_brut) if poids_brut else "")
            
            zpl_final_global += texte_etiquette + "\n"

            # Préparation d'une ligne d'historique par étiquette unitaire
            records_to_create.append(
                ImpressionEtiquette(
                    code_poste=config.code_poste,
                    ip_client=client_ip,
                    numero_lot=lot_unique,
                    colis_index=idx,
                    colis_total=total_etiquettes,
                    produit_nom=product_name,
                    sku=sku_display,
                    client_nom=client_name or "",
                    # ❌ LIGNE DESTINATION SUPPRIMÉE ICI
                    laize=str(laize) if laize else None,
                    micron=str(micron) if micron else None,
                    quantite_valeur=str(value) if value else None,
                    unite=str(unit_str),
                    type_details=str(type_details) if type_details else None,
                    qty_details=str(qty_details) if qty_details else None,
                    poids_net=str(poids_net) if poids_net else None,
                    poids_brut=str(poids_brut) if poids_brut else None,
                    labels_per_colis=1,
                    total_etiquettes=1,
                    zpl_genere=texte_etiquette,
                    product=product_obj,
                    client=client_obj
                )
            )

        # -----------------------------------------------------------------
        # D. ENVOI PHYSIQUE PUIS SAUVEGARDE EN BASE
        # -----------------------------------------------------------------

        if config.mode_connexion == 'DESACTIVE':
            ImpressionEtiquette.objects.bulk_create(records_to_create)
            return Response({
                "status": "success",
                "message": f"[Mode Test - {config.code_poste}] {total_etiquettes} étiquette(s) simulée(s)."
            })

        elif config.mode_connexion == 'RESEAU':
            if not config.adresse_ip:
                return Response({
                    "error": f"Adresse IP non configurée pour le poste '{config.code_poste}'"
                }, status=status.HTTP_400_BAD_REQUEST)
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.settimeout(3.0)
                s.connect((config.adresse_ip, config.port_reseau or 9100))
                s.sendall(zpl_final_global.encode('utf-8'))
                s.close()

                # Enregistrement en base UNIQUEMENT si le socket a transmis les données
                ImpressionEtiquette.objects.bulk_create(records_to_create)

                return Response({
                    "status": "success",
                    "message": f"{total_etiquettes} étiquette(s) envoyée(s) à {config.nom_emplacement or config.code_poste} ({config.adresse_ip})."
                })
            except Exception as e:
                # Échec de liaison : aucun historique enregistré
                return Response({
                    "status": "error",
                    "message": f"Imprimante hors ligne ({config.adresse_ip}:{config.port_reseau or 9100}) : {str(e)}"
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

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

                ImpressionEtiquette.objects.bulk_create(records_to_create)

                return Response({
                    "status": "success", 
                    "message": f"{total_etiquettes} étiquette(s) envoyée(s) à l'imprimante USB '{config.nom_systeme_windows}'."
                })
            except Exception as e:
                return Response({
                    "status": "error", 
                    "message": f"Erreur imprimante USB Windows ({config.nom_systeme_windows}) : {str(e)}"
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({"error": "Mode de connexion inconnu"}, status=status.HTTP_400_BAD_REQUEST)