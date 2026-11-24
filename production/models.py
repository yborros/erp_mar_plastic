from django.db import models
from django.utils import timezone


class OrdreFabrication(models.Model):
    STATUT_CHOICES = [
        ('BROUILLON', 'Brouillon'),
        ('PLANIFIE', 'Planifié'),
        ('EN_COURS', 'En cours de production'),
        ('SUSPENDU', 'Suspendu'),
        ('TERMINE', 'Terminé'),
        ('ANNULE', 'Annulé'),
    ]

    # Numéro automatique généré : OP + Date + Séquence (ex: OP260929001)
    numero_of = models.CharField(
        max_length=50, 
        unique=True, 
        blank=True,
        editable=False,
        verbose_name="N° d'OF", 
        help_text="Généré automatiquement (ex: OP260929001)"
    )
    
    # 1. Relation vers le catalogue (catalog.Product)
    produit = models.ForeignKey(
        'catalog.Product',
        on_delete=models.PROTECT,
        related_name='ordres_fabrication',
        verbose_name="Article / Produit"
    )

    # 2. Relation vers le client (printing.Client)
    client = models.ForeignKey(
        'printing.Client',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='ordres_fabrication',
        verbose_name="Client destinataire"
    )

    # 3. Quantités & Unité liée au catalogue (catalog.Unit)
    quantite_cible = models.DecimalField(
        max_digits=12, 
        decimal_places=2, 
        verbose_name="Quantité à produire"
    )
    quantite_produite = models.DecimalField(
        max_digits=12, 
        decimal_places=2, 
        default=0, 
        verbose_name="Quantité déjà produite"
    )
    unite = models.ForeignKey(
        'catalog.Unit',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        verbose_name="Unité de mesure",
        help_text="Héritée automatiquement du produit si non spécifiée"
    )

    # 4. Planification & Machine
    statut = models.CharField(
        max_length=20, 
        choices=STATUT_CHOICES, 
        default='PLANIFIE',
        verbose_name="État d'avancement"
    )
    poste_travail = models.CharField(
        max_length=50, 
        blank=True, 
        null=True, 
        default="S2",
        verbose_name="Poste / Machine",
        help_text="Ex: S2, EXTRUSION_01, SOUDURE_02"
    )
    pistes = models.PositiveIntegerField(
        default=1,
        verbose_name="Nombre de pistes (بيسط)"
    )
    
    # 5. Traçabilité amont
    lot_matiere = models.CharField(
        max_length=100, 
        blank=True, 
        null=True, 
        verbose_name="Lot Matière Première / Bobine Mère"
    )

    # 6. Horodatage & Suivi
    date_debut_prevue = models.DateField(default=timezone.now, verbose_name="Date début prévue")
    date_cloture = models.DateTimeField(blank=True, null=True, verbose_name="Date de clôture réelle")
    
    notes = models.TextField(blank=True, null=True, verbose_name="Instructions de production")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Créé le")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Mis à jour le")

    class Meta:
        verbose_name = "Ordre de Fabrication"
        verbose_name_plural = "Ordres de Fabrication"
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        # 1. Héritage automatique de l'unité depuis catalog.Product
        if self.produit_id and not self.unite_id:
            try:
                from catalog.models import Product
                prod = Product.objects.select_related('unit').get(pk=self.produit_id)
                self.unite = prod.unit
            except Exception:
                pass

        # 2. Génération robuste du numéro d'ordre (ex: OP260929001)
        if not self.numero_of:
            now = timezone.now()
            base_prefix = f"OP{now.strftime('%y%m%d')}"
            
            existing_ofs = OrdreFabrication.objects.filter(
                numero_of__startswith=base_prefix
            ).values_list('numero_of', flat=True)

            max_seq = 0
            for no in existing_ofs:
                clean_seq = no.replace(base_prefix, '').replace('-', '').strip()
                if clean_seq.isdigit():
                    val = int(clean_seq)
                    if val > max_seq:
                        max_seq = val

            self.numero_of = f"{base_prefix}{max_seq + 1:03d}"

        super().save(*args, **kwargs)

    def __str__(self):
        unit_str = self.unite.abbreviation if self.unite else ""
        return f"{self.numero_of} - {self.produit.name} ({self.quantite_cible} {unit_str})"