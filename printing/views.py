import os
import re
import socket
import datetime
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import viewsets, status
from dotenv import load_dotenv
from django.db.models import Q

from .models import (
    Category, LabelTemplate, Product, ConfigurationImprimante, 
    Client, ImpressionEtiquette
)
from .serializers import (
    CategorySerializer, LabelTemplateSerializer, ProductSerializer,
    ClientSerializer, ConfigurationImprimanteSerializer, ImpressionEtiquetteSerializer
)

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
# HELPER : CONTRÔLE MATÉRIEL ZEBRA (~HS)
# =================================================================

def check_zebra_hardware_status(ip, port=9100):
    """
    Interroge l'imprimante Zebra via ~HS (Host Status Return).
    Bloque l'envoi si la machine est en PAUSE, sans papier ou tête ouverte.
    """
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(2.5)
            s.connect((ip, port))
            s.sendall(b"~HS\r\n")
            
            raw_data = s.recv(1024)
            response = raw_data.decode('latin-1', errors='ignore')

            lignes = [
                l.strip().replace('\x02', '').replace('\x03', '') 
                for l in response.splitlines() 
                if l.strip()
            ]

            if not lignes:
                return False, "Imprimante injoignable ou muette (aucun retour d'état ~HS)"

            # Analyse de la Ligne 1 : aaa,b,c,dddd,eee,f,...
            champs_l1 = [c.strip() for c in lignes[0].split(',')]
            if len(champs_l1) >= 3:
                paper_out = champs_l1[1]
                pause_flag = champs_l1[2]

                if pause_flag == '1':
                    return False, "Imprimante en PAUSE physique (bouton Pause activé)"
                if paper_out == '1':
                    return False, "Fin de rouleau / Manque d'étiquettes"

            # Analyse de la Ligne 2 : mmm,n,o,p,...
            if len(lignes) >= 2:
                champs_l2 = [c.strip() for c in lignes[1].split(',')]
                if len(champs_l2) >= 4:
                    head_open = champs_l2[2]
                    ribbon_out = champs_l2[3]

                    if head_open == '1':
                        return False, "Tête d'impression ouverte"
                    if ribbon_out == '1':
                        return False, "Ruban transfert manquant / épuisé"

            return True, "Prête"

    except socket.timeout:
        return False, "Délai dépassé : l'imprimante ne répond pas"
    except Exception as e:
        return False, f"Erreur de communication : {str(e)}"


# =================================================================
# HELPER : COMPILATION UNIVERSELLE DU ZPL
# =================================================================

def compiler_zpl_dynamique(template_zpl, product_obj=None, config_poste=None, custom_data=None):
    """
    Injecte toutes les variables système, les saisies directes 
    et l'ensemble des caractéristiques en base (ProductAttributeValue).
    """
    now = datetime.datetime.now()
    today_str = now.strftime("%y%m%d")
    custom_data = custom_data or {}

    variables = {
        'DATE': now.strftime("%d/%m/%Y"),
        'DATE_ISO': now.strftime("%Y-%m-%d"),
        'LOT_SHORT': today_str,
        'POSTE': config_poste.code_poste if config_poste else '',
        'VALUE': str(custom_data.get('value', '')),
        'UNIT': str(custom_data.get('unit_str', '')),
        'CLIENT_NAME': str(custom_data.get('client_name', '')),
        'CLIENT_NUM': str(custom_data.get('client_num', '')),
    }

    # Injection automatique des champs libres de saisie
    for key, val in custom_data.items():
        if key not in ['raw_zpl', 'printer_id', 'code_poste', 'template_id', 'product_id'] and val is not None:
            variables[key.upper()] = str(val)

    if product_obj:
        variables['NAME'] = product_obj.name
        variables['SKU'] = product_obj.sku
        if hasattr(product_obj, 'unit') and product_obj.unit:
            unit_sym = product_obj.unit.abbreviation
            if unit_sym.upper() == 'U':
                unit_sym = 'pcs'
            variables['PRODUCT_UNIT'] = unit_sym
            if not variables['UNIT']:
                variables['UNIT'] = unit_sym

        # Parcours automatique de TOUTES les caractéristiques du catalogue
        for attr_val in product_obj.attribute_values.select_related('attribute', 'attribute__unit').all():
            nom_cle = attr_val.attribute.name.upper().strip().replace(' ', '_')
            val = str(attr_val.valeur).strip()
            unit_attr = attr_val.attribute.unit.abbreviation if attr_val.attribute.unit else ""

            if unit_attr and not val.upper().endswith(unit_attr.upper()):
                val_affichee = f"{val} {unit_attr}"
            else:
                val_affichee = val

            variables[nom_cle] = val_affichee
    else:
        variables['NAME'] = str(custom_data.get('custom_name', 'FABRICATION DIRECTE'))
        laize = custom_data.get('laize')
        micron = custom_data.get('micron')
        variables['SKU'] = f"BOB-{laize}-{micron}MIC" if laize and micron else "FAB-DIRECTE"

    texte_zpl = template_zpl
    for cle, valeur in variables.items():
        texte_zpl = texte_zpl.replace(f"{{{cle}}}", str(valeur))

    return texte_zpl


# =================================================================
# 1. VIEWSETS POUR L'API REST
# =================================================================

class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    # On renvoie TOUTES les catégories sans filtre ici
    queryset = Category.objects.all().order_by('name')
    serializer_class = CategorySerializer

class LabelTemplateViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = LabelTemplate.objects.all()
    serializer_class = LabelTemplateSerializer


class ProductViewSet(viewsets.ReadOnlyModelViewSet):
    # Renvoyer TOUS les produits sans filtre sur is_printable
    queryset = Product.objects.all().select_related('unit', 'category', 'custom_template')
    serializer_class = ProductSerializer

class ClientViewSet(viewsets.ModelViewSet):
    queryset = Client.objects.all().order_by('nom')
    serializer_class = ClientSerializer


class ConfigurationImprimanteViewSet(viewsets.ModelViewSet):
    queryset = ConfigurationImprimante.objects.all()
    serializer_class = ConfigurationImprimanteSerializer


class ImpressionEtiquetteViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ImpressionEtiquette.objects.all().order_by('-id')
    serializer_class = ImpressionEtiquetteSerializer


# =================================================================
# 2. PILOTAGE DES IMPRIMANTES WINDOWS
# =================================================================

try:
    import win32print
except ImportError:
    win32print = None


# =================================================================
# 3. API D'IMPRESSION DES ÉTIQUETTES
# =================================================================

class PrintLabelAPIView(APIView):
    def post(self, request, *args, **kwargs):
        product_id = request.data.get('product_id')
        printer_id = request.data.get('printer_id')
        template_id = request.data.get('template_id')
        client_raw_zpl = request.data.get('raw_zpl')

        client_name = request.data.get('client_name', '')
        client_num = request.data.get('client_num', '')
        value = request.data.get('value', '')
        unit_str = request.data.get('unit_str', 'U')

        try:
            colis_count = int(request.data.get('colis_count', 1))
        except (ValueError, TypeError):
            colis_count = 1

        try:
            labels_per_colis = int(request.data.get('labels_per_colis', 1))
        except (ValueError, TypeError):
            labels_per_colis = 1
        
        # -----------------------------------------------------------------
        # 1. IDENTIFICATION DU POSTE / IMPRIMANTE
        # -----------------------------------------------------------------
        client_ip = get_client_ip(request)
        code_du_poste = request.data.get('code_poste')

        config = None
        if printer_id:
            config = ConfigurationImprimante.objects.filter(id=printer_id).first()

        if not config and code_du_poste:
            config = ConfigurationImprimante.objects.filter(code_poste=code_du_poste).first()

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
                "error": f"Poste non reconnu pour l'IP '{client_ip}'. Créez une configuration dans l'admin Django."
            }, status=status.HTTP_400_BAD_REQUEST)

        # -----------------------------------------------------------------
        # 2. CHARGEMENT PRODUIT ET BASE DU MODÈLE ZPL
        # -----------------------------------------------------------------
        product_obj = None
        if product_id:
            try:
                product_obj = Product.objects.select_related('unit', 'category', 'custom_template').prefetch_related(
                    'attribute_values__attribute__unit'
                ).get(id=product_id)
                product_name = product_obj.name
                sku_display = product_obj.sku
                if hasattr(product_obj, 'unit') and product_obj.unit:
                    unit_str = product_obj.unit.abbreviation
                    if unit_str.upper() == 'U':
                        unit_str = 'pcs'
            except Product.DoesNotExist:
                return Response({"error": "Produit introuvable dans la base de données"}, status=status.HTTP_404_NOT_FOUND)
        else:
            product_name = str(request.data.get('custom_name', 'FABRICATION DIRECTE'))
            sku_display = "FAB-DIRECTE"

        if client_raw_zpl:
            zpl_base = client_raw_zpl
        else:
            zpl_template = None
            if template_id:
                tpl = LabelTemplate.objects.filter(id=template_id).first()
                if tpl:
                    zpl_template = tpl.zpl_code

            if not zpl_template and product_obj:
                if product_obj.custom_template:
                    zpl_template = product_obj.custom_template.zpl_code
                elif product_obj.category and product_obj.category.default_template:
                    zpl_template = product_obj.category.default_template.zpl_code

            if not zpl_template:
                tpl_def = LabelTemplate.objects.filter(name__icontains="Bobine").first() or LabelTemplate.objects.first()
                if tpl_def:
                    zpl_template = tpl_def.zpl_code

            if not zpl_template:
                return Response({"error": "Aucun modèle d'étiquette ZPL valide n'a pu être chargé."}, status=status.HTTP_400_BAD_REQUEST)

            zpl_base = compiler_zpl_dynamique(
                template_zpl=zpl_template,
                product_obj=product_obj,
                config_poste=config,
                custom_data=request.data
            )
        
        # -----------------------------------------------------------------
        # 3. CONSTRUCTION DU LOT ET FLUX MULTI-COLIS
        # -----------------------------------------------------------------
        zpl_final_global = ""
        now = datetime.datetime.now()
        today_date = now.date()
        today_str = now.strftime("%y%m%d")

        raw_code = config.code_poste.upper().replace("PC_", "")
        prefixe_match = re.search(r'([A-Z]{3,4}).*?(\d+)', raw_code)
        prefixe_poste = f"{prefixe_match.group(1)[:3]}{prefixe_match.group(2)}" if prefixe_match else raw_code[:4]
        lot_commun = f"{prefixe_poste}-{today_str}"

        try:
            tirages_jour_poste = ImpressionEtiquette.objects.filter(
                code_poste=config.code_poste,
                date_impression__date=today_date
            ).count()
        except Exception:
            tirages_jour_poste = ImpressionEtiquette.objects.filter(
                code_poste=config.code_poste
            ).count()

        liste_tirages_unitaires = []

        for i in range(colis_count):
            index_colis = i + 1
            seq_globale = tirages_jour_poste + index_colis
            code_colis_unique = f"{lot_commun}-{seq_globale:04d}"
            colis_ratio = f"{index_colis}/{colis_count}" if colis_count > 1 else str(index_colis)

            texte_etiquette = zpl_base

            # 1. On nettoie tout éventuel ^PQ qui aurait été injecté par erreur par le front
            texte_etiquette = re.sub(r'\^PQ\d+', '', texte_etiquette)

            # 2. Si le front a déjà mis '...-0001' à cause de l'aperçu, on remplace ce vieux code par le vrai lot incrémenté
            if f"{lot_commun}-0001" in texte_etiquette:
                texte_etiquette = texte_etiquette.replace(f"{lot_commun}-0001", code_colis_unique)
            else:
                texte_etiquette = texte_etiquette.replace("{LOT}", code_colis_unique)

            texte_etiquette = texte_etiquette.replace("{LOT_BATCH}", lot_commun)
            texte_etiquette = texte_etiquette.replace("{COLIS}", colis_ratio)
            texte_etiquette = texte_etiquette.replace("{LOT_SHORT}", today_str)

            # 3. Purge des balises restantes
            texte_etiquette = re.sub(r'\{[A-Z0-9_]+\}', '', texte_etiquette)

            # 4. On applique le nombre d'exemplaires PAR COLIS (ex: 2 étiquettes par carton)
            if labels_per_colis > 1:
                texte_etiquette = texte_etiquette.replace("^XZ", f"^PQ{labels_per_colis}^XZ")

            zpl_final_global += texte_etiquette + "\n"
            liste_tirages_unitaires.append({
                "lot": code_colis_unique,
                "colis_index": index_colis,
                "colis_total": colis_count,
                "zpl": texte_etiquette
            })

        total_etiquettes_imprimees = colis_count * labels_per_colis
        client_obj = Client.objects.filter(nom__iexact=client_name).first() if client_name else None

        # -----------------------------------------------------------------
        # PERSISTANCE GÉNÉRIQUE DE L'HISTORIQUE
        # -----------------------------------------------------------------
        def enregistrer_historique():
            try:
                # Capture automatique de tout ce qui a été transmis sans figer de schéma
                snapshot_data = {
                    k: v for k, v in request.data.items()
                    if k not in ['raw_zpl', 'printer_id', 'code_poste'] and v is not None and v != ''
                }

                has_parametres_field = any(f.name == 'parametres' for f in ImpressionEtiquette._meta.get_fields())

                for tirage in liste_tirages_unitaires:
                    create_kwargs = {
                        'code_poste': config.code_poste,
                        'ip_client': client_ip,
                        'numero_lot': tirage["lot"],
                        'colis_index': tirage["colis_index"],
                        'colis_total': tirage["colis_total"],
                        'produit_nom': product_name,
                        'sku': sku_display,
                        'client_nom': client_name,
                        'quantite_valeur': str(value),
                        'unite': str(unit_str),
                        'labels_per_colis': labels_per_colis,
                        'total_etiquettes': total_etiquettes_imprimees,
                        'zpl_genere': tirage["zpl"],
                        'product': product_obj,
                        'client': client_obj
                    }

                    # Si le modèle a le champ JSONField 'parametres', on l'utilise
                    if has_parametres_field:
                        create_kwargs['parametres'] = snapshot_data
                    else:
                        # Rétrocompatibilité avec les anciennes colonnes si non encore migrées
                        for col in ['laize', 'micron', 'type_details', 'qty_details', 'poids_net', 'poids_brut']:
                            if any(f.name == col for f in ImpressionEtiquette._meta.get_fields()):
                                create_kwargs[col] = str(snapshot_data.get(col, '')) or None

                    ImpressionEtiquette.objects.create(**create_kwargs)

            except Exception as db_err:
                with open("erreur_impression_db.log", "a", encoding="utf-8") as f:
                    f.write(f"[{datetime.datetime.now()}] Erreur DB: {str(db_err)}\n")

        # -----------------------------------------------------------------
        # 4. DÉDUCTION DU STOCK DE L'EMBALLAGE CONSOMMÉ
        # -----------------------------------------------------------------
        packaging_id = request.data.get('packaging_id')
        if packaging_id:
            try:
                pkg_obj = Product.objects.get(id=packaging_id)
                # 1 carton / palette par colis imprimé
                quantite_consommee = colis_count
                if hasattr(pkg_obj, 'apply_movement'):
                    pkg_obj.apply_movement(
                        quantity=-quantite_consommee,
                        movement_type='PRINT_CONSUMPTION',
                        note=f"Sortie étiquetage : {total_etiquettes_imprimees} étiquette(s) ({colis_count} colis) - {sku_display}"
                    )
                else:
                    pkg_obj.stock_actuel = max(0, pkg_obj.stock_actuel - quantite_consommee)
                    pkg_obj.save()
            except Product.DoesNotExist:
                pass

        # -----------------------------------------------------------------
        # 5. ENVOI PHYSIQUE & VALIDATION
        # -----------------------------------------------------------------
        if config.mode_connexion == 'DESACTIVE':
            enregistrer_historique()
            return Response({
                "status": "success",
                "message": f"[Mode Test - {config.code_poste}] {total_etiquettes_imprimees} étiquette(s) enregistrée(s)."
            })

        elif config.mode_connexion == 'RESEAU':
            if not config.adresse_ip:
                return Response({
                    "error": f"Adresse IP non configurée pour le poste '{config.code_poste}'"
                }, status=status.HTTP_400_BAD_REQUEST)

            port_cible = config.port_reseau or 9100

            is_ready, reason = check_zebra_hardware_status(config.adresse_ip, port_cible)
            if not is_ready:
                return Response({
                    "status": "error",
                    "message": f"Défaut imprimante ({config.code_poste}) : {reason}. Corrigez le problème sur la machine avant de relancer."
                }, status=status.HTTP_400_BAD_REQUEST)

            try:
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.settimeout(3.5)
                    s.connect((config.adresse_ip, port_cible))
                    s.sendall(zpl_final_global.encode('utf-8'))
            except Exception as sock_err:
                return Response({
                    "status": "error",
                    "message": f"Imprimante injoignable ({config.adresse_ip}:{port_cible}) : {str(sock_err)}"
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            enregistrer_historique()
            return Response({
                "status": "success",
                "message": f"{total_etiquettes_imprimees} étiquette(s) envoyée(s) à {config.nom_emplacement or config.code_poste} ({config.adresse_ip})."
            }, status=status.HTTP_200_OK)

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
                    
                enregistrer_historique()
                return Response({
                    "status": "success", 
                    "message": f"Ordre envoyé à l'imprimante USB '{config.nom_systeme_windows}' ({config.code_poste})."
                })
            except Exception as e:
                return Response({
                    "status": "error", 
                    "message": f"Erreur imprimante USB ({config.nom_systeme_windows}) : {str(e)}"
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({"error": "Mode de connexion inconnu"}, status=status.HTTP_400_BAD_REQUEST)