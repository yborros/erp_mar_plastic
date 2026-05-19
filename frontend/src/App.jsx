import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [clients, setClients] = useState([]) 
  const [filteredProducts, setFilteredProducts] = useState([])
  
  // --- SYSTÈME DE FAVORIS ---
  const [favorites, setFavorites] = useState(() => {
    const saved = localStorage.getItem('mar_plastic_favs');
    return saved ? JSON.parse(saved) : [];
  });

  // États pour les filtres (Écran Catalogue)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeCategory, setActiveCategory] = useState('Tous')
  const [loading, setLoading] = useState(true)

  // États pour la saisie de production (Écran Studio)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [selectedClient, setSelectedClient] = useState(null) 
  const [clientSearchTerm, setClientSearchTerm] = useState('') 
  const [weight, setWeight] = useState('15.50')
  const [packCount, setPackCount] = useState('500')
  
  // Compteurs industriels
  const [colisCount, setColisCount] = useState(1)       
  const [labelsPerColis, setLabelsPerColis] = useState(1) 

  // Chargement des données Django
  useEffect(() => {
    const API_BASE = `http://${window.location.hostname}:8000`;

    Promise.all([
      fetch(`${API_BASE}/api/products/`).then(res => res.json()),
      fetch(`${API_BASE}/api/categories/`).then(res => res.json()),
      fetch(`${API_BASE}/api/clients/`).then(res => res.json()) 
    ])
    .then(([productsData, categoriesData, clientsData]) => {
      setProducts(productsData)
      setCategories(categoriesData)
      setClients(clientsData) 
      setFilteredProducts(productsData)
      setLoading(false)
    })
    .catch(error => console.error("Erreur API :", error))
  }, [])

  // Sauvegarder les favoris dans le navigateur dès qu'ils changent
  useEffect(() => {
    localStorage.setItem('mar_plastic_favs', JSON.stringify(favorites));
  }, [favorites]);

  // Filtrage et Tri des produits (Favoris d'abord, puis Recherche)
  useEffect(() => {
    const results = products.filter(product => {
      const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            product.sku.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesCategory = activeCategory === 'Tous' || product.category_name === activeCategory
      return matchesSearch && matchesCategory
    });

    const sortedResults = [...results].sort((a, b) => {
      const aIsFav = favorites.includes(a.id);
      const bIsFav = favorites.includes(b.id);
      if (aIsFav && !bIsFav) return -1;
      if (!aIsFav && bIsFav) return 1;
      return 0;
    });

    setFilteredProducts(sortedResults)
  }, [searchTerm, activeCategory, products, favorites])

  // Gestion du clic sur l'étoile
  const toggleFavorite = (e, productId) => {
    e.stopPropagation();
    if (favorites.includes(productId)) {
      setFavorites(favorites.filter(id => id !== productId));
    } else {
      setFavorites([...favorites, productId]);
    }
  };

  // Filtrage et Tri Alphabétique des clients
  const getFilteredAndSortedClients = () => {
    if (!clientSearchTerm) return []; // N'affiche rien si l'opérateur n'a rien tapé
    return clients
      .filter(client => 
        client.nom.toLowerCase().includes(clientSearchTerm.toLowerCase())
      )
      .sort((a, b) => a.nom.localeCompare(b.nom));
  }

  // Générateur de code ZPL injecté
  const getZPLTemplate = () => {
    if (!selectedProduct || !selectedProduct.zpl_template) return '';
    
    let zpl = selectedProduct.zpl_template;
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const lotSimule = `MP-${today}-REEL`;
    
    let currentInputValue = '';
    if (selectedProduct.input_mode === 'WEIGHT') currentInputValue = weight;
    if (selectedProduct.input_mode === 'PACK_COUNT') currentInputValue = packCount;

    zpl = zpl.replace(/{NAME}/g, selectedProduct.name);
    zpl = zpl.replace(/{SKU}/g, selectedProduct.sku);
    zpl = zpl.replace(/{LOT}/g, lotSimule);
    zpl = zpl.replace(/{VALUE}/g, currentInputValue);
    zpl = zpl.replace(/{UNIT}/g, selectedProduct.unit_symbol || '');
    
    zpl = zpl.replace(/{CLIENT_NAME}/g, selectedClient ? selectedClient.nom : '');
    zpl = zpl.replace(/{CLIENT_NUM}/g, selectedClient ? selectedClient.numero_client : '');
    
    if (labelsPerColis > 1) {
      zpl = zpl.replace('^XZ', `^PQ${labelsPerColis}^XZ`);
    }
    
    return encodeURIComponent(zpl);
  }

  const previewImageUrl = selectedProduct ? `http://api.labelary.com/v1/printers/8dpmm/labels/3.94x3.15/0/${getZPLTemplate()}` : ''

  // Envoi de la demande d'impression
  const handlePrintTest = (e) => {
    e.preventDefault()
    
    let currentInputValue = '';
    if (selectedProduct.input_mode === 'WEIGHT') currentInputValue = weight;
    if (selectedProduct.input_mode === 'PACK_COUNT') currentInputValue = packCount;

    const API_BASE = `http://${window.location.hostname}:8000`;

    fetch(`${API_BASE}/api/print/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        product_id: selectedProduct.id,
        value: currentInputValue,
        colis_count: colisCount,
        labels_per_colis: labelsPerColis,
        client_name: selectedClient ? selectedClient.nom : '',          
        client_num: selectedClient ? selectedClient.numero_client : ''   
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data.status === 'success') {
        alert(`✅ Succès : ${data.message}`);
        setSelectedProduct(null);
        setSelectedClient(null); 
        setClientSearchTerm('');
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

  const sortedAndFilteredClients = getFilteredAndSortedClients();

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
            {filteredProducts.map(product => {
              const isFav = favorites.includes(product.id);
              return (
                <button key={product.id} className={`product-btn ${isFav ? 'has-fav' : ''}`} onClick={() => setSelectedProduct(product)}>
                  <span 
                    className={`fav-star ${isFav ? 'is-active' : ''}`} 
                    onClick={(e) => toggleFavorite(e, product.id)}
                    title={isFav ? "Retirer des favoris" : "Ajouter aux favoris"}
                  >
                    {isFav ? '★' : '☆'}
                  </span>
                  
                  <span className="sku">{product.sku}</span>
                  <span className="name">{product.name}</span>
                  <span className="category">{product.category_name}</span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        /* ÉCRAN 2 : STUDIO CÔTE À CÔTE */
        <div className="studio-layout">
          
          {/* Formulaire à gauche */}
          <div className="print-card-studio">
            <button className="back-btn" onClick={() => { setSelectedProduct(null); setSelectedClient(null); setClientSearchTerm(''); }}>⬅ Changer de produit</button>
            
            <div className="product-summary">
              <span className="print-badge">{selectedProduct.category_name}</span>
              <h3>{selectedProduct.name}</h3>
              <p><strong>Réf :</strong> {selectedProduct.sku}</p>
            </div>

            <form onSubmit={handlePrintTest} className="print-form">
              
              {/* ZONE CLIENT TOTALEMENT CORRIGÉE ET FLUIDE */}
              <div className="form-group" style={{ background: '#fcfcfc', padding: '15px', borderRadius: '8px', border: '1px solid #eaeaea' }}>
                <label style={{ fontWeight: 'bold', color: '#2c3e50', display: 'block', marginBottom: '8px' }}>Destinataire / Client :</label>
                
                {!selectedClient ? (
                  <>
                    <input 
                      type="text"
                      placeholder="🔍 Rechercher un client (ex: BUROPA)..."
                      value={clientSearchTerm}
                      onChange={(e) => setClientSearchTerm(e.target.value)}
                      className="form-input"
                      style={{ borderRadius: '6px', fontSize: '15px', height: '42px', width: '100%' }}
                    />
                    
                    {/* Liste de suggestions sous forme de boutons rapides de A à Z */}
                    {clientSearchTerm && (
                      <div style={{ maxHeight: '160px', overflowY: 'auto', marginTop: '8px', border: '1px solid #ddd', borderRadius: '6px', background: '#fff' }}>
                        {sortedAndFilteredClients.length > 0 ? (
                          sortedAndFilteredClients.map(client => (
                            <button
                              key={client.id}
                              type="button"
                              onClick={() => { setSelectedClient(client); setClientSearchTerm(''); }}
                              style={{ width: '100%', padding: '10px 15px', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid #f5f5f5', cursor: 'pointer', color: '#333', fontSize: '14px' }}
                              onMouseEnter={(e) => e.target.style.background = '#f5f6fa'}
                              onMouseLeave={(e) => e.target.style.background = 'none'}
                            >
                              {client.nom}
                            </button>
                          ))
                        ) : (
                          <div style={{ padding: '10px', color: '#7f8c8d', fontSize: '13px', fontStyle: 'italic' }}>Aucun client trouvé</div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  /* Affichage propre une fois le client choisi */
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#e1f5fe', padding: '10px 15px', borderRadius: '6px', border: '1px solid #b3e5fc' }}>
                    <span style={{ fontWeight: 'bold', color: '#0288d1', fontSize: '15px' }}>{selectedClient.nom}</span>
                    <button 
                      type="button" 
                      onClick={() => setSelectedClient(null)} 
                      style={{ background: '#e53935', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                    >
                      Changer
                    </button>
                  </div>
                )}
              </div>

              {/* CORRECTION DES BLOCS DE QUANTITÉ COMPATIBLES AVEC L'IMPORT DE L'ADMIN */}
              {selectedProduct.input_mode === 'WEIGHT' && (
                <div className="form-group">
                  <label>Poids du produit :</label>
                  <div className="input-with-addon">
                    <input type="number" step="0.01" value={weight} onChange={(e) => setWeight(e.target.value)} className="form-input" required />
                    <span className="input-addon">{selectedProduct.unit_symbol || 'Kg'}</span>
                  </div>
                </div>
              )}

              {selectedProduct.input_mode === 'PACK_COUNT' && (
                <div className="form-group">
                  <label>Unités par carton :</label>
                  <div className="input-with-addon">
                    <input type="number" value={packCount} onChange={(e) => setPackCount(e.target.value)} className="form-input" required />
                    <span className="input-addon">{selectedProduct.unit_symbol || 'U'}</span>
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
                🖨️ IMPRIMER L'ÉTIQUETTE
              </button>
            </form>
          </div>

          {/* Aperçu à droite */}
          <div className="preview-card-studio">
            <h4>👁 Rendu de l'étiquette (Format réel 100x80 mm) :</h4>
            <div className="zebra-label-container">
              {previewImageUrl ? (
                <img src={previewImageUrl} alt="Rendu Zebra" className="zebra-label-img" />
              ) : (
                <div style={{ padding: '20px', color: '#95a5a6' }}>Génération de l'aperçu...</div>
              )}
            </div>
            <p className="preview-footnote">Le visuel s'ajuste dynamiquement à vos données de gauche (y compris le client).</p>
          </div>

        </div>
      )}
    </div>
  )
}

export default App