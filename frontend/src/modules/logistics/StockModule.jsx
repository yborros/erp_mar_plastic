import React, { useState, useEffect, useMemo } from 'react';

export default function StockModule({ apiBase, setNotification }) {
  const [items, setItems] = useState([]);
  const [history, setHistory] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Navigation par tuiles (Drill-down)
  const [activeParentCat, setActiveParentCat] = useState(null); // Catégorie mère choisie
  const [activeSubCat, setActiveSubCat] = useState(null);       // Sous-catégorie choisie
  const [showCriticalOnly, setShowCriticalOnly] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal d'ajustement / réception
  const [modalItem, setModalItem] = useState(null);
  const [mode, setMode] = useState('ADD'); // 'ADD' = Réception | 'SET' = Inventaire
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchStockData = () => {
    setLoading(true);
    Promise.all([
      fetch(`${apiBase}/api/stock/items/`).then(res => res.ok ? res.json() : []),
      fetch(`${apiBase}/api/stock/history/`).then(res => res.ok ? res.json() : []),
      // Récupère toutes les catégories brutes sans filtre is_printable
      fetch(`${apiBase}/api/categories/`).then(res => res.ok ? res.json() : [])
    ])
      .then(([itemsData, historyData, catData]) => {
        const getList = (d) => Array.isArray(d) ? d : (d?.results || []);
        setItems(getList(itemsData));
        setHistory(getList(historyData));
        setCategories(getList(catData));
      })
      .catch(() => setNotification({ type: 'error', message: "Erreur de chargement des stocks." }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchStockData();
  }, []);

  // Détection des articles sous gestion stricte de stock (matières premières & consommables)
  const isMonitoredForStockAlert = (item) => {
    const cat = categories.find(c => String(c.id) === String(item.category) || c.name === item.category_name);
    if (cat && cat.is_printable === false) return true;
    const catName = (item.category_name || cat?.name || '').toLowerCase();
    return catName.includes('emballage') || catName.includes('carton') || catName.includes('palette') || catName.includes('matiere') || catName.includes('consommable');
  };

  // 1. Liste des familles mères (sans parent)
  const parentCategories = useMemo(() => {
    return categories.filter(c => !c.parent);
  }, [categories]);

  // 2. Sous-familles de la famille active
  const subCategories = useMemo(() => {
    if (!activeParentCat) return [];
    return categories.filter(c => String(c.parent) === String(activeParentCat.id));
  }, [categories, activeParentCat]);

  // Compteur d'articles par catégorie pour les badges sur les tuiles
  const getItemCountForCat = (catId, isParent = false) => {
    if (isParent) {
      const childIds = categories.filter(c => String(c.parent) === String(catId)).map(c => c.id);
      const allIds = [catId, ...childIds].map(String);
      return items.filter(i => allIds.includes(String(i.category))).length;
    }
    return items.filter(i => String(i.category) === String(catId)).length;
  };

  // Compteur d'alertes critiques pour une catégorie
  const getCriticalCountForCat = (catId, isParent = false) => {
    if (isParent) {
      const childIds = categories.filter(c => String(c.parent) === String(catId)).map(c => c.id);
      const allIds = [catId, ...childIds].map(String);
      return items.filter(i => allIds.includes(String(i.category)) && isMonitoredForStockAlert(i) && i.is_low_stock).length;
    }
    return items.filter(i => String(i.category) === String(catId) && isMonitoredForStockAlert(i) && i.is_low_stock).length;
  };

  // 3. Articles filtrés pour la grille finale
  const displayedItems = useMemo(() => {
    return items.filter(item => {
      // Si recherche par texte, on by-pass la navigation par tuiles pour un accès instantané
      if (searchTerm.trim() !== '') {
        const s = searchTerm.toLowerCase();
        return item.name.toLowerCase().includes(s) || item.sku.toLowerCase().includes(s);
      }

      // Si alerte critique cochée
      if (showCriticalOnly) {
        return isMonitoredForStockAlert(item) && item.is_low_stock;
      }

      // Filtrage selon les tuiles actives
      if (activeSubCat) {
        return String(item.category) === String(activeSubCat.id);
      }
      if (activeParentCat) {
        const childIds = subCategories.map(s => String(s.id));
        return String(item.category) === String(activeParentCat.id) || childIds.includes(String(item.category));
      }

      // Par défaut au niveau 0 : on ne charge pas tout en vrac pour éviter la liste sans fin
      return false;
    });
  }, [items, searchTerm, showCriticalOnly, activeParentCat, activeSubCat, subCategories]);

  const totalCritical = useMemo(() => {
    return items.filter(i => isMonitoredForStockAlert(i) && i.is_low_stock).length;
  }, [items, categories]);

  // Modal Handlers
  const openActionModal = (item, actionType) => {
    setModalItem(item);
    setMode(actionType);
    setQuantity(actionType === 'ADD' ? 100 : item.stock_actuel);
    setNote('');
  };

  const closeModal = () => {
    setModalItem(null);
    setQuantity('');
    setNote('');
  };

  const handleMovementSubmit = (e) => {
    e.preventDefault();
    if (!modalItem || quantity === '' || isNaN(quantity)) return;

    setIsSubmitting(true);
    fetch(`${apiBase}/api/stock/movement/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: modalItem.id,
        mode: mode,
        quantity: Number(quantity),
        note: note
      })
    })
      .then(r => r.json())
      .then(data => {
        if (data.status === 'success') {
          setNotification({ type: 'success', message: `✅ ${data.message}` });
          closeModal();
          fetchStockData();
        } else {
          setNotification({ type: 'error', message: `❌ ${data.message || 'Erreur.'}` });
        }
      })
      .catch(() => setNotification({ type: 'error', message: "Erreur serveur." }))
      .finally(() => setIsSubmitting(false));
  };

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px', fontFamily: 'system-ui, sans-serif' }}>
      
      {/* EN-TÊTE & ACTIONS PRINCIPALES */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h2 style={{ margin: 0, color: '#0f172a', fontSize: '24px', fontWeight: '800' }}>
            📦 Magasin & Gestion des Stocks
          </h2>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '14px' }}>
            Navigation par famille d'articles, réceptions et inventaires rapides
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            onClick={() => {
              setShowCriticalOnly(!showCriticalOnly);
              setActiveParentCat(null);
              setActiveSubCat(null);
              setSearchTerm('');
            }}
            style={{
              background: showCriticalOnly ? '#dc2626' : totalCritical > 0 ? '#fff1f2' : '#f8fafc',
              color: showCriticalOnly ? '#fff' : totalCritical > 0 ? '#dc2626' : '#64748b',
              border: totalCritical > 0 ? '1px solid #fecdd3' : '1px solid #cbd5e1',
              borderRadius: '8px',
              padding: '10px 16px',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            🚨 {totalCritical} Rupture(s) détectée(s)
          </button>

          <button
            onClick={fetchStockData}
            style={{
              background: '#fff',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              padding: '10px 16px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            🔄 Actualiser
          </button>
        </div>
      </div>

      {/* BARRE DE RECHERCHE UNIVERSELLE RAPIDE */}
      <div style={{ marginBottom: '24px' }}>
        <input
          type="text"
          placeholder="🔍 Recherche directe par référence (SKU) ou nom pour sortir du mode tuiles..."
          value={searchTerm}
          onChange={e => {
            setSearchTerm(e.target.value);
            if (e.target.value) {
              setShowCriticalOnly(false);
            }
          }}
          style={{
            width: '100%',
            padding: '14px 18px',
            borderRadius: '12px',
            border: '2px solid #cbd5e1',
            fontSize: '15px',
            boxSizing: 'border-box',
            outline: 'none',
            boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
          }}
        />
      </div>

      {/* FIL D'ARIANE TACTILE */}
      {!searchTerm && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', fontSize: '15px', fontWeight: '600', color: '#475569' }}>
          <span 
            onClick={() => { setActiveParentCat(null); setActiveSubCat(null); setShowCriticalOnly(false); }}
            style={{ cursor: 'pointer', color: '#2563eb', textDecoration: activeParentCat || showCriticalOnly ? 'underline' : 'none' }}
          >
            🏠 Toutes les Familles
          </span>

          {activeParentCat && (
            <>
              <span>&gt;</span>
              <span
                onClick={() => setActiveSubCat(null)}
                style={{ cursor: activeSubCat ? 'pointer' : 'default', color: activeSubCat ? '#2563eb' : '#0f172a', textDecoration: activeSubCat ? 'underline' : 'none' }}
              >
                {activeParentCat.name}
              </span>
            </>
          )}

          {activeSubCat && (
            <>
              <span>&gt;</span>
              <span style={{ color: '#0f172a', fontWeight: '800' }}>
                {activeSubCat.name}
              </span>
            </>
          )}

          {showCriticalOnly && (
            <>
              <span>&gt;</span>
              <span style={{ color: '#dc2626', fontWeight: '800' }}>Articles en Rupture</span>
            </>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* VUE 1 : TUILES DES FAMILLES PRINCIPALES (NIVEAU 0)                       */}
      {/* ========================================================================= */}
      {!searchTerm && !showCriticalOnly && !activeParentCat && (
        <div>
          <h3 style={{ margin: '0 0 16px 0', color: '#334155', fontSize: '17px' }}>
            Sélectionnez une catégorie de stock :
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
            {parentCategories.map(cat => {
              const count = getItemCountForCat(cat.id, true);
              const crit = getCriticalCountForCat(cat.id, true);

              return (
                <div
                  key={cat.id}
                  onClick={() => setActiveParentCat(cat)}
                  style={{
                    background: '#ffffff',
                    border: crit > 0 ? '2px solid #fecdd3' : '2px solid #e2e8f0',
                    borderRadius: '16px',
                    padding: '24px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 10px rgba(0,0,0,0.03)',
                    transition: 'transform 0.15s, border-color 0.15s',
                    position: 'relative'
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-3px)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div style={{ fontSize: '36px' }}>
                      {cat.name.toLowerCase().includes('emballage') ? '📦' : cat.name.toLowerCase().includes('mati') ? '🧪' : '📑'}
                    </div>
                    {crit > 0 && (
                      <span style={{ background: '#e11d48', color: '#fff', padding: '3px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: '800' }}>
                        {crit} ALERTE{crit > 1 ? 'S' : ''}
                      </span>
                    )}
                  </div>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '18px', color: '#0f172a' }}>{cat.name}</h4>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>
                    {count} référence{count > 1 ? 's' : ''} répertoriée{count > 1 ? 's' : ''}
                  </p>
                  <div style={{ marginTop: '16px', fontSize: '13px', fontWeight: '700', color: '#2563eb' }}>
                    Explorer &rarr;
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VUE 2 : SOUS-FAMILLES (NIVEAU 1)                                          */}
      {/* ========================================================================= */}
      {!searchTerm && !showCriticalOnly && activeParentCat && !activeSubCat && subCategories.length > 0 && (
        <div style={{ marginBottom: '30px' }}>
          <h3 style={{ margin: '0 0 16px 0', color: '#334155', fontSize: '17px' }}>
            Sous-catégories de {activeParentCat.name} :
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            {subCategories.map(sub => {
              const count = getItemCountForCat(sub.id, false);
              const crit = getCriticalCountForCat(sub.id, false);

              return (
                <div
                  key={sub.id}
                  onClick={() => setActiveSubCat(sub)}
                  style={{
                    background: '#ffffff',
                    border: crit > 0 ? '2px solid #fecdd3' : '1px solid #cbd5e1',
                    borderRadius: '12px',
                    padding: '18px 20px',
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: '700', fontSize: '15px', color: '#0f172a' }}>{sub.name}</span>
                    {crit > 0 && (
                      <span style={{ background: '#e11d48', color: '#fff', padding: '2px 6px', borderRadius: '6px', fontSize: '10px', fontWeight: '800' }}>
                        {crit}
                      </span>
                    )}
                  </div>
                  <div style={{ color: '#64748b', fontSize: '12px', marginTop: '6px' }}>
                    {count} article{count > 1 ? 's' : ''} &rarr;
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VUE 3 : GRILLE DE CARTES ARTICLES (FINALE)                                */}
      {/* ========================================================================= */}
      {(searchTerm || showCriticalOnly || activeSubCat || (activeParentCat && subCategories.length === 0)) && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '17px', fontWeight: '800' }}>
              Articles ({displayedItems.length})
            </h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '18px' }}>
            {displayedItems.map(item => {
              const isMonitored = isMonitoredForStockAlert(item);
              const isAlert = isMonitored && item.is_low_stock;
              const ratio = Math.min(100, Math.round((item.stock_actuel / Math.max(item.seuil_alerte * 2, 1)) * 100));

              return (
                <div
                  key={item.id}
                  style={{
                    background: '#ffffff',
                    border: isAlert ? '2px solid #f43f5e' : '1px solid #e2e8f0',
                    borderRadius: '14px',
                    padding: '18px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    position: 'relative'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', fontFamily: 'monospace' }}>
                        {item.sku}
                      </span>
                      {isAlert && (
                        <span style={{ background: '#ffe4e6', color: '#e11d48', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '800' }}>
                          RUPTURE
                        </span>
                      )}
                    </div>

                    <h4 style={{ margin: '0 0 12px 0', fontSize: '15px', color: '#0f172a', fontWeight: '700', minHeight: '38px' }}>
                      {item.name}
                    </h4>

                    {/* BLOC STOCK */}
                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                        <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>RÉSERVE :</span>
                        <span style={{ fontSize: '20px', fontWeight: '900', color: isAlert ? '#e11d48' : '#0f172a' }}>
                          {item.stock_actuel} <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>{item.unit_symbol}</span>
                        </span>
                      </div>

                      {isMonitored ? (
                        <>
                          <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden', marginBottom: '4px' }}>
                            <div style={{ width: `${ratio}%`, height: '100%', background: isAlert ? '#e11d48' : '#10b981' }} />
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'right' }}>
                            Seuil d'alerte : {item.seuil_alerte} {item.unit_symbol}
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', textAlign: 'right' }}>
                          Fabriqué sur commande
                        </div>
                      )}
                    </div>
                  </div>

                  {/* BOUTONS D'ACTIONS TACTILES */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <button
                      onClick={() => openActionModal(item, 'ADD')}
                      style={{
                        background: '#eff6ff',
                        color: '#2563eb',
                        border: '1px solid #bfdbfe',
                        padding: '9px 0',
                        borderRadius: '8px',
                        fontWeight: '700',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      📥 Entrée
                    </button>
                    <button
                      onClick={() => openActionModal(item, 'SET')}
                      style={{
                        background: '#f8fafc',
                        color: '#475569',
                        border: '1px solid #cbd5e1',
                        padding: '9px 0',
                        borderRadius: '8px',
                        fontWeight: '700',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      📝 Inventaire
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {displayedItems.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              Aucun article ne correspond à cette sélection.
            </div>
          )}
        </div>
      )}

      {/* MODAL D'ACTION */}
      {modalItem && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '460px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', color: '#0f172a', fontWeight: '800' }}>
                  {mode === 'ADD' ? '📥 Réception Fournisseur' : '📝 Ajustement Inventaire'}
                </h3>
                <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
                  [{modalItem.sku}] {modalItem.name}
                </p>
              </div>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>

            <form onSubmit={handleMovementSubmit} style={{ padding: '20px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                  {mode === 'ADD' ? 'Quantité reçue :' : 'Nouveau stock réel total :'}
                </label>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <input
                    type="number"
                    min="0"
                    autoFocus
                    required
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                    style={{ flex: 1, padding: '10px 14px', borderRadius: '8px 0 0 8px', border: '1px solid #cbd5e1', fontSize: '16px', fontWeight: '700' }}
                  />
                  <span style={{ padding: '10px 16px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderLeft: 'none', borderRadius: '0 8px 8px 0', fontWeight: '700', color: '#475569' }}>
                    {modalItem.unit_symbol || 'U'}
                  </span>
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                  Numéro de BL ou Motif :
                </label>
                <input
                  type="text"
                  placeholder={mode === 'ADD' ? 'ex: BL 45091' : 'ex: Recomptage atelier'}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={closeModal} style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontWeight: '600', cursor: 'pointer' }}>
                  Annuler
                </button>
                <button type="submit" disabled={isSubmitting} style={{ padding: '10px 18px', borderRadius: '8px', border: 'none', background: mode === 'ADD' ? '#2563eb' : '#d97706', color: '#fff', fontWeight: '700', cursor: 'pointer' }}>
                  {isSubmitting ? 'Validation...' : (mode === 'ADD' ? 'Confirmer' : 'Ajuster')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}