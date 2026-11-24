import React, { useState, useEffect, useMemo } from 'react';

// =========================================================================
// 1. COMPOSANT RECHERCHABLE : EMBALLAGE / SUPPORT
// =========================================================================
function SearchablePackagingSelect({ options, selectedId, onSelect, currentPackaging }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (currentPackaging) {
      setQuery(`[${currentPackaging.sku}] ${currentPackaging.name}`);
    } else if (!selectedId) {
      setQuery('');
    }
  }, [selectedId, currentPackaging]);

  const filteredOptions = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter(opt => 
      opt.name.toLowerCase().includes(q) || 
      opt.sku.toLowerCase().includes(q)
    );
  }, [options, query]);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div style={{ display: 'flex', position: 'relative' }}>
        <input
          type="text"
          placeholder="🔍 Taper pour filtrer (ex: 40x30, Palette...)"
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          style={{
            width: '100%',
            height: '40px',
            padding: '8px 36px 8px 12px',
            borderRadius: '6px',
            border: currentPackaging?.is_low_stock ? '2px solid #ef4444' : '1px solid #cbd5e1',
            background: '#ffffff',
            fontSize: '14px',
            fontWeight: '600',
            boxSizing: 'border-box'
          }}
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              onSelect('');
              setIsOpen(true);
            }}
            style={{
              position: 'absolute',
              right: '30px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            ✕
          </button>
        )}
        <span 
          onClick={() => setIsOpen(!isOpen)}
          style={{
            position: 'absolute',
            right: '10px',
            top: '50%',
            transform: 'translateY(-50%)',
            cursor: 'pointer',
            color: '#64748b',
            fontSize: '12px'
          }}
        >
          ▼
        </span>
      </div>

      {isOpen && (
        <>
          <div 
            onClick={() => setIsOpen(false)} 
            style={{ position: 'fixed', inset: 0, zIndex: 100 }} 
          />

          <div style={{
            position: 'absolute',
            top: '44px',
            left: 0,
            right: 0,
            maxHeight: '220px',
            overflowY: 'auto',
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
            zIndex: 101
          }}>
            <div
              onClick={() => {
                onSelect('');
                setQuery('');
                setIsOpen(false);
              }}
              style={{
                padding: '10px 12px',
                borderBottom: '1px solid #f1f5f9',
                cursor: 'pointer',
                fontSize: '13px',
                color: '#64748b',
                background: !selectedId ? '#f8fafc' : '#ffffff'
              }}
            >
              -- Aucun emballage (ou vrac sans décompte) --
            </div>

            {filteredOptions.map(pkg => {
              const isSelected = String(pkg.id) === String(selectedId);
              return (
                <div
                  key={pkg.id}
                  onClick={() => {
                    onSelect(String(pkg.id));
                    setQuery(`[${pkg.sku}] ${pkg.name}`);
                    setIsOpen(false);
                  }}
                  style={{
                    padding: '10px 12px',
                    borderBottom: '1px solid #f1f5f9',
                    cursor: 'pointer',
                    background: isSelected ? '#eff6ff' : '#ffffff',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={(e) => e.currentTarget.style.background = isSelected ? '#eff6ff' : '#ffffff'}
                >
                  <div>
                    <span style={{ fontWeight: '700', color: '#0f172a', fontSize: '13px' }}>
                      [{pkg.sku}] {pkg.name}
                    </span>
                    {pkg.is_default_packaging && (
                      <span style={{ marginLeft: '8px', background: '#dbeafe', color: '#1d4ed8', fontSize: '11px', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                        ★ Par défaut usine
                      </span>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '12px' }}>
                    <span style={{ fontWeight: 'bold', color: pkg.is_low_stock ? '#dc2626' : '#16a34a' }}>
                      {pkg.stock_actuel} {pkg.unit_symbol}
                    </span>
                    {pkg.is_low_stock && (
                      <span style={{ marginLeft: '6px', color: '#dc2626', fontWeight: 'bold' }}>⚠️</span>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredOptions.length === 0 && (
              <div style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                Aucun emballage ne correspond à "{query}".
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// =========================================================================
// 2. COMPOSANT RECHERCHABLE : CLIENT DESTINATAIRE
// =========================================================================
function SearchableClientSelect({ clients, selectedClient, onSelect }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (selectedClient) {
      setQuery(`${selectedClient.nom} ${selectedClient.numero_client ? `(${selectedClient.numero_client})` : ''}`);
    } else {
      setQuery('');
    }
  }, [selectedClient]);

  const filteredClients = useMemo(() => {
    if (!query.trim()) return clients;
    const q = query.toLowerCase();
    return clients.filter(c => 
      c.nom.toLowerCase().includes(q) || 
      (c.numero_client && c.numero_client.toLowerCase().includes(q))
    );
  }, [clients, query]);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div style={{ display: 'flex', position: 'relative' }}>
        <input
          type="text"
          placeholder="🔍 Taper le nom ou code client..."
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          style={{
            width: '100%',
            height: '40px',
            padding: '8px 36px 8px 12px',
            borderRadius: '6px',
            border: '1px solid #cbd5e1',
            background: '#ffffff',
            fontSize: '14px',
            fontWeight: '600',
            boxSizing: 'border-box'
          }}
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              onSelect(null);
              setIsOpen(true);
            }}
            style={{
              position: 'absolute',
              right: '30px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            ✕
          </button>
        )}
        <span 
          onClick={() => setIsOpen(!isOpen)}
          style={{
            position: 'absolute',
            right: '10px',
            top: '50%',
            transform: 'translateY(-50%)',
            cursor: 'pointer',
            color: '#64748b',
            fontSize: '12px'
          }}
        >
          ▼
        </span>
      </div>

      {isOpen && (
        <>
          <div 
            onClick={() => setIsOpen(false)} 
            style={{ position: 'fixed', inset: 0, zIndex: 100 }} 
          />

          <div style={{
            position: 'absolute',
            top: '44px',
            left: 0,
            right: 0,
            maxHeight: '220px',
            overflowY: 'auto',
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
            zIndex: 101
          }}>
            <div
              onClick={() => {
                onSelect(null);
                setQuery('');
                setIsOpen(false);
              }}
              style={{
                padding: '10px 12px',
                borderBottom: '1px solid #f1f5f9',
                cursor: 'pointer',
                fontSize: '13px',
                color: '#64748b',
                background: !selectedClient ? '#f8fafc' : '#ffffff'
              }}
            >
              -- Fabrication standard / Sans client spécifique --
            </div>

            {filteredClients.map(c => {
              const isSelected = selectedClient && String(selectedClient.id) === String(c.id);
              return (
                <div
                  key={c.id}
                  onClick={() => {
                    onSelect(c);
                    setQuery(`${c.nom} ${c.numero_client ? `(${c.numero_client})` : ''}`);
                    setIsOpen(false);
                  }}
                  style={{
                    padding: '10px 12px',
                    borderBottom: '1px solid #f1f5f9',
                    cursor: 'pointer',
                    background: isSelected ? '#eff6ff' : '#ffffff',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={(e) => e.currentTarget.style.background = isSelected ? '#eff6ff' : '#ffffff'}
                >
                  <span style={{ fontWeight: '700', color: '#0f172a', fontSize: '13px' }}>
                    {c.nom}
                  </span>
                  {c.numero_client && (
                    <span style={{ color: '#64748b', fontSize: '12px', fontFamily: 'monospace' }}>
                      {c.numero_client}
                    </span>
                  )}
                </div>
              );
            })}

            {filteredClients.length === 0 && (
              <div style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                Aucun client ne correspond à "{query}".
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// =========================================================================
// 3. MODULE PRINCIPAL D'IMPRESSION
// =========================================================================
export default function PrintingModule({
  products,
  categories,
  clients,
  templates,
  printers,
  isPowerUser,
  stationParam,
  apiBase,
  setNotification
}) {
  const [activeCategory, setActiveCategory] = useState('Tous');
  const [selectedProduct, setSelectedProduct] = useState(null);
  
  // ÉTATS SAISIE VOLANTE
  const [isFreeInputMode, setIsFreeInputMode] = useState(false);
  const [freeInputCategory, setFreeInputCategory] = useState(null);

  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedPrinterId, setSelectedPrinterId] = useState(printers[0]?.id || '');
  const [selectedClient, setSelectedClient] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Paramètres d'impression & emballages
  const [colisCount, setColisCount] = useState(1);
  const [labelsPerColis, setLabelsPerColis] = useState(1);
  const [selectedPackagingId, setSelectedPackagingId] = useState('');
  const [isPrinting, setIsPrinting] = useState(false);
  const [debouncedZplCode, setDebouncedZplCode] = useState('');

  // Détection dynamique des contenants / emballages disponibles
  const packagingOptions = useMemo(() => {
    return products.filter(p => {
      if (p.is_default_packaging) return true;

      const cat = categories.find(c => String(c.id) === String(p.category) || c.name === p.category_name);
      if (cat && cat.is_printable === false) return true;

      const catName = (p.category_name || cat?.name || '').toLowerCase();
      const pName = (p.name || '').toLowerCase();
      return (
        catName.includes('emballage') || 
        catName.includes('carton') || 
        catName.includes('palette') || 
        catName.includes('consommable') ||
        pName.includes('carton') ||
        pName.includes('palette')
      );
    });
  }, [products, categories]);

  // Carton standard global configuré dans la base ou le premier disponible
  const globalDefaultBox = useMemo(() => {
    if (packagingOptions.length === 0) return null;
    return (
      packagingOptions.find(p => p.is_default_packaging) ||
      packagingOptions.find(p => p.sku?.toLowerCase().includes('car') || p.name?.toLowerCase().includes('carton')) ||
      packagingOptions[0]
    );
  }, [packagingOptions]);

  const currentPackaging = packagingOptions.find(p => String(p.id) === String(selectedPackagingId));

  // Formulaire universel (clé -> valeur)
  const [formData, setFormData] = useState({
    value: '100',
    unit_str: 'Kg',
    custom_name: ''
  });

  const printableCategories = useMemo(() => {
    return categories.filter(c => c.is_printable !== false);
  }, [categories]);

  const currentCategoryObj = categories.find(c => c.name === activeCategory);

  // Initialisation lors de la sélection d'un PRODUIT DU CATALOGUE
  useEffect(() => {
    if (selectedProduct) {
      setIsFreeInputMode(false);
      setFreeInputCategory(null);
      const initialFields = {
        value: '100',
        unit_str: selectedProduct.unit_symbol || 'U',
        custom_name: selectedProduct.name
      };

      const attrs = selectedProduct.attributes || selectedProduct.attribute_values || [];
      attrs.forEach(attr => {
        const nom = attr.attribute_name || attr.name || (attr.attribute && attr.attribute.name) || '';
        const key = nom.toUpperCase().trim().replace(/\s+/g, '_');
        if (key) initialFields[key] = attr.valeur || '';
      });

      setFormData(initialFields);
      if (selectedProduct.custom_template) {
        setSelectedTemplateId(selectedProduct.custom_template.id || selectedProduct.custom_template);
      } else if (selectedProduct.category?.default_template) {
        setSelectedTemplateId(selectedProduct.category.default_template.id || selectedProduct.category.default_template);
      }

      // Pré-sélection de l'emballage : spécifique du produit > standard usine > premier dispo
      if (selectedProduct.default_packaging_id) {
        setSelectedPackagingId(String(selectedProduct.default_packaging_id));
      } else if (globalDefaultBox) {
        setSelectedPackagingId(String(globalDefaultBox.id));
      } else {
        setSelectedPackagingId('');
      }
    }
  }, [selectedProduct, globalDefaultBox]);

  // Appliquer une catégorie à la saisie volante
  const applyCategoryToFreeInput = (catObj) => {
    setFreeInputCategory(catObj);

    setFormData(prev => {
      const updated = {
        ...prev,
        unit_str: catObj?.name?.toLowerCase().includes('bobine') ? 'Kg' : (prev.unit_str || 'U'),
        custom_name: prev.custom_name && !prev.custom_name.includes('VOLANTE')
          ? prev.custom_name 
          : (catObj ? `${catObj.name.toUpperCase()} VOLANTE` : 'ARTICLE VOLANT')
      };

      const catAttrs = catObj?.applicable_attributes || [];
      catAttrs.forEach(attr => {
        const key = attr.name.toUpperCase().trim().replace(/\s+/g, '_');
        if (updated[key] === undefined) {
          updated[key] = '';
        }
      });
      return updated;
    });

    if (catObj?.default_template) {
      setSelectedTemplateId(catObj.default_template.id || catObj.default_template);
    } else if (catObj) {
      const fallbackTpl = templates.find(t => t.name.toLowerCase().includes(catObj.name.toLowerCase()));
      if (fallbackTpl) setSelectedTemplateId(fallbackTpl.id);
    }
  };

  // Démarrage de la saisie volante avec sélection immédiate du carton standard
  const handleStartFreeInput = (catObj) => {
    setIsFreeInputMode(true);
    setSelectedProduct(null);

    if (globalDefaultBox) {
      setSelectedPackagingId(String(globalDefaultBox.id));
    } else {
      setSelectedPackagingId('');
    }

    const targetCat = catObj || printableCategories[0] || null;
    applyCategoryToFreeInput(targetCat);
  };

  const handleCategoryChangeInForm = (catId) => {
    const found = categories.find(c => String(c.id) === String(catId));
    applyCategoryToFreeInput(found || null);
  };

  const chosenTemplate = templates.find(t => String(t.id) === String(selectedTemplateId));

  // Calcul dynamique du flux ZPL
  const calculateZpl = (forPreview = false) => {
    let zpl = chosenTemplate?.zpl_code || selectedProduct?.zpl_template || '';
    if (!zpl) return '';

    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const todayStr = `${yy}${mm}${dd}`;

    let rawCodePoste = stationParam || 'PC_EXTRUSION_01';
    if (isPowerUser && selectedPrinterId) {
      const pObj = printers.find(p => String(p.id) === String(selectedPrinterId));
      if (pObj && pObj.code_poste) rawCodePoste = pObj.code_poste;
    }

    const cleaned = rawCodePoste.toUpperCase().replace('PC_', '');
    const match = cleaned.match(/([A-Z]{3,4}).*?(\d+)/);
    const prefixePoste = match ? `${match[1].slice(0, 3)}${match[2]}` : cleaned.slice(0, 4);

    const lotBatch = `${prefixePoste}-${todayStr}`;
    const codeColisUnique = `${lotBatch}-0001`;

    const designation = selectedProduct ? selectedProduct.name : (formData.custom_name || 'FABRICATION DIRECTE');
    const skuCode = selectedProduct ? selectedProduct.sku : `VOL-${todayStr}`;
    const quantiteAffichee = formData.value || '';

    zpl = zpl.replace(/{NAME}/g, designation);
    zpl = zpl.replace(/{SKU}/g, skuCode);
    zpl = zpl.replace(/{LOT_SHORT}/g, todayStr);
    zpl = zpl.replace(/{CLIENT_NAME}/g, selectedClient?.nom || '');
    zpl = zpl.replace(/{CLIENT_NUM}/g, selectedClient?.numero_client || '');
    zpl = zpl.replace(/{VALUE}/g, quantiteAffichee);
    zpl = zpl.replace(/{QTY_DETAILS}/g, quantiteAffichee);
    zpl = zpl.replace(/{UNIT}/g, formData.unit_str || 'U');

    Object.keys(formData).forEach(key => {
      zpl = zpl.split(`{${key}}`).join(formData[key] || '');
    });

    if (forPreview) {
      zpl = zpl.replace(/{LOT}/g, codeColisUnique);
      zpl = zpl.replace(/{LOT_BATCH}/g, lotBatch);
      zpl = zpl.replace(/{COLIS}/g, colisCount > 1 ? `1/${colisCount}` : '1');
      zpl = zpl.replace(/\{[A-Z0-9_]+\}/g, '');
    }

    return zpl;
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedZplCode(calculateZpl(true));
    }, 250);
    return () => clearTimeout(timer);
  }, [selectedProduct, isFreeInputMode, selectedTemplateId, selectedClient, formData, colisCount]);

  const handlePrint = (e) => {
    e.preventDefault();
    if (isPrinting) return;
    setIsPrinting(true);

    const payload = {
      raw_zpl: calculateZpl(false),
      code_poste: stationParam || 'PC_EXTRUSION_01',
      printer_id: isPowerUser ? selectedPrinterId : null,
      template_id: selectedTemplateId || null,
      product_id: selectedProduct?.id || null,
      packaging_id: selectedPackagingId || null,
      is_free_input: isFreeInputMode,
      custom_name: formData.custom_name || null,
      category_id: freeInputCategory?.id || null,
      colis_count: Number(colisCount) || 1,
      labels_per_colis: Number(labelsPerColis) || 1,
      client_name: selectedClient?.nom || '',
      client_num: selectedClient?.numero_client || '',
      ...formData
    };

    fetch(`${apiBase}/api/print/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success') {
          setNotification({ type: 'success', message: `✅ ${data.message}` });
          setSelectedProduct(null);
          setIsFreeInputMode(false);
          setSelectedPackagingId(globalDefaultBox ? String(globalDefaultBox.id) : '');
        } else {
          setNotification({ type: 'error', message: `❌ ${data.error || data.message}` });
        }
      })
      .catch(() => setNotification({ type: 'error', message: "Erreur de connexion avec l'imprimante." }))
      .finally(() => setIsPrinting(false));
  };

  const previewUrl = debouncedZplCode
    ? `http://api.labelary.com/v1/printers/8dpmm/labels/3.94x3.15/0/${encodeURIComponent(debouncedZplCode)}`
    : '';

  // =========================================================================
  // VUE 1 : CATALOGUE OU LANCEMENT DE LA SAISIE VOLANTE
  // =========================================================================
  if (!selectedProduct && !isFreeInputMode) {
    const filtered = products.filter(p => {
      const cat = categories.find(c => String(c.id) === String(p.category) || c.name === p.category_name);
      if (cat && cat.is_printable === false) return false;

      const matchCat = activeCategory === 'Tous' || p.category_name === activeCategory;
      const matchSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.sku.toLowerCase().includes(searchTerm.toLowerCase());
      return matchCat && matchSearch;
    });

    return (
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto' }}>
            <button
              className={`tab-btn ${activeCategory === 'Tous' ? 'active' : ''}`}
              onClick={() => setActiveCategory('Tous')}
            >
              Tous ({filtered.length})
            </button>
            {printableCategories.filter(c => !c.parent).map(c => (
              <button
                key={c.id}
                className={`tab-btn ${activeCategory === c.name ? 'active' : ''}`}
                onClick={() => setActiveCategory(c.name)}
              >
                {c.name}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => handleStartFreeInput(currentCategoryObj)}
            style={{
              background: '#16a34a',
              color: '#fff',
              border: 'none',
              padding: '10px 18px',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(22, 163, 74, 0.3)'
            }}
          >
            ⚡ Saisie Volante {activeCategory !== 'Tous' ? `(${activeCategory})` : ''}
          </button>
        </div>

        <input
          type="text"
          className="search-input"
          placeholder="🔍 Rechercher un article existant..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />

        <div className="product-grid" style={{ marginTop: '20px' }}>
          {filtered.map(p => (
            <div key={p.id} className="product-btn" onClick={() => setSelectedProduct(p)}>
              <span className="sku">{p.sku}</span>
              <span className="name">{p.name}</span>
              <span className="category">{p.category_name}</span>
            </div>
          ))}
          {filtered.length === 0 && (
            <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#94a3b8', padding: '30px' }}>
              Aucun article étiquetable trouvé.
            </p>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // VUE 2 : STUDIO CÔTE À CÔTE (PRODUIT OU SAISIE VOLANTE)
  // =========================================================================
  const attributesToDisplay = isFreeInputMode
    ? (freeInputCategory?.applicable_attributes || [])
    : (selectedProduct?.attributes || selectedProduct?.attribute_values || []);

  return (
    <div className="studio-layout" style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      <div className="print-card-studio">
        <button className="back-btn" onClick={() => { setSelectedProduct(null); setIsFreeInputMode(false); }}>
          &larr; Retour au catalogue
        </button>

        <div style={{ margin: '15px 0' }}>
          <span style={{
            background: isFreeInputMode ? '#16a34a' : '#2563eb',
            color: '#fff',
            padding: '4px 10px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 'bold'
          }}>
            {isFreeInputMode ? `SAISIE VOLANTE : ${freeInputCategory?.name || 'GÉNÉRAL'}` : selectedProduct?.category_name}
          </span>
          <h3 style={{ margin: '8px 0 0 0' }}>
            {isFreeInputMode ? (formData.custom_name || 'Fabrication Directe') : `[${selectedProduct.sku}] ${selectedProduct.name}`}
          </h3>
        </div>

        <form onSubmit={handlePrint} className="print-form">
          {/* SÉLECTEUR DE CATÉGORIE DANS LA SAISIE VOLANTE */}
          {isFreeInputMode && (
            <div className="form-group" style={{ background: '#f0fdf4', padding: '12px', borderRadius: '8px', border: '1px solid #bbf7d0', marginBottom: '15px' }}>
              <label style={{ fontWeight: 'bold', color: '#166534', display: 'block', marginBottom: '6px' }}>
                📁 Famille / Catégorie de l'article :
              </label>
              <select
                className="form-input"
                value={freeInputCategory ? String(freeInputCategory.id) : ''}
                onChange={e => handleCategoryChangeInForm(e.target.value)}
                style={{ width: '100%', height: '38px', borderRadius: '6px', background: '#fff', fontWeight: 'bold', border: '1px solid #86efac' }}
              >
                <option value="">-- Choisir la catégorie --</option>
                {printableCategories.map(cat => (
                  <option key={cat.id} value={String(cat.id)}>
                    {cat.parent ? `↳ ${cat.name}` : cat.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* SÉLECTEUR CLIENT RECHERCHABLE */}
          <div className="form-group" style={{ marginBottom: '15px' }}>
            <label style={{ fontWeight: 'bold', fontSize: '13px', display: 'block', marginBottom: '6px' }}>
              👤 Client Destinataire :
            </label>
            <SearchableClientSelect
              clients={clients}
              selectedClient={selectedClient}
              onSelect={(clientObj) => setSelectedClient(clientObj)}
            />
          </div>

          {/* Sélection Imprimante */}
          {isPowerUser && printers.length > 0 && (
            <div className="form-group">
              <label>Imprimante :</label>
              <select className="form-input" value={selectedPrinterId} onChange={e => setSelectedPrinterId(e.target.value)}>
                {printers.map(p => (
                  <option key={p.id} value={p.id}>{p.nom} — {p.ip_address}:{p.port}</option>
                ))}
              </select>
            </div>
          )}

          {/* Choix Template */}
          <div className="form-group">
            <label>Template ZPL :</label>
            <select className="form-input" value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)}>
              <option value="">-- Automatique --</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '15px' }}>
            <h4 style={{ margin: '0 0 12px 0', color: '#1e293b' }}>Caractéristiques :</h4>
            
            {isFreeInputMode && (
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label>Désignation sur l'étiquette :</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.custom_name || ''}
                  onChange={e => setFormData({ ...formData, custom_name: e.target.value })}
                />
              </div>
            )}

            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label>Poids / Quantité :</label>
              <div style={{ display: 'flex' }}>
                <input
                  type="number"
                  step="any"
                  className="form-input"
                  style={{ borderRadius: '6px 0 0 6px' }}
                  value={formData.value || ''}
                  onChange={e => setFormData({ ...formData, value: e.target.value })}
                />
                <input
                  type="text"
                  style={{ width: '70px', borderLeft: 'none', borderRadius: '0 6px 6px 0', textAlign: 'center', background: '#f1f5f9', fontWeight: 'bold' }}
                  value={formData.unit_str || 'Kg'}
                  onChange={e => setFormData({ ...formData, unit_str: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
              {attributesToDisplay.map(attr => {
                const nom = attr.attribute_name || attr.name || (attr.attribute && attr.attribute.name) || '';
                const key = nom.toUpperCase().trim().replace(/\s+/g, '_');
                if (!key) return null;
                
                const unit = attr.unit || attr.unit_symbol || attr.attribute_unit || '';
                const dtype = attr.data_type || (attr.attribute && attr.attribute.data_type) || 'TEXT';
                const isChoice = dtype === 'CHOICE';

                let rawOptions = attr.options_list || (attr.attribute && attr.attribute.options_list);
                if (!rawOptions && attr.options) {
                  rawOptions = attr.options.split(',').map(o => o.trim()).filter(Boolean);
                }
                const options = Array.isArray(rawOptions) ? rawOptions : [];

                return (
                  <div key={key} className="form-group" style={{ marginBottom: '8px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                      {nom} {unit ? `(${unit})` : ''} :
                    </label>

                    {isChoice && options.length > 0 ? (
                      <select
                        className="form-input"
                        value={formData[key] || ''}
                        onChange={e => setFormData({ ...formData, [key]: e.target.value })}
                        style={{ width: '100%', height: '38px', borderRadius: '6px', background: '#fff', border: '1px solid #cbd5e1' }}
                      >
                        <option value="">-- Sélectionner --</option>
                        {options.map((opt, idx) => (
                          <option key={idx} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={dtype === 'INTEGER' || dtype === 'NUMBER' ? 'number' : 'text'}
                        step={dtype === 'INTEGER' ? '1' : 'any'}
                        className="form-input"
                        placeholder={unit ? `en ${unit}` : `Saisir ${nom}`}
                        value={formData[key] || ''}
                        onChange={e => setFormData({ ...formData, [key]: e.target.value })}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {attributesToDisplay.length === 0 && (
              <p style={{ color: '#94a3b8', fontStyle: 'italic', margin: '5px 0' }}>
                Aucune caractéristique supplémentaire pour cette catégorie.
              </p>
            )}
          </div>

          {/* SÉLECTEUR D'EMBALLAGE RECHERCHABLE */}
          <div className="form-group" style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ fontWeight: 'bold', fontSize: '13px', color: '#1e293b' }}>
                📦 Emballage / Support utilisé :
              </label>
              {currentPackaging && currentPackaging.is_low_stock && (
                <span style={{ color: '#dc2626', fontSize: '12px', fontWeight: 'bold' }}>
                  ⚠️ Stock critique ({currentPackaging.stock_actuel} restant{currentPackaging.stock_actuel > 1 ? 's' : ''})
                </span>
              )}
            </div>

            <SearchablePackagingSelect
              options={packagingOptions}
              selectedId={selectedPackagingId}
              currentPackaging={currentPackaging}
              onSelect={(id) => setSelectedPackagingId(id)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <div className="form-group">
              <label>Nombre de colis :</label>
              <input
                type="number"
                min="1"
                className="form-input"
                value={colisCount}
                onChange={e => setColisCount(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
            <div className="form-group">
              <label>Exemplaires / colis :</label>
              <input
                type="number"
                min="1"
                className="form-input"
                value={labelsPerColis}
                onChange={e => setLabelsPerColis(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
          </div>

          <button type="submit" disabled={isPrinting} className="submit-print-btn">
            {isPrinting ? "Transmission..." : `🖨️ IMPRIMER (${colisCount * labelsPerColis} ex.)`}
          </button>
        </form>
      </div>

      {/* Aperçu Labelary */}
      <div className="preview-card-studio">
        <h4>👁 Aperçu réel :</h4>
        <div className="zebra-label-container">
          {previewUrl ? (
            <img src={previewUrl} alt="Aperçu Zebra" className="zebra-label-img" />
          ) : (
            <p style={{ color: '#95a5a6' }}>Modèle d'étiquette non chargé</p>
          )}
        </div>
      </div>
    </div>
  );
}