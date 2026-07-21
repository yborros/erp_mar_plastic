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

  // États pour le catalogue
  const [searchTerm, setSearchTerm] = useState('')
  const [activeCategory, setActiveCategory] = useState('Tous')
  const [loading, setLoading] = useState(true)

  // Sélection Catalogue & Client
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [selectedClient, setSelectedClient] = useState(null) 
  const [clientSearchTerm, setClientSearchTerm] = useState('') 

  // Champs de saisie flexible (Bobine / Saisie Volante)
  const [designation, setDesignation] = useState('GAINE PEBD NEUTRE')
  const [laize, setLaize] = useState('500')
  const [micron, setMicron] = useState('50')
  const [weight, setWeight] = useState('180')
  const [packCount, setPackCount] = useState('500')
  const [uniteVolante, setUniteVolante] = useState('Kg')

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

  useEffect(() => {
    localStorage.setItem('mar_plastic_favs', JSON.stringify(favorites));
  }, [favorites]);

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

  const toggleFavorite = (e, productId) => {
    e.stopPropagation();
    if (favorites.includes(productId)) {
      setFavorites(favorites.filter(id => id !== productId));
    } else {
      setFavorites([...favorites, productId]);
    }
  };

  const getFilteredAndSortedClients = () => {
    if (!clientSearchTerm) return [];
    return clients
      .filter(client => 
        client.nom.toLowerCase().includes(clientSearchTerm.toLowerCase())
      )
      .sort((a, b) => a.nom.localeCompare(b.nom));
  }

  // Génération du template ZPL dynamique pour l'aperçu
  const getZPLTemplate = () => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const lotSimule = `MP-${today}-REEL`;

    if (selectedProduct && selectedProduct.zpl_template) {
      let zpl = selectedProduct.zpl_template;
      const estPoids = selectedProduct.unit_symbol?.toLowerCase() === 'kg';
      const currentInputValue = estPoids ? weight : packCount;

      zpl = zpl.replace(/{NAME}/g, selectedProduct.name);
      zpl = zpl.replace(/{SKU}/g, selectedProduct.sku);
      zpl = zpl.replace(/{LOT}/g, lotSimule);
      zpl = zpl.replace(/{VALUE}/g, currentInputValue);
      zpl = zpl.replace(/{UNIT}/g, selectedProduct.unit_symbol || '');
      zpl = zpl.replace(/{LAIZE}/g, laize);
      zpl = zpl.replace(/{MICRON}/g, micron);
      zpl = zpl.replace(/{CLIENT_NAME}/g, selectedClient ? selectedClient.nom : '');
      zpl = zpl.replace(/{CLIENT_NUM}/g, selectedClient ? selectedClient.numero_client : '');

      if (labelsPerColis > 1) {
        zpl = zpl.replace('^XZ', `^PQ${labelsPerColis}^XZ`);
      }
      return encodeURIComponent(zpl);
    }

    // Template par défaut pour la Saisie Volante (Sortie de machine)
    let zplVolant = `^XA^CI28^PW800^LL600^FO40,30^A0N,28,28^FDMAR PLASTIC - FABRICATION DIRECTE^FS^FO40,65^A0N,20,20^FDICE: 001847540000028  NM: 11.4.050^FS^FO20,95^GB760,3,3^FS^FO40,115^A0N,22,22^FDCLIENT:^FS^FO150,110^A0N,35,35^FD{CLIENT_NAME}^FS^FO40,160^A0N,22,22^FDLAIZE:^FS^FO130,150^A0N,40,40^FD{LAIZE} mm^FS^FO450,160^A0N,22,22^FDEPAISS:^FS^FO550,150^A0N,40,40^FD{MICRON} um^FS^FO40,215^A0N,22,22^FDARTICLE:^FS^FO150,210^A0N,30,30^FB600,2,,L^FD{NAME}^FS^FO40,270^A0N,25,25^FDQUANTITE:^FS^FO200,255^A0N,75,75^FD{VALUE} {UNIT}^FS^FO120,380^BY3^BCN,120,Y,N,N^FD{LOT}^FS^XZ`;

    zplVolant = zplVolant.replace(/{NAME}/g, designation);
    zplVolant = zplVolant.replace(/{LAIZE}/g, laize);
    zplVolant = zplVolant.replace(/{MICRON}/g, micron);
    zplVolant = zplVolant.replace(/{VALUE}/g, weight);
    zplVolant = zplVolant.replace(/{UNIT}/g, uniteVolante);
    zplVolant = zplVolant.replace(/{LOT}/g, lotSimule);
    zplVolant = zplVolant.replace(/{CLIENT_NAME}/g, selectedClient ? selectedClient.nom : '');

    if (labelsPerColis > 1) {
      zplVolant = zplVolant.replace('^XZ', `^PQ${labelsPerColis}^XZ`);
    }

    return encodeURIComponent(zplVolant);
  }

  const previewImageUrl = `http://api.labelary.com/v1/printers/8dpmm/labels/3.94x3.15/0/${getZPLTemplate()}`;

  const handlePrintTest = (e) => {
    e.preventDefault();
    const API_BASE = `http://${window.location.hostname}:8000`;

    const estPoids = selectedProduct ? (selectedProduct.unit_symbol?.toLowerCase() === 'kg') : (uniteVolante.toLowerCase() === 'kg');
    const currentInputValue = estPoids ? weight : packCount;

    const payload = {
      is_free_input: !selectedProduct,
      product_id: selectedProduct ? selectedProduct.id : null,
      custom_name: designation,
      laize: laize,
      micron: micron,
      value: currentInputValue,
      unit_str: selectedProduct ? selectedProduct.unit_symbol : uniteVolante,
      colis_count: colisCount,
      labels_per_colis: labelsPerColis,
      client_name: selectedClient ? selectedClient.nom : '',          
      client_num: selectedClient ? selectedClient.numero_client : ''   
    };

    fetch(`${API_BASE}/api/print/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
      if (data.status === 'success') {
        alert(`✅ Succès : ${data.message}`);
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
        <p>Studio d'Impression & Traçabilité Usine</p>
      </header>

      <div className="studio-layout">
        
        {/* FORMULAIRE DE SAISIE UNIVERSEL */}
        <div className="print-card-studio">
          
          {/* SECTION D'ASSOCIATION CATALOGUE */}
          <div style={{ background: '#f5f6fa', padding: '15px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #dcdde1' }}>
            <label style={{ fontWeight: 'bold', color: '#2c3e50', display: 'block', marginBottom: '8px' }}>
              📦 Article du Catalogue (Optionnel) :
            </label>

            {!selectedProduct ? (
              <>
                <input 
                  type="text" 
                  placeholder="🔍 Rechercher un SKU ou nom d'article pour lier le tirage..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="form-input"
                  style={{ width: '100%', marginBottom: '8px', borderRadius: '6px', fontSize: '14px', height: '38px' }}
                />
                
                {searchTerm && (
                  <div style={{ maxHeight: '160px', overflowY: 'auto', background: '#fff', border: '1px solid #ccc', borderRadius: '6px' }}>
                    {filteredProducts.map(p => (
                      <div 
                        key={p.id} 
                        onClick={() => { setSelectedProduct(p); setDesignation(p.name); setSearchTerm(''); }}
                        style={{ padding: '8px 12px', borderBottom: '1px solid #eee', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}
                      >
                        <span style={{ fontWeight: 'bold', color: '#2980b9' }}>{p.sku}</span>
                        <span>{p.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#e3f2fd', padding: '10px', borderRadius: '6px', border: '1px solid #90caf9' }}>
                <div>
                  <span style={{ fontWeight: 'bold', color: '#1565c0', marginRight: '8px' }}>[{selectedProduct.sku}]</span>
                  <span style={{ fontSize: '14px' }}>{selectedProduct.name}</span>
                </div>
                <button type="button" onClick={() => setSelectedProduct(null)} style={{ background: '#e53935', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Délier</button>
              </div>
            )}
          </div>

          <form onSubmit={handlePrintTest} className="print-form">
            
            {/* SÉLECTION CLIENT */}
            <div className="form-group" style={{ background: '#fcfcfc', padding: '12px', borderRadius: '8px', border: '1px solid #eaeaea' }}>
              <label style={{ fontWeight: 'bold', color: '#2c3e50', display: 'block', marginBottom: '6px' }}>Destinataire / Client :</label>
              
              {!selectedClient ? (
                <>
                  <input 
                    type="text"
                    placeholder="🔍 Rechercher un client..."
                    value={clientSearchTerm}
                    onChange={(e) => setClientSearchTerm(e.target.value)}
                    className="form-input"
                    style={{ borderRadius: '6px', fontSize: '14px', height: '38px', width: '100%' }}
                  />
                  
                  {clientSearchTerm && (
                    <div style={{ maxHeight: '140px', overflowY: 'auto', marginTop: '6px', border: '1px solid #ddd', borderRadius: '6px', background: '#fff' }}>
                      {sortedAndFilteredClients.length > 0 ? (
                        sortedAndFilteredClients.map(client => (
                          <button
                            key={client.id}
                            type="button"
                            onClick={() => { setSelectedClient(client); setClientSearchTerm(''); }}
                            style={{ width: '100%', padding: '8px 12px', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid #f5f5f5', cursor: 'pointer', fontSize: '13px' }}
                          >
                            {client.nom}
                          </button>
                        ))
                      ) : (
                        <div style={{ padding: '8px', color: '#7f8c8d', fontSize: '12px', fontStyle: 'italic' }}>Aucun client trouvé</div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#e1f5fe', padding: '8px 12px', borderRadius: '6px', border: '1px solid #b3e5fc' }}>
                  <span style={{ fontWeight: 'bold', color: '#0288d1', fontSize: '14px' }}>{selectedClient.nom}</span>
                  <button 
                    type="button" 
                    onClick={() => setSelectedClient(null)} 
                    style={{ background: '#e53935', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                  >
                    Changer
                  </button>
                </div>
              )}
            </div>

            {/* DÉSIGNATION (Editable si pas de produit lié) */}
            {!selectedProduct && (
              <div className="form-group">
                <label>Désignation Article / Matière :</label>
                <input 
                  type="text" 
                  value={designation} 
                  onChange={(e) => setDesignation(e.target.value)} 
                  className="form-input" 
                  style={{ width: '100%', borderRadius: '6px' }}
                  required 
                />
              </div>
            )}

            {/* CHAMPS SPÉCIFIQUES EXTRUSION (LAIZE & MICRON) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div className="form-group">
                <label>Laize (mm) :</label>
                <input 
                  type="number" 
                  value={laize} 
                  onChange={(e) => setLaize(e.target.value)} 
                  className="form-input" 
                  style={{ width: '100%', borderRadius: '6px' }}
                />
              </div>

              <div className="form-group">
                <label>Épaisseur ($\mu$m) :</label>
                <input 
                  type="number" 
                  value={micron} 
                  onChange={(e) => setMicron(e.target.value)} 
                  className="form-input" 
                  style={{ width: '100%', borderRadius: '6px' }}
                />
              </div>
            </div>

            {/* SAISIE QUANTITÉ / POIDS */}
            <div className="form-group">
              <label>Poids / Quantité de la Bobine :</label>
              <div className="input-with-addon">
                <input 
                  type="number" 
                  step="0.01" 
                  value={weight} 
                  onChange={(e) => setWeight(e.target.value)} 
                  className="form-input" 
                  required 
                />
                
                {!selectedProduct ? (
                  <select 
                    value={uniteVolante} 
                    onChange={(e) => setUniteVolante(e.target.value)}
                    style={{ background: '#dcdde1', border: '2px solid #ccc', borderLeft: 'none', padding: '0 10px', fontWeight: 'bold' }}
                  >
                    <option value="Kg">Kg</option>
                    <option value="U">U</option>
                  </select>
                ) : (
                  <span className="input-addon">{selectedProduct.unit_symbol || 'Kg'}</span>
                )}
              </div>
            </div>

            {/* COMPTEURS DE COLIS / ET DOUBLONS */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div className="form-group">
                <label>Nbr de bobines / colis :</label>
                <div className="quantity-selector">
                  <button type="button" onClick={() => setColisCount(Math.max(1, colisCount - 1))} className="qty-btn">-</button>
                  <input type="number" value={colisCount} className="qty-input" readOnly />
                  <button type="button" onClick={() => setColisCount(colisCount + 1)} className="qty-btn">+</button>
                </div>
              </div>

              <div className="form-group">
                <label>Faces / Doublons :</label>
                <div className="quantity-selector">
                  <button type="button" onClick={() => setLabelsPerColis(Math.max(1, labelsPerColis - 1))} className="qty-btn">-</button>
                  <input type="number" value={labelsPerColis} className="qty-input" readOnly />
                  <button type="button" onClick={() => setLabelsPerColis(labelsPerColis + 1)} className="qty-btn">+</button>
                </div>
              </div>
            </div>

            <button type="submit" className="submit-print-btn" style={{ background: selectedProduct ? '#2980b9' : '#27ae60' }}>
              🖨️ IMPRIMER L'ÉTIQUETTE
            </button>
          </form>
        </div>

        {/* APERÇU ÉTIQUETTE EN DIRECT */}
        <div className="preview-card-studio">
          <h4>👁 Rendu de l'étiquette (Format réel 100x80 mm) :</h4>
          <div className="zebra-label-container">
            {previewImageUrl ? (
              <img src={previewImageUrl} alt="Rendu Zebra" className="zebra-label-img" />
            ) : (
              <div style={{ padding: '20px', color: '#95a5a6' }}>Génération de l'aperçu...</div>
            )}
          </div>
          <p className="preview-footnote">
            {selectedProduct 
              ? `Liaison Catalogue active : [${selectedProduct.sku}] ${selectedProduct.name}`
              : "Mode Saisie Volante : Sortie de Machine Directe"
            }
          </p>
        </div>

      </div>
    </div>
  )
}

export default App