from django.http import JsonResponse
from .models import Category, Product

def get_subcategories_api(request):
    """Renvoie les sous-catégories d'une catégorie parente."""
    parent_id = request.GET.get('parent_id')
    if parent_id:
        subs = list(Category.objects.filter(parent_id=parent_id).order_by('name').values('id', 'name'))
    else:
        subs = []
    return JsonResponse(subs, safe=False)

def get_products_by_category_api(request):
    """
    Renvoie les articles appartenant à une catégorie (ou sous-catégorie),
    ou à toute son arborescence descendante si c'est une catégorie parente.
    """
    category_id = request.GET.get('category_id')
    queryset = Product.objects.all()

    if category_id:
        # Récupère la catégorie et ses sous-catégories directes
        cat_ids = [category_id]
        child_ids = list(Category.objects.filter(parent_id=category_id).values_list('id', flat=True))
        cat_ids.extend(child_ids)
        queryset = queryset.filter(category_id__in=cat_ids)

    items = list(queryset.order_by('name').values('id', 'sku', 'name'))
    return JsonResponse(items, safe=False)