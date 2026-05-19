import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [filteredProducts, setFilteredProducts] = useState([])
  
  // États pour les filtres
  const [searchTerm, setSearchTerm] = useState('')
  const [activeCategory, setActiveCategory] = useState('Tous')
  const [loading, setLoading] = useState(true)

  // États pour la saisie de production
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [weight, setWeight] = useState('15.50')
  const [packCount, setPackCount] = useState('500')
  
  // --- NOS DEUX NOUVEAUX COMPTEURS INDUSTRIELS ---
  const [colisCount, setColisCount] = useState(1)       // Nombre de lots uniques
  const [labelsPerColis, setLabelsPerColis] = useState(1) // Nombre de faces (doublons)

 // Chargement des données Django
  useEffect(() => {
    // On détecte dynamiquement l'IP (que ce soit localhost ou l'IP Tailscale 100.x.x.x)
    const API_BASE = `http://${window.location.hostname}:8000`;

    Promise.all([
      fetch(`${API_BASE}/api/products/`).then(res => res.json()),
      fetch(`${API_BASE}/api/categories/`).then(res => res.json())
    ])
    .then(([productsData, categoriesData]) => {
      setProducts(productsData)
      setCategories(categoriesData)
      setFilteredProducts(productsData)
      setLoading(false)
    })
    .catch(error => console.error("Erreur API :", error))
  }, [])

  // Filtrage
  useEffect(() => {
    const results = products.filter(product => {
      const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            product.sku.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesCategory = activeCategory === 'Tous' || product.category_name === activeCategory
      return matchesSearch && matchesCategory
    })
    setFilteredProducts(results)
  }, [searchTerm, activeCategory, products])

  // Générateur de code ZPL injecté
  const getZPLTemplate = () => {
    if (!selectedProduct || !selectedProduct.zpl_template) return '';
    
    let zpl = selectedProduct.zpl_template;
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const lotSimule = `MP-${today}-REEL`;
    
    let currentInputValue = '';
    if (selectedProduct.input_mode === 'WEIGHT') currentInputValue = weight;
    if (selectedProduct.input_mode === 'PACK_COUNT') currentInputValue = packCount;

    // Remplacement des variables
    zpl = zpl.replace(/{NAME}/g, selectedProduct.name);
    zpl = zpl.replace(/{SKU}/g, selectedProduct.sku);
    zpl = zpl.replace(/{LOT}/g, lotSimule);
    zpl = zpl.replace(/{VALUE}/g, currentInputValue);
    zpl = zpl.replace(/{UNIT}/g, selectedProduct.unit_symbol);
    
    // CHAÎNE MAGIQUE : On injecte la commande ^PQ (Print Quantity) juste avant la fin (^XZ)
    // Cela dit à la Zebra : "Imprime ce lot X fois avant de passer à autre chose"
    if (labelsPerColis > 1) {
      zpl = zpl.replace('^XZ', `^PQ${labelsPerColis}^XZ`);
    }
    
    return encodeURIComponent(zpl);
  }

  const previewImageUrl = selectedProduct ? `http://api.labelary.com/v1/printers/8dpmm/labels/3.94x3.15/0/${getZPLTemplate()}` : ''

  // Simulation du clic de validation
 const handlePrintTest = (e) => {
    e.preventDefault()
    
    let currentInputValue = '';
    if (selectedProduct.input_mode === 'WEIGHT') currentInputValue = weight;
    if (selectedProduct.input_mode === 'PACK_COUNT') currentInputValue = packCount;

    const API_BASE = `http://${window.location.hostname}:8000`;

    // Appel dynamique
    fetch(`${API_BASE}/api/print/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        product_id: selectedProduct.id,
        value: currentInputValue,
        colis_count: colisCount,
        labels_per_colis: labelsPerColis
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data.status === 'success') {
        alert(`✅ Succès : ${data.message}`);
        setSelectedProduct(null);
        setSearchTerm('');
        setColisCount(1);
        setLabelsPerColis(1);
      } else {
        alert(`❌ Erreur : ${data.error || data.message}`);
      }
    })
    .catch(err => {
      console.error(err);
      alert("❌ Impossible de communiquer avec le serveur d'impression.");
    });
  }

  if (loading) {
    return <h2 style={{ textAlign: 'center', marginTop: '50px' }}>Chargement du studio d'impression...</h2>
  }

  return (
    <div className="kiosk-container">
      <header className="kiosk-header">
        <h1>MAR PLASTIC</h1>
        <p>Studio d'Impression & Labo Configuration</p>
      </header>

      {/* ÉCRAN 1 : CATALOGUE */}
      {!selectedProduct ? (
        <>
          <div className="category-tabs">
            <button className={`tab-btn ${activeCategory === 'Tous' ? 'active' : ''}`} onClick={() => setActiveCategory('Tous')}>
              Tous ({products.length})
            </button>
            {categories.map(cat => (
              <button key={cat.id} className={`tab-btn ${activeCategory === cat.name ? 'active' : ''}`} onClick={() => setActiveCategory(cat.name)}>
                {cat.name}
              </button>
            ))}
          </div>

          <h2>Recherche rapide :</h2>
          <div className="search-container">
            <input 
              type="text" 
              placeholder={`🔍 Rechercher dans ${activeCategory}...`} 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
              autoFocus
            />
          </div>
          
          <div className="product-grid">
            {filteredProducts.map(product => (
              <button key={product.id} className="product-btn" onClick={() => setSelectedProduct(product)}>
                <span className="sku">{product.sku}</span>
                <span className="name">{product.name}</span>
                <span className="category">{product.category_name}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        /* ÉCRAN 2 : STUDIO CÔTE À CÔTE */
        <div className="studio-layout">
          
          {/* Formulaire à gauche */}
          <div className="print-card-studio">
            <button className="back-btn" onClick={() => setSelectedProduct(null)}>⬅ Changer de produit</button>
            
            <div className="product-summary">
              <span className="print-badge">{selectedProduct.category_name}</span>
              <h3>{selectedProduct.name}</h3>
              <p><strong>Réf :</strong> {selectedProduct.sku}</p>
            </div>

            <form onSubmit={handlePrintTest} className="print-form">
              {selectedProduct.input_mode === 'WEIGHT' && (
                <div className="form-group">
                  <label>Poids du produit :</label>
                  <div className="input-with-addon">
                    <input type="number" step="0.01" value={weight} onChange={(e) => setWeight(e.target.value)} className="form-input" required />
                    <span className="input-addon">{selectedProduct.unit_symbol}</span>
                  </div>
                </div>
              )}

              {selectedProduct.input_mode === 'PACK_COUNT' && (
                <div className="form-group">
                  <label>Unités par carton :</label>
                  <div className="input-with-addon">
                    <input type="number" value={packCount} onChange={(e) => setPackCount(e.target.value)} className="form-input" required />
                    <span className="input-addon">U</span>
                  </div>
                </div>
              )}

              {/* COMPTEUR 1 : LES COLIS DISTINCTS */}
              <div className="form-group">
                <label>Nombre de colis à étiqueter (Lots uniques) :</label>
                <div className="quantity-selector">
                  <button type="button" onClick={() => setColisCount(Math.max(1, colisCount - 1))} className="qty-btn">-</button>
                  <input type="number" value={colisCount} className="qty-input" readOnly />
                  <button type="button" onClick={() => setColisCount(colisCount + 1)} className="qty-btn">+</button>
                </div>
              </div>

              {/* COMPTEUR 2 : LES FACES PAR COLIS */}
              <div className="form-group">
                <label>Étiquettes par colis (Faces / Doublons identiques) :</label>
                <div className="quantity-selector">
                  <button type="button" onClick={() => setLabelsPerColis(Math.max(1, labelsPerColis - 1))} className="qty-btn">-</button>
                  <input type="number" value={labelsPerColis} className="qty-input" readOnly />
                  <button type="button" onClick={() => setLabelsPerColis(labelsPerColis + 1)} className="qty-btn">+</button>
                </div>
              </div>

              <button type="submit" className="submit-print-btn">
                🖨️ SIMULER L'IMPRESSION ZEBRA
              </button>
            </form>
          </div>

          {/* Aperçu à droite */}
          <div className="preview-card-studio">
            <h4>👁 Rendu de l'étiquette (Format réel 100x80 mm) :</h4>
            <div className="zebra-label-container">
              <img src={previewImageUrl} alt="Rendu Zebra" className="zebra-label-img" />
            </div>
            <p className="preview-footnote">Le visuel s'ajuste dynamiquement à vos données de gauche.</p>
          </div>

        </div>
      )}
    </div>
  )
}

export default App