import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [clients, setClients] = useState([]) 
  const [templates, setTemplates] = useState([])
  const [printers, setPrinters] = useState([])
  const [filteredProducts, setFilteredProducts] = useState([])
  
  // --- DÉTECTION DU MODE : ATELIER OU POWER USER (LAPTOP) ---
  const urlParams = new URLSearchParams(window.location.search);
  const stationParam = urlParams.get('station'); // Ex: "PC_EXTRUSION_01" ou null
  
  const isPowerUser = !stationParam;
  const [selectedPrinterId, setSelectedPrinterId] = useState('');

  // --- GESTION DU POSTE ATELIER ---
  const [activePoste, setActivePoste] = useState(null)

  // --- SYSTÈME DE FAVORIS ---
  const [favorites, setFavorites] = useState(() => {
    const saved = localStorage.getItem('mar_plastic_favs');
    return saved ? JSON.parse(saved) : [];
  });

  const [searchTerm, setSearchTerm] = useState('')
  const [activeCategory, setActiveCategory] = useState('Tous')
  const [loading, setLoading] = useState(true)

  // --- ÉTATS D'IMPRESSION & NOTIFICATIONS ERGONOMIQUES ---
  const [isPrinting, setIsPrinting] = useState(false)
  const [notification, setNotification] = useState(null) // { type: 'success' | 'error', message: '' }

  const [isFreeInputMode, setIsFreeInputMode] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [selectedClient, setSelectedClient] = useState(null) 
  const [clientSearchTerm, setClientSearchTerm] = useState('') 
  const [selectedTemplateId, setSelectedTemplateId] = useState('')

  // Champs Carton Expédition
  const [cartonTitre, setCartonTitre] = useState('')
  const [cartonType, setCartonType] = useState('')
  const [cartonQty, setCartonQty] = useState('')
  const [cartonDest, setCartonDest] = useState('')
  const [cartonPoidsNet, setCartonPoidsNet] = useState('')
  const [cartonPoidsBrut, setCartonPoidsBrut] = useState('')
  
  // Champs Bobine
  const [selectedMatiere, setSelectedMatiere] = useState('PE')
  const [laize, setLaize] = useState('50')
  const [micron, setMicron] = useState('50')
  const [weight, setWeight] = useState('180')
  const [packCount, setPackCount] = useState('500')
  const [uniteVolante, setUniteVolante] = useState('Kg')

  const [colisCount, setColisCount] = useState(1)       
  const [labelsPerColis, setLabelsPerColis] = useState(1) 

  // État temporisé pour Labelary (anti-clignotement)
  const [debouncedZplCode, setDebouncedZplCode] = useState('')

  const designationVolante = `GAINE ${selectedMatiere}`;

  // Gestion de la disparition automatique du toast de notification
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    const API_BASE = `http://${window.location.hostname}:8000`;

    const fetchJson = (url) => 
      fetch(url)
        .then(res => res.ok ? res.json() : [])
        .catch(err => {
          console.warn(`Erreur lors du chargement de ${url}`, err);
          return [];
        });

    Promise.all([
      fetchJson(`${API_BASE}/api/products/`),
      fetchJson(`${API_BASE}/api/categories/`),
      fetchJson(`${API_BASE}/api/clients/`),
      fetchJson(`${API_BASE}/api/templates/`),
      fetchJson(`${API_BASE}/api/printers/`)
    ])
    .then(([productsData, categoriesData, clientsData, templatesData, printersData]) => {
      setProducts(productsData || []);
      setCategories(categoriesData || []);
      setClients(clientsData || []);
      setTemplates(templatesData || []);
      setPrinters(printersData || []);
      setFilteredProducts(productsData || []);

      if (printersData && printersData.length > 0) {
        setSelectedPrinterId(printersData[0].id);
      }
    })
    .catch(error => {
      console.error("Erreur API :", error);
      setNotification({ type: 'error', message: "Impossible de joindre le serveur Django central." });
    })
    .finally(() => {
      setLoading(false);
    });
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

  const handleSelectPosteTile = (posteKey) => {
    setActivePoste(posteKey);
    setSelectedProduct(null);
    setSelectedClient(null);
    setClientSearchTerm('');

    if (posteKey === 'bobine') {
      setIsFreeInputMode(true);
      const tplBobine = templates.find(t => t.name.toLowerCase().includes('bobine'));
      if (tplBobine) setSelectedTemplateId(tplBobine.id);
    } else if (posteKey === 'carton') {
      setIsFreeInputMode(true);
      // Pré-remplissage type pour accélérer la saisie atelier
      if (!cartonTitre) setCartonTitre('MOUCHOIRS - Collection Standard');
      if (!cartonType) setCartonType('2 Plis 70 mouchoirs Ultra Doux');
      if (!cartonQty) setCartonQty('6 Packs x 4 units');
      if (!cartonDest) setCartonDest('SUISSE');

      const tplCarton = templates.find(t => 
        t.name.toLowerCase().includes('carton') || 
        t.name.toLowerCase().includes('expedition') ||
        t.name.toLowerCase().includes('mouchoir')
      );
      if (tplCarton) setSelectedTemplateId(tplCarton.id);
    } else if (posteKey === 'sachet') {
      setIsFreeInputMode(false);
      const sachetCat = categories.find(c => c.name.toLowerCase().includes('sachet') || c.name.toLowerCase().includes('sac'));
      if (sachetCat) setActiveCategory(sachetCat.name);
      else setActiveCategory('Tous');
    } else {
      setIsFreeInputMode(false);
      setActiveCategory('Tous');
    }
  };

  const handleResetToMenu = () => {
    setActivePoste(null);
    setSelectedProduct(null);
    setIsFreeInputMode(false);
    setSelectedClient(null);
    setClientSearchTerm('');
    setSelectedTemplateId('');
  };

  const chosenTemplateObj = templates.find(t => String(t.id) === String(selectedTemplateId));
  const isCartonTemplate = activePoste === 'carton' || (chosenTemplateObj && (
    chosenTemplateObj.name.toLowerCase().includes('carton') || 
    chosenTemplateObj.name.toLowerCase().includes('expedition') ||
    chosenTemplateObj.name.toLowerCase().includes('mouchoir')
  ));

  // --- GÉNÉRATION DYNAMIQUE DU CODE ZPL ---
  const calculateRawZpl = () => {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const todayStr = `${yy}${mm}${dd}`;

    let rawCodePoste = 'PC_EXTRUSION_01';
    if (!isPowerUser && stationParam) {
      rawCodePoste = stationParam;
    } else if (isPowerUser && selectedPrinterId) {
      const pObj = printers.find(p => String(p.id) === String(selectedPrinterId));
      if (pObj && pObj.code_poste) rawCodePoste = pObj.code_poste;
    }

    const cleaned = rawCodePoste.toUpperCase().replace('PC_', '');
    const match = cleaned.match(/([A-Z]{3,4}).*?(\d+)/);
    const prefixePoste = match ? `${match[1].slice(0, 3)}${match[2]}` : cleaned.slice(0, 4);

    const lotBatch = `${prefixePoste}-${todayStr}`;
    const codeColisUnique = `${lotBatch}-0001`;
    const totalColis = Number(colisCount) || 1;
    const colisDisplay = totalColis > 1 ? `1/${totalColis}` : '1';

    let zpl = null;
    if (selectedTemplateId && chosenTemplateObj) {
      zpl = chosenTemplateObj.zpl_code;
    }
    if (!zpl && selectedProduct?.zpl_template) {
      zpl = selectedProduct.zpl_template;
    }
    if (!zpl) {
      const templateBobine = categories.flatMap(c => c.default_template).find(t => t?.name?.toLowerCase().includes('bobine'));
      zpl = templateBobine ? templateBobine.zpl_code : null;
    }
    if (!zpl) {
      if (isCartonTemplate) {
        zpl = `^XA^CI28^PW800^LL600^FO30,30^GB740,65,2^FS^FO50,48^A0N,30,30^FD{NAME}^FS^FO50,110^A0N,22,22^FDType: {TYPE_DETAILS}^FS^FO50,140^A0N,22,22^FDQty: {QTY_DETAILS}^FS^FO30,175^GB740,75,2^FS^FO50,188^A0N,24,24^FDMADE IN MOROCCO^FS^FO50,218^A0N,20,20^FDLot: {LOT}^FS^FO450,218^A0N,20,20^FDDEST: {DESTINATION}^FS^FO40,268^A0N,20,20^FDPoids Net: {POIDS_NET}^FS^FO450,268^A0N,20,20^FDPoids Brut: {POIDS_BRUT}^FS^FO30,305^GB230,45,2^FS^FO30,305^GB480,45,2^FS^FO30,305^GB740,45,2^FS^FO80,318^A0N,18,18^FDFRAGILE^FS^FO300,318^A0N,18,18^FDKEEP DRY^FS^FO600,318^A0N,18,18^FDUP^FS^FO150,380^BY2,3,100^BCN,100,N,N,N^FD{LOT}^FS^FO310,490^A0N,18,18^FD{LOT}^FS^XZ`;
      } else {
        zpl = `^XA^CI28^PW800^LL600^FO40,30^A0N,28,28^FDMAR PLASTIC - FABRICATION DIRECTE^FS^FO40,65^A0N,20,20^FDICE: 001847540000028  NM: 11.4.050^FS^FO20,95^GB760,3,3^FS^FO40,115^A0N,22,22^FDCLIENT:^FS^FO150,110^A0N,35,35^FD{CLIENT_NAME}^FS^FO40,160^A0N,22,22^FDLAIZE:^FS^FO130,150^A0N,40,40^FD{LAIZE} cm^FS^FO450,160^A0N,22,22^FDEPAISS:^FS^FO550,150^A0N,40,40^FD{MICRON} \\x85m^FS^FO40,215^A0N,22,22^FDARTICLE:^FS^FO150,210^A0N,30,30^FB600,2,,L^FD{NAME}^FS^FO40,270^A0N,25,25^FDQUANTITE:^FS^FO200,255^A0N,75,75^FD{VALUE} {UNIT}^FS^FO120,380^BY3^BCN,120,Y,N,N^FD{LOT}^FS^XZ`;
      }
    }

    const estPoids = selectedProduct ? (selectedProduct.unit_symbol?.toLowerCase() === 'kg') : (uniteVolante.toLowerCase() === 'kg');
    const currentInputValue = estPoids ? weight : packCount;

    zpl = zpl.replace(/{NAME}/g, isCartonTemplate ? (cartonTitre || 'COLIS EXPEDITION') : (selectedProduct ? selectedProduct.name : designationVolante));
    zpl = zpl.replace(/{TYPE_DETAILS}/g, cartonType || '');
    zpl = zpl.replace(/{QTY_DETAILS}/g, cartonQty || '');
    zpl = zpl.replace(/{DESTINATION}/g, (selectedClient ? selectedClient.nom : (cartonDest || 'SUISSE')).toUpperCase());
    
    const cleanPoidsNet = cartonPoidsNet ? (cartonPoidsNet.toLowerCase().includes('kg') ? cartonPoidsNet : `${cartonPoidsNet} kg`) : '';
    const cleanPoidsBrut = cartonPoidsBrut ? (cartonPoidsBrut.toLowerCase().includes('kg') ? cartonPoidsBrut : `${cartonPoidsBrut} kg`) : '';

    zpl = zpl.replace(/{POIDS_NET}/g, cleanPoidsNet);
    zpl = zpl.replace(/{POIDS_BRUT}/g, cleanPoidsBrut);
    zpl = zpl.replace(/{SKU}/g, selectedProduct ? selectedProduct.sku : `BOB-${selectedMatiere}-${laize}CM-${micron}MIC`);
    
    zpl = zpl.replace(/{LOT}/g, codeColisUnique);
    zpl = zpl.replace(/{LOT_BATCH}/g, lotBatch);
    zpl = zpl.replace(/{COLIS}/g, colisDisplay);

    zpl = zpl.replace(/{VALUE}/g, currentInputValue);
    zpl = zpl.replace(/{UNIT}/g, selectedProduct ? selectedProduct.unit_symbol : uniteVolante);
    zpl = zpl.replace(/{LAIZE}/g, laize);
    zpl = zpl.replace(/{MICRON}/g, micron);
    zpl = zpl.replace(/{CLIENT_NAME}/g, selectedClient ? selectedClient.nom : '');
    zpl = zpl.replace(/{CLIENT_NUM}/g, selectedClient ? selectedClient.numero_client : '');

    if (labelsPerColis > 1) {
      zpl = zpl.replace('^XZ', `^PQ${labelsPerColis}^XZ`);
    }

    return zpl;
  };

  // Temporisation (debounce) pour soulager Labelary
  useEffect(() => {
    const raw = calculateRawZpl();
    const handle = setTimeout(() => {
      setDebouncedZplCode(raw);
    }, 250);
    return () => clearTimeout(handle);
  }, [
    selectedProduct, isFreeInputMode, selectedTemplateId, selectedClient,
    cartonTitre, cartonType, cartonQty, cartonDest, cartonPoidsNet, cartonPoidsBrut,
    selectedMatiere, laize, micron, weight, packCount, uniteVolante,
    colisCount, labelsPerColis, isPowerUser, selectedPrinterId, stationParam
  ]);

  const previewImageUrl = (selectedProduct || isFreeInputMode) && debouncedZplCode
    ? `http://api.labelary.com/v1/printers/8dpmm/labels/3.94x3.15/0/${encodeURIComponent(debouncedZplCode)}` 
    : '';

  // --- SOUMISSION DE L'IMPRESSION AVEC PROTECTION ANTI DOUBLE-CLIC ---
  const handlePrintTest = (e) => {
    e.preventDefault();
    if (isPrinting) return;

    setIsPrinting(true);
    setNotification(null);

    const API_BASE = `http://${window.location.hostname}:8000`;
    const estPoids = selectedProduct ? (selectedProduct.unit_symbol?.toLowerCase() === 'kg') : (uniteVolante.toLowerCase() === 'kg');
    const currentInputValue = estPoids ? weight : packCount;

    let codePostePayload = stationParam || 'PC_EXTRUSION_01';
    if (isPowerUser && selectedPrinterId) {
      const chosenP = printers.find(p => String(p.id) === String(selectedPrinterId));
      if (chosenP && chosenP.code_poste) {
        codePostePayload = chosenP.code_poste;
      }
    }

    const payload = {
      code_poste: codePostePayload,
      printer_id: isPowerUser ? selectedPrinterId : null,
      template_id: selectedTemplateId || null,
      is_free_input: !selectedProduct,
      product_id: selectedProduct ? selectedProduct.id : null,
      custom_name: isCartonTemplate ? (cartonTitre || 'COLIS EXPEDITION') : (selectedProduct ? selectedProduct.name : designationVolante),
      type_details: cartonType || null,
      qty_details: cartonQty || null,
      destination: selectedClient ? selectedClient.nom : (cartonDest || null),
      poids_net: cartonPoidsNet ? (cartonPoidsNet.includes('kg') ? cartonPoidsNet : `${cartonPoidsNet} kg`) : null,
      poids_brut: cartonPoidsBrut ? (cartonPoidsBrut.includes('kg') ? cartonPoidsBrut : `${cartonPoidsBrut} kg`) : null,
      matiere: selectedMatiere,
      laize: !selectedProduct ? laize : null,
      micron: !selectedProduct ? micron : null,
      value: currentInputValue,
      unit_str: selectedProduct ? selectedProduct.unit_symbol : uniteVolante,
      colis_count: Number(colisCount) || 1,
      labels_per_colis: Number(labelsPerColis) || 1,
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
        setNotification({ type: 'success', message: `✅ Impression envoyée : ${data.message}` });
        handleResetToMenu();
      } else {
        setNotification({ type: 'error', message: `❌ Erreur : ${data.error || data.message}` });
      }
    })
    .catch(err => {
      console.error(err);
      setNotification({ type: 'error', message: "❌ Impossible d'atteindre le serveur d'impression réseau." });
    })
    .finally(() => {
      setIsPrinting(false);
    });
  }

  if (loading) {
    return <h2 style={{ textAlign: 'center', marginTop: '50px' }}>Chargement du studio d'impression...</h2>
  }

  const sortedAndFilteredClients = getFilteredAndSortedClients();
  const estProduitAuPoids = selectedProduct ? (selectedProduct.unit_symbol?.toLowerCase() === 'kg') : (uniteVolante.toLowerCase() === 'kg');

  return (
    <div className="kiosk-container">
      
      {/* BANDEAU TOAST NOTIFICATION ERGONOMIQUE */}
      {notification && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          background: notification.type === 'success' ? '#27ae60' : '#e74c3c',
          color: '#fff',
          padding: '14px 28px',
          borderRadius: '10px',
          fontWeight: 'bold',
          fontSize: '16px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <span>{notification.message}</span>
          <button 
            onClick={() => setNotification(null)}
            style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer', marginLeft: '10px' }}
          >
            ✕
          </button>
        </div>
      )}

      <header className="kiosk-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 30px' }}>
        <div>
          <h1 style={{ margin: 0 }}>MAR PLASTIC</h1>
          <p style={{ margin: 0, opacity: 0.85 }}>
            {isPowerUser ? "Mode Bureau / Power User" : `Poste Atelier : ${stationParam}`}
          </p>
        </div>
        
        {activePoste && (
          <button 
            onClick={handleResetToMenu}
            style={{
              background: '#2c3e50',
              color: '#fff',
              border: '2px solid rgba(255,255,255,0.4)',
              padding: '10px 18px',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '14px',
              boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
            }}
          >
            🏠 Menu Principal Atelier
          </button>
        )}
      </header>

      {/* ============================================================ */}
      {/* ÉCRAN 0 : ACCUEIL DES POSTES ATELIER                         */}
      {/* ============================================================ */}
      {!activePoste ? (
        <div style={{ maxWidth: '1100px', margin: '30px auto', padding: '0 20px' }}>
          <h2 style={{ textAlign: 'center', color: '#2c3e50', fontSize: '26px', marginBottom: '8px' }}>
            POSTE D'IMPRESSION ATELIER
          </h2>
          <p style={{ textAlign: 'center', color: '#7f8c8d', fontSize: '16px', marginBottom: '35px' }}>
            Sélectionnez la famille de produit à fabriquer et étiqueter
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '25px' }}>
            
            {/* TUILE 1 : BOBINES & GAINES */}
            <div 
              onClick={() => handleSelectPosteTile('bobine')}
              style={{
                background: '#fff',
                borderRadius: '16px',
                border: '3px solid #2980b9',
                padding: '30px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                boxShadow: '0 6px 15px rgba(41, 128, 185, 0.15)'
              }}
            >
              <div style={{ fontSize: '50px', marginBottom: '12px' }}>🌀</div>
              <h3 style={{ margin: '0 0 8px 0', color: '#2980b9', fontSize: '20px' }}>BOBINES & GAINES</h3>
              <p style={{ color: '#666', fontSize: '13px', margin: '0 0 20px 0' }}>Laize, micron, poids bobine (PE / PP)</p>
              <span style={{ display: 'inline-block', background: '#2980b9', color: '#fff', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px' }}>
                Ouvrir Saisie Volante →
              </span>
            </div>

            {/* TUILE 2 : SACHETS & SACS */}
            <div 
              onClick={() => handleSelectPosteTile('sachet')}
              style={{
                background: '#fff',
                borderRadius: '16px',
                border: '3px solid #16a085',
                padding: '30px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                boxShadow: '0 6px 15px rgba(22, 160, 133, 0.15)'
              }}
            >
              <div style={{ fontSize: '50px', marginBottom: '12px' }}>🛍️</div>
              <h3 style={{ margin: '0 0 8px 0', color: '#16a085', fontSize: '20px' }}>SACHETS & SACS</h3>
              <p style={{ color: '#666', fontSize: '13px', margin: '0 0 20px 0' }}>Sachets PE, liasses, dimensions et qté</p>
              <span style={{ display: 'inline-block', background: '#16a085', color: '#fff', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px' }}>
                Choisir Produit →
              </span>
            </div>

            {/* TUILE 3 : CARTON EXPÉDITION */}
            <div 
              onClick={() => handleSelectPosteTile('carton')}
              style={{
                background: '#fff',
                borderRadius: '16px',
                border: '3px solid #27ae60',
                padding: '30px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                boxShadow: '0 6px 15px rgba(39, 174, 96, 0.15)'
              }}
            >
              <div style={{ fontSize: '50px', marginBottom: '12px' }}>📦</div>
              <h3 style={{ margin: '0 0 8px 0', color: '#27ae60', fontSize: '20px' }}>CARTON EXPÉDITION</h3>
              <p style={{ color: '#666', fontSize: '13px', margin: '0 0 20px 0' }}>Mouchoirs, colis export, poids net/brut</p>
              <span style={{ display: 'inline-block', background: '#27ae60', color: '#fff', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px' }}>
                Ouvrir Masque Carton →
              </span>
            </div>

            {/* TUILE 4 : CATALOGUE COMPLET & RECHERCHE */}
            <div 
              onClick={() => handleSelectPosteTile('catalogue')}
              style={{
                background: '#fff',
                borderRadius: '16px',
                border: '3px solid #8e44ad',
                padding: '30px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                boxShadow: '0 6px 15px rgba(142, 68, 173, 0.15)'
              }}
            >
              <div style={{ fontSize: '50px', marginBottom: '12px' }}>🔍</div>
              <h3 style={{ margin: '0 0 8px 0', color: '#8e44ad', fontSize: '20px' }}>CATALOGUE COMPLET</h3>
              <p style={{ color: '#666', fontSize: '13px', margin: '0 0 20px 0' }}>Recherche par référence SKU ou Favoris</p>
              <span style={{ display: 'inline-block', background: '#8e44ad', color: '#fff', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px' }}>
                Parcourir Tous →
              </span>
            </div>

          </div>
        </div>
      ) : (
        /* ============================================================ */
        /* ZONE FONCTIONNELLE : CATALOGUE OU STUDIO DE TIRAGE          */
        /* ============================================================ */
        <>
          {/* ÉCRAN 1 : LISTE DES PRODUITS DU CATALOGUE */}
          {!selectedProduct && !isFreeInputMode ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <div className="category-tabs" style={{ marginBottom: 0 }}>
                  <button className={`tab-btn ${activeCategory === 'Tous' ? 'active' : ''}`} onClick={() => setActiveCategory('Tous')}>
                    Tous ({products.length})
                  </button>
                  {categories.map(cat => (
                    <button key={cat.id} className={`tab-btn ${activeCategory === cat.name ? 'active' : ''}`} onClick={() => setActiveCategory(cat.name)}>
                      {cat.name}
                    </button>
                  ))}
                </div>

                <button 
                  type="button" 
                  onClick={() => setIsFreeInputMode(true)}
                  style={{ background: '#27ae60', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' }}
                >
                  ⚡ Saisie Volante / Format Libre
                </button>
              </div>

              <h2>Recherche rapide :</h2>
              <div className="search-container">
                <input 
                  type="text" 
                  placeholder={`🔍 Rechercher un SKU ou nom dans ${activeCategory}...`} 
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
              
              <div className="print-card-studio">
                <button 
                  className="back-btn" 
                  onClick={() => { setSelectedProduct(null); setIsFreeInputMode(false); setSelectedClient(null); setClientSearchTerm(''); setSelectedTemplateId(''); }}
                >
                  ⬅ Retour au Catalogue
                </button>
                
                <div className="product-summary">
                  <span className="print-badge" style={{ background: selectedProduct ? '#2980b9' : '#27ae60' }}>
                    {selectedProduct ? selectedProduct.category_name : 'SAISIE VOLANTE'}
                  </span>
                  <h3>{isCartonTemplate ? (cartonTitre || 'COLIS EXPÉDITION') : (selectedProduct ? selectedProduct.name : designationVolante)}</h3>
                  {selectedProduct && <p><strong>Réf SKU :</strong> {selectedProduct.sku}</p>}
                </div>

                <form onSubmit={handlePrintTest} className="print-form">

                  {/* SÉLECTION D'IMPRIMANTE : CONDITIONNELLEMENT AFFICHÉ (LAPTOP / POWER USER) */}
                  {isPowerUser ? (
                    <div className="form-group" style={{ background: '#fdf2e9', padding: '12px', borderRadius: '8px', border: '2px solid #e67e22', marginBottom: '15px' }}>
                      <label style={{ fontWeight: 'bold', color: '#d35400', display: 'block', marginBottom: '6px' }}>
                        🖨️ Sélection Imprimante Réseau (Bureau / Laptop) :
                      </label>
                      <select 
                        className="form-input"
                        value={selectedPrinterId} 
                        onChange={(e) => setSelectedPrinterId(e.target.value)}
                        style={{ width: '100%', borderRadius: '6px', fontSize: '15px', height: '40px', background: '#fff', fontWeight: 'bold' }}
                      >
                        {printers.length > 0 ? (
                          printers.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.nom} — {p.ip_address}:{p.port} ({p.code_poste || 'Générale'})
                            </option>
                          ))
                        ) : (
                          <option value="">Aucune imprimante configurée (par défaut)</option>
                        )}
                      </select>
                    </div>
                  ) : null}

                  {/* SÉLECTION DU MODÈLE D'ÉTIQUETTE (TEMPLATE) */}
                  <div className="form-group" style={{ background: '#f0f3f6', padding: '12px', borderRadius: '8px', border: '2px solid #3498db' }}>
                    <label style={{ fontWeight: 'bold', color: '#2c3e50', display: 'block', marginBottom: '6px' }}>📋 Modèle d'étiquette ZPL :</label>
                    <select 
                      className="form-input"
                      value={selectedTemplateId} 
                      onChange={(e) => setSelectedTemplateId(e.target.value)}
                      style={{ width: '100%', borderRadius: '6px', fontSize: '15px', height: '40px', background: '#fff', fontWeight: 'bold' }}
                    >
                      <option value="">-- Automatique (Par défaut produit/catégorie) --</option>
                      {templates.map(tpl => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.name}
                        </option>
                      ))}
                    </select>
                  </div>

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

                  {/* FORMULAIRE CARTON EXPÉDITION */}
                  {isCartonTemplate ? (
                    <div style={{ background: '#eef9f1', padding: '15px', borderRadius: '8px', border: '1px solid #27ae60', marginBottom: '15px' }}>
                      <h4 style={{ margin: '0 0 10px 0', color: '#27ae60' }}>📦 Champs de l'étiquette Carton :</h4>
                      
                      <div className="form-group" style={{ marginBottom: '10px' }}>
                        <label>Titre de l'article :</label>
                        <input 
                          type="text" 
                          value={cartonTitre} 
                          onChange={(e) => setCartonTitre(e.target.value)} 
                          className="form-input" 
                          style={{ width: '100%', borderRadius: '6px' }}
                        />
                      </div>

                      <div className="form-group" style={{ marginBottom: '10px' }}>
                        <label>Description / Type (ex: 2 Plis 70 mouchoirs) :</label>
                        <input 
                          type="text" 
                          value={cartonType} 
                          onChange={(e) => setCartonType(e.target.value)} 
                          className="form-input" 
                          style={{ width: '100%', borderRadius: '6px' }}
                        />
                      </div>

                      <div className="form-group" style={{ marginBottom: '10px' }}>
                        <label>Contenance / Qty (ex: 6 Packs x 4 units) :</label>
                        <input 
                          type="text" 
                          value={cartonQty} 
                          onChange={(e) => setCartonQty(e.target.value)} 
                          className="form-input" 
                          style={{ width: '100%', borderRadius: '6px' }}
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                        <div className="form-group">
                          <label>Destination :</label>
                          <input 
                            type="text" 
                            value={selectedClient ? selectedClient.nom : cartonDest} 
                            onChange={(e) => setCartonDest(e.target.value)} 
                            className="form-input" 
                            style={{ width: '100%', borderRadius: '6px' }}
                            disabled={!!selectedClient}
                          />
                        </div>

                        <div className="form-group">
                          <label>Poids Net :</label>
                          <input 
                            type="text" 
                            value={cartonPoidsNet} 
                            onChange={(e) => setCartonPoidsNet(e.target.value)} 
                            className="form-input" 
                            style={{ width: '100%', borderRadius: '6px' }}
                            placeholder="ex: 3.900"
                          />
                        </div>

                        <div className="form-group">
                          <label>Poids Brut :</label>
                          <input 
                            type="text" 
                            value={cartonPoidsBrut} 
                            onChange={(e) => setCartonPoidsBrut(e.target.value)} 
                            className="form-input" 
                            style={{ width: '100%', borderRadius: '6px' }}
                            placeholder="ex: 3.250"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* FORMULAIRE STANDARD BOBINE / EXTRUSION */
                    <>
                      {!selectedProduct && (
                        <div className="form-group">
                          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>Matière :</label>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <button
                              type="button"
                              onClick={() => setSelectedMatiere('PE')}
                              style={{
                                padding: '12px',
                                borderRadius: '6px',
                                border: selectedMatiere === 'PE' ? '2px solid #27ae60' : '1px solid #ccc',
                                background: selectedMatiere === 'PE' ? '#e8f8f5' : '#f8f9fa',
                                color: selectedMatiere === 'PE' ? '#27ae60' : '#2c3e50',
                                fontWeight: 'bold',
                                fontSize: '16px',
                                cursor: 'pointer'
                              }}
                            >
                              PE (Polyéthylène)
                            </button>

                            <button
                              type="button"
                              onClick={() => setSelectedMatiere('PP')}
                              style={{
                                padding: '12px',
                                borderRadius: '6px',
                                border: selectedMatiere === 'PP' ? '2px solid #2980b9' : '1px solid #ccc',
                                background: selectedMatiere === 'PP' ? '#ebf5fb' : '#f8f9fa',
                                color: selectedMatiere === 'PP' ? '#2980b9' : '#2c3e50',
                                fontWeight: 'bold',
                                fontSize: '16px',
                                cursor: 'pointer'
                              }}
                            >
                              PP (Polypropylène)
                            </button>
                          </div>
                        </div>
                      )}

                      {!selectedProduct && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                          <div className="form-group">
                            <label>Laize (cm) :</label>
                            <input 
                              type="number" 
                              value={laize} 
                              onChange={(e) => setLaize(e.target.value)} 
                              className="form-input" 
                              style={{ width: '100%', borderRadius: '6px' }}
                              placeholder="ex: 50"
                            />
                          </div>

                          <div className="form-group">
                            <label>Épaisseur (µm / µ) :</label>
                            <input 
                              type="number" 
                              value={micron} 
                              onChange={(e) => setMicron(e.target.value)} 
                              className="form-input" 
                              style={{ width: '100%', borderRadius: '6px' }}
                              placeholder="ex: 50"
                            />
                          </div>
                        </div>
                      )}

                      {estProduitAuPoids ? (
                        <div className="form-group">
                          <label>Poids de la bobine :</label>
                          <div className="input-with-addon">
                            <input type="number" step="0.01" value={weight} onChange={(e) => setWeight(e.target.value)} className="form-input" required />
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
                      ) : (
                        <div className="form-group">
                          <label>Unités par carton :</label>
                          <div className="input-with-addon">
                            <input type="number" value={packCount} onChange={(e) => setPackCount(e.target.value)} className="form-input" required />
                            <span className="input-addon">{selectedProduct?.unit_symbol || 'U'}</span>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* NOMBRE DE COLIS (RATIO) - BOUTONS AGRANDIS */}
                  <div className="form-group" style={{ marginTop: '10px' }}>
                    <label>Nombre de Colis / Cartons :</label>
                    <div className="quantity-selector" style={{ maxWidth: '240px', display: 'flex', alignItems: 'center' }}>
                      <button 
                        type="button" 
                        onClick={() => setColisCount(Math.max(1, colisCount - 1))} 
                        className="qty-btn"
                        style={{ minWidth: '48px', minHeight: '44px', fontSize: '20px', fontWeight: 'bold' }}
                      >
                        -
                      </button>
                      <input 
                        type="number" 
                        value={colisCount} 
                        onChange={(e) => setColisCount(Math.max(1, parseInt(e.target.value) || 1))} 
                        className="qty-input" 
                        style={{ height: '44px', fontSize: '18px', fontWeight: 'bold', textAlign: 'center' }}
                      />
                      <button 
                        type="button" 
                        onClick={() => setColisCount(colisCount + 1)} 
                        className="qty-btn"
                        style={{ minWidth: '48px', minHeight: '44px', fontSize: '20px', fontWeight: 'bold' }}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* EXEMPLAIRES PAR COLIS - BOUTONS AGRANDIS */}
                  <div className="form-group">
                    <label>Exemplaires par colis :</label>
                    <div className="quantity-selector" style={{ maxWidth: '240px', display: 'flex', alignItems: 'center' }}>
                      <button 
                        type="button" 
                        onClick={() => setLabelsPerColis(Math.max(1, labelsPerColis - 1))} 
                        className="qty-btn"
                        style={{ minWidth: '48px', minHeight: '44px', fontSize: '20px', fontWeight: 'bold' }}
                      >
                        -
                      </button>
                      <input 
                        type="number" 
                        value={labelsPerColis} 
                        onChange={(e) => setLabelsPerColis(Math.max(1, parseInt(e.target.value) || 1))} 
                        className="qty-input" 
                        style={{ height: '44px', fontSize: '18px', fontWeight: 'bold', textAlign: 'center' }}
                      />
                      <button 
                        type="button" 
                        onClick={() => setLabelsPerColis(labelsPerColis + 1)} 
                        className="qty-btn"
                        style={{ minWidth: '48px', minHeight: '44px', fontSize: '20px', fontWeight: 'bold' }}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* BOUTON D'IMPRESSION SÉCURISÉ CONTRE LE MULTI-CLIC */}
                  <button 
                    type="submit" 
                    disabled={isPrinting}
                    className="submit-print-btn" 
                    style={{ 
                      background: isPrinting ? '#7f8c8d' : (isCartonTemplate ? '#27ae60' : '#2980b9'),
                      cursor: isPrinting ? 'not-allowed' : 'pointer',
                      padding: '16px',
                      fontSize: '17px',
                      fontWeight: 'bold',
                      boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {isPrinting ? (
                      <span>⏳ Transmission directe Ethernet en cours...</span>
                    ) : (
                      <span>🖨️ IMPRIMER L'ÉTIQUETTE ({colisCount * labelsPerColis} ex.)</span>
                    )}
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
                  {isCartonTemplate 
                    ? `Mode Étiquette Carton Expédition : ${cartonTitre || 'Sans titre'}`
                    : (selectedProduct 
                        ? `Produit Catalogue : [${selectedProduct.sku}] ${selectedProduct.name}`
                        : `Mode Saisie Volante : GAINE ${selectedMatiere}`
                      )
                  }
                </p>
              </div>

            </div>
          )}
        </>
      )}
    </div>
  )
}

export default App