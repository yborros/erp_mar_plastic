import React, { useState, useEffect, useMemo, useRef } from 'react';

// Densité polyéthylène standard (g/cm³)
const DENSITE_PE = 0.922;
// Tolérance d'alerte d'épaisseur (+/- 8%)
const TOLERANCE_PCT = 8.0;

// Nuancier automatique pour les pastilles de couleur
const COLOR_PALETTE = {
  'neutre': '#f1f5f9',
  'transparent': '#f8fafc',
  'naturel': '#f8fafc',
  'blanc': '#ffffff',
  'noir': '#0f172a',
  'bleu': '#2563eb',
  'vert': '#16a34a',
  'jaune': '#eab308',
  'rouge': '#dc2626',
  'gris': '#64748b'
};

export default function BobineWeighingModule({
  categories = [],
  templates = [],
  printers = [],
  isPowerUser,
  stationParam,
  apiBase,
  setNotification
}) {
  const safeCategories = Array.isArray(categories) ? categories : [];
  const safePrinters = Array.isArray(printers) ? printers : [];

  const bobineCategory = useMemo(() => {
    return safeCategories.find(c => c && c.name && c.name.toLowerCase().includes('bobine')) || safeCategories[0] || null;
  }, [safeCategories]);

  // Caractéristiques visibles au poste
  const attributes = useMemo(() => {
    const rawAttrs = (bobineCategory && Array.isArray(bobineCategory.applicable_attributes)) 
      ? bobineCategory.applicable_attributes 
      : [];
    return rawAttrs.filter(attr => attr.visible_pesee !== false);
  }, [bobineCategory]);

  const [formData, setFormData] = useState({});
  const [selectedPrinterId, setSelectedPrinterId] = useState(safePrinters[0]?.id || '');
  const [isPrinting, setIsPrinting] = useState(false);

  // Alerte post-impression uniquement
  const [postPrintAlert, setPostPrintAlert] = useState(null);

  // États balance
  const [poidsLive, setPoidsLive] = useState(0.0);
  const [isStable, setIsStable] = useState(false);
  const [balanceConnected, setBalanceConnected] = useState(false);

  const inputsRef = useRef([]);

  // Écoute de la balance (local ou Tailscale)
  useEffect(() => {
    const isLocal = typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const balanceHost = isLocal ? 'localhost' : '100.93.53.96';

    const interval = setInterval(async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1000);

        const res = await fetch(`http://${balanceHost}:5000/poids`, { 
          cache: 'no-store',
          signal: controller.signal 
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          setPoidsLive(Number(data.poids) || 0.0);
          setIsStable(data.status === 'ok' && Number(data.poids) > 0.5);
          setBalanceConnected(true);
        } else {
          setBalanceConnected(false);
        }
      } catch (err) {
        setBalanceConnected(false);
      }
    }, 400);

    return () => clearInterval(interval);
  }, []);

  // Déplacement clavier
  const handleKeyDown = (e, index) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (index + 1 < attributes.length) {
        inputsRef.current[index + 1]?.focus();
      } else {
        document.getElementById('btn-valider-pesee')?.focus();
      }
    }
  };

  const handleAcquitterAlerte = () => {
    setPostPrintAlert(null);
    setFormData({});
    setTimeout(() => inputsRef.current[0]?.focus(), 100);
  };

  // Validation de la pesée
  const handleValiderPesee = (e) => {
    if (e) e.preventDefault();
    if (isPrinting) return;

    if (poidsLive <= 0) {
      if (setNotification) setNotification({ type: 'error', message: "Le poids mesuré sur la balance est nul." });
      return;
    }

    setIsPrinting(true);

    // Extraction dynamique des paramètres
    const laize = parseFloat(formData.LAIZE || formData.laize || 0);
    const micronConsigne = parseFloat(formData.MICRON || formData.micron || formData.epaisseur || 0);
    const metrage = parseFloat(formData.METRAGE || formData.metrage || formData.longueur || 0);
    const poids = parseFloat(poidsLive);

    // Détection dynamique du facteur de forme (Film = 1, Gaine = 2)
    let facteurForme = 2.0; // Gaine par défaut
    const formValuesStr = Object.values(formData).join(' ').toLowerCase();
    if (formValuesStr.includes('film') || formValuesStr.includes('plat')) {
      facteurForme = 1.0;
    }

    let hasAlert = false;
    let ecartPct = 0;
    let micronCalcule = 0;
    let poidsTheorique = 0;

    if (laize > 0 && micronConsigne > 0 && metrage > 0 && poids > 0.5) {
      poidsTheorique = (laize * metrage * micronConsigne * facteurForme * DENSITE_PE) / 1000000;
      micronCalcule = (poids * 1000000) / (laize * metrage * facteurForme * DENSITE_PE);
      ecartPct = ((micronCalcule - micronConsigne) / micronConsigne) * 100;
      hasAlert = Math.abs(ecartPct) > TOLERANCE_PCT;
    }

    const payload = {
      code_poste: stationParam || 'PC_EXTRUSION_01',
      printer_id: isPowerUser ? selectedPrinterId : null,
      is_free_input: true,
      category_id: bobineCategory?.id || null,
      custom_name: `Bobine ${formData.FORME || ''} ${laize ? laize + 'mm' : ''}`,
      value: String(poidsLive.toFixed(2)),
      unit_str: 'Kg',
      colis_count: 1,
      labels_per_colis: 1,
      // Données de contrôle qualité
      anomalie_epaisseur: hasAlert,
      type_forme: facteurForme === 1.0 ? 'FILM' : 'GAINE',
      micron_consigne: micronConsigne || null,
      micron_calcule: micronCalcule ? micronCalcule.toFixed(1) : null,
      ecart_epaisseur_pct: ecartPct ? ecartPct.toFixed(1) : null,
      poids_theorique_kg: poidsTheorique ? poidsTheorique.toFixed(2) : null,
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
          if (hasAlert) {
            setPostPrintAlert({
              typeForme: facteurForme === 1.0 ? 'Film à plat (mono)' : 'Gaine tubulaire (double)',
              micronConsigne,
              micronCalcule: micronCalcule.toFixed(1),
              ecartPct: ecartPct.toFixed(1),
              poidsTheorique: poidsTheorique.toFixed(2),
              poidsReel: poids.toFixed(2)
            });
            if (setNotification) {
              setNotification({ type: 'error', message: `⚠️ ÉTIQUETTE SORTIE AVEC ANOMALIE D'ÉPAISSEUR (+${ecartPct.toFixed(1)}%)` });
            }
          } else {
            if (setNotification) {
              setNotification({ type: 'success', message: `✅ Bobine conforme imprimée (${poids.toFixed(2)} Kg)` });
            }
            setFormData({});
            inputsRef.current[0]?.focus();
          }
        } else {
          if (setNotification) setNotification({ type: 'error', message: `❌ ${data.message || 'Erreur impression'}` });
        }
      })
      .catch(() => {
        if (setNotification) setNotification({ type: 'error', message: "Erreur de transmission vers l'imprimante." });
      })
      .finally(() => setIsPrinting(false));
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
      
      {/* BARRE STATUT */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', background: '#1e293b', padding: '12px 20px', borderRadius: '12px', color: '#fff' }}>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <span style={{
            background: balanceConnected ? '#065f46' : '#881337',
            color: balanceConnected ? '#34d399' : '#fda4af',
            padding: '5px 12px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 'bold'
          }}>
            BALANCE : {balanceConnected ? 'CONNECTÉE' : 'EN ATTENTE DU CÂBLE'}
          </span>
          <span style={{ fontSize: '14px', color: '#94a3b8' }}>
            Poste : <strong style={{ color: '#fff' }}>{stationParam || 'EXTRUSION_01'}</strong>
          </span>
        </div>

        {isPowerUser && safePrinters.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '13px', color: '#94a3b8' }}>Imprimante :</span>
            <select
              value={selectedPrinterId}
              onChange={e => setSelectedPrinterId(e.target.value)}
              style={{ background: '#0f172a', color: '#fff', border: '1px solid #475569', padding: '6px 10px', borderRadius: '6px', fontWeight: 'bold' }}
            >
              {safePrinters.map(p => (
                <option key={p.id} value={p.id}>{p.nom} ({p.ip_address})</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* BANDEAU ROUGE D'ALERTE POST-IMPRESSION */}
      {postPrintAlert && (
        <div style={{
          background: '#dc2626',
          color: '#ffffff',
          padding: '24px',
          borderRadius: '16px',
          marginBottom: '25px',
          boxShadow: '0 10px 25px rgba(220, 38, 38, 0.5)',
          border: '3px solid #b91c1c'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '15px' }}>
            <div>
              <div style={{ fontSize: '26px', fontWeight: '900', letterSpacing: '0.04em' }}>
                🚨 ÉTIQUETTE SORTIE — ANOMALIE D'ÉPAISSEUR CONSTATÉE !
              </div>
              <div style={{ fontSize: '18px', fontWeight: '700', marginTop: '10px', lineHeight: '1.6' }}>
                • Type détecté : <strong>{postPrintAlert.typeForme}</strong><br/>
                • Consigne demandée : <strong>{postPrintAlert.micronConsigne} µm</strong><br/>
                • Épaisseur réelle calculée : <strong style={{ textDecoration: 'underline' }}>{postPrintAlert.micronCalcule} µm</strong> ({postPrintAlert.ecartPct > 0 ? '+' : ''}{postPrintAlert.ecartPct} % d'écart)<br/>
                • Poids mesuré : <strong>{postPrintAlert.poidsReel} Kg</strong> (Théorique attendu : {postPrintAlert.poidsTheorique} Kg)
              </div>
              <div style={{ marginTop: '12px', fontSize: '15px', background: 'rgba(0,0,0,0.25)', padding: '8px 14px', borderRadius: '8px', display: 'inline-block' }}>
                ⚠️ <strong>Anomalie enregistrée dans le système ERP</strong>. Veuillez vérifier l'extrudeuse immédiatement.
              </div>
            </div>

            <button
              type="button"
              onClick={handleAcquitterAlerte}
              style={{
                background: '#ffffff',
                color: '#dc2626',
                border: 'none',
                padding: '14px 24px',
                borderRadius: '10px',
                fontSize: '18px',
                fontWeight: '900',
                cursor: 'pointer',
                boxShadow: '0 4px 10px rgba(0,0,0,0.2)'
              }}
            >
              Compris & Acquitter [Continuer] &rarr;
            </button>
          </div>
        </div>
      )}

      {/* DISPOSITION 2 COLONNES */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
        
        {/* CADRE POIDS */}
        <div style={{
          background: '#0f172a',
          border: '3px solid #3b82f6',
          borderRadius: '20px',
          padding: '40px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          boxShadow: '0 10px 25px -5px rgba(59, 130, 246, 0.2)'
        }}>
          <span style={{ fontSize: '18px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.1em' }}>
            POIDS RÉEL MESURÉ
          </span>

          <div style={{
            fontSize: '95px',
            fontWeight: '900',
            color: isStable ? '#10b981' : '#f59e0b',
            lineHeight: 1,
            margin: '20px 0',
            fontFamily: 'monospace'
          }}>
            {poidsLive.toFixed(2)}
          </div>

          <span style={{ fontSize: '26px', fontWeight: '800', color: '#94a3b8' }}>
            KILOGRAMMES
          </span>

          <div style={{ marginTop: '20px', fontSize: '15px', fontWeight: '700', color: isStable ? '#10b981' : '#f59e0b' }}>
            {isStable ? '✅ POIDS STABLE' : (poidsLive > 0.5 ? '⏳ Stabilisation en cours...' : 'Posez la bobine sur le plateau')}
          </div>
        </div>

        {/* CADRE FORMULAIRE AVEC BOUTONS RADIOS VISUELS */}
        <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '20px', padding: '26px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: '0 0 18px 0', color: '#0f172a', fontSize: '18px', fontWeight: '800' }}>
              Paramètres Bobine ({bobineCategory?.name || 'Extrusion'})
            </h3>

            {attributes.map((attr, idx) => {
              const nom = attr.name || (attr.attribute && attr.attribute.name) || '';
              const key = nom.toUpperCase().trim().replace(/\s+/g, '_');
              if (!key) return null;

              const isChoice = attr.data_type === 'CHOICE';
              const options = attr.options_list || [];
              const isForme = key.includes('FORME') || key.includes('TYPE');
              const isCouleur = key.includes('COULEUR');

              return (
                <div key={key} style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '800', color: '#0f172a', marginBottom: '8px' }}>
                    {idx + 1}. {nom} {attr.unit_symbol ? `(${attr.unit_symbol})` : ''} :
                  </label>

                  {/* 1. CAS DES BOUTONS RADIOS TACTILES POUR LES CHOIX */}
                  {isChoice && options.length > 0 ? (
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      {options.map((opt, oIdx) => {
                        const isSelected = formData[key] === opt;
                        const optLower = opt.toLowerCase();

                        // Icônes personnalisées pour Forme
                        let icon = null;
                        if (isForme) {
                          if (optLower.includes('gaine') || optLower.includes('tube')) icon = '⭕ Gaine (x2)';
                          else if (optLower.includes('film') || optLower.includes('plat')) icon = '📜 Film (x1)';
                        }

                        // Pastilles pour Couleurs
                        const colorHex = COLOR_PALETTE[optLower] || null;

                        return (
                          <button
                            key={oIdx}
                            type="button"
                            onClick={() => {
                              setFormData({ ...formData, [key]: opt });
                              if (idx + 1 < attributes.length) {
                                inputsRef.current[idx + 1]?.focus();
                              }
                            }}
                            style={{
                              flex: '1 1 auto',
                              minWidth: '90px',
                              height: '46px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px',
                              borderRadius: '8px',
                              border: isSelected ? '2px solid #2563eb' : '1px solid #cbd5e1',
                              background: isSelected ? '#eff6ff' : '#ffffff',
                              color: isSelected ? '#1e40af' : '#334155',
                              fontWeight: isSelected ? '800' : '600',
                              fontSize: '15px',
                              cursor: 'pointer',
                              boxShadow: isSelected ? '0 2px 6px rgba(37,99,235,0.15)' : 'none'
                            }}
                          >
                            {/* Pastille couleur */}
                            {isCouleur && colorHex && (
                              <span style={{
                                width: '16px',
                                height: '16px',
                                borderRadius: '50%',
                                background: colorHex,
                                border: optLower === 'blanc' || optLower.includes('trans') ? '1px solid #cbd5e1' : 'none',
                                display: 'inline-block'
                              }} />
                            )}
                            {icon || opt}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    /* 2. CAS DES CHAMPS NUMÉRIQUES / TEXTE */
                    <input
                      ref={el => inputsRef.current[idx] = el}
                      type={attr.data_type === 'NUMBER' || attr.data_type === 'INTEGER' ? 'number' : 'text'}
                      value={formData[key] || ''}
                      placeholder={`Saisir ${nom}`}
                      onChange={e => setFormData({ ...formData, [key]: e.target.value })}
                      onKeyDown={e => handleKeyDown(e, idx)}
                      style={{
                        width: '100%',
                        height: '48px',
                        borderRadius: '8px',
                        border: '2px solid #cbd5e1',
                        padding: '0 14px',
                        fontSize: '20px',
                        fontWeight: '800',
                        boxSizing: 'border-box'
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <button
            id="btn-valider-pesee"
            type="button"
            disabled={isPrinting}
            onClick={handleValiderPesee}
            style={{
              width: '100%',
              height: '75px',
              borderRadius: '12px',
              border: 'none',
              background: '#16a34a',
              color: '#ffffff',
              fontSize: '22px',
              fontWeight: '900',
              cursor: 'pointer',
              marginTop: '15px'
            }}
          >
            {isPrinting ? 'TRANSMISSION ZEBRA...' : '🖨️ IMPRIMER [ENTRÉE]'}
          </button>
        </div>
      </div>

    </div>
  );
}