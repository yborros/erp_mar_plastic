from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.decorators import action
from django.shortcuts import render, get_object_or_404

from .models import OrdreFabrication
from .serializers import OrdreFabricationSerializer


class OrdreFabricationViewSet(viewsets.ModelViewSet):
    """
    API pour lister, créer et mettre à jour les ordres de fabrication.
    """
    queryset = OrdreFabrication.objects.all().select_related('produit', 'client', 'unite')
    serializer_class = OrdreFabricationSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        produit = serializer.validated_data.get('produit')
        unite = getattr(produit, 'unit', None)

        instance = serializer.save(unite=unite)

        # Rechargement de l'instance avec ses jointures
        instance_complete = OrdreFabrication.objects.select_related(
            'produit', 'client', 'unite'
        ).get(pk=instance.pk)

        out_serializer = self.get_serializer(instance_complete)
        headers = self.get_success_headers(out_serializer.data)
        return Response(out_serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def get_queryset(self):
        qs = super().get_queryset()
        show_all = self.request.query_params.get('all', 'false').lower() == 'true'
        if not show_all:
            qs = qs.filter(statut__in=['PLANIFIE', 'EN_COURS'])
        return qs.order_by('-date_debut_prevue', '-created_at')

    @action(detail=True, methods=['get'], url_path='print')
    def imprimer_fiche(self, request, pk=None):
        return fiche_fabrication_print_view(request, of_id=pk)


def fiche_fabrication_print_view(request, of_id):
    of = get_object_or_404(
        OrdreFabrication.objects.select_related('produit', 'client', 'unite'),
        id=of_id
    )
    attributs = of.produit.attribute_values.select_related('attribute').order_by('attribute__name')
    plans = of.produit.drawings.select_related('drawing_type').all()

    context = {
        'of': of,
        'produit': of.produit,
        'attributs': attributs,
        'plans': plans,
    }
    return render(request, 'production/fiche_of_print.html', context)