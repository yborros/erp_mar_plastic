import React, { useState, useEffect } from 'react';

// Adapter selon l'adresse de votre backend Django
const API_BASE = 'http://localhost:8000';

export default function LancementOF() {
  const [products, setProducts] = useState([]);
  const [clients, setClients] = useState([]);
  const [recentOfs, setRecentOfs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Formulaire de saisie
  const [formData, setFormData] = useState({
    produit_id: '',
    quantite_cible: '',
    poste_travail: 'S2',
    client_id: '',
    pistes: 1,
    notes: '',
  });

  const selectedProduct = products.find(p => String(p.id) === String(formData.produit_id));

  // Chargement initial des données
  useEffect(() => {
    fetchProducts();
    fetchClients();
    fetchRecentOfs();
  }, []);

  const fetchProducts = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/printing/products/`);
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      console.error('Erreur chargement produits:', err);
    }
  };

  const fetchClients = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/printing/clients/`);
      const data = await res.json();
      setClients(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      console.error('Erreur chargement clients:', err);
    }
  };

  const fetchRecentOfs = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/production/of/?all=true`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.results || [];
      setRecentOfs(list.slice(0, 8)); // Conserve les 8 plus récents
    } catch (err) {
      console.error('Erreur chargement OFs:', err);
    }
  };

  const handlePrint = (ofId) => {
    // Ouvre la vue A4 Django existante dans un nouvel onglet
    window.open(`${API_BASE}/api/production/of/${ofId}/print/`, '_blank');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.produit_id || !formData.quantite_cible) {
      setErrorMsg('Veuillez sélectionner un article et renseigner une quantité.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const payload = {
        produit: formData.produit_id,
        quantite_cible: parseFloat(formData.quantite_cible),
        poste_travail: formData.poste_travail,
        pistes: parseInt(formData.pistes, 10) || 1,
        notes: formData.notes,
        ...(formData.client_id ? { client: formData.client_id } : {}),
      };

      const res = await fetch(`${API_BASE}/api/production/of/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error('Erreur lors de la création de l\'OF');
      }

      const newOf = await res.json();

      // 1. Ouvre automatiquement la fiche A4 prête à imprimer
      handlePrint(newOf.id);

      // 2. Réinitialise la quantité et actualise la liste
      setFormData(prev => ({ ...prev, quantite_cible: '', notes: '' }));
      fetchRecentOfs();
    } catch (err) {
      setErrorMsg(err.message || 'Échec de connexion au serveur Django');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '900px', margin: '30px auto', padding: '24px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* En-tête du module discret */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '12px', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>Lancement d'Ordre de Fabrication</h1>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>Module atelier & bureau (accès restreint)</p>
        </div>
        <span style={{ background: '#f1f5f9', color: '#334155', padding: '4px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>
          Génération auto N° OP
        </span>
      </div>

      {errorMsg && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '12px', borderRadius: '6px', marginBottom: '16px', fontSize: '14px' }}>
          {errorMsg}
        </div>
      )}

      {/* Formulaire de création */}
      <form onSubmit={handleSubmit} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        
        {/* Ligne 1 : Choix du Produit */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '6px', color: '#1e293b' }}>
            Article / Référence Sachet *
          </label>
          <select
            value={formData.produit_id}
            onChange={(e) => setFormData({ ...formData, produit_id: e.target.value })}
            style={{ width: '100%', padding: '10px 12px', fontSize: '14px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            required
          >
            <option value="">-- Sélectionnez l'article à lancer en production --</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} — {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Ligne 2 : Quantité, Unité & Machine */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.5fr 1fr', gap: '14px', marginBottom: '16px' }}>
          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '6px', color: '#1e293b' }}>
              Quantité à produire *
            </label>
            <input
              type="number"
              step="any"
              placeholder="ex: 5000"
              value={formData.quantite_cible}
              onChange={(e) => setFormData({ ...formData, quantite_cible: e.target.value })}
              style={{ width: '100%', padding: '10px 12px', fontSize: '14px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '6px', color: '#1e293b' }}>
              Unité
            </label>
            <input
              type="text"
              readOnly
              value={selectedProduct?.unit_abbreviation || selectedProduct?.unit?.abbreviation || 'Auto'}
              style={{ width: '100%', padding: '10px 12px', fontSize: '14px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', fontWeight: 'bold' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '6px', color: '#1e293b' }}>
              Machine / Poste
            </label>
            <input
              type="text"
              value={formData.poste_travail}
              onChange={(e) => setFormData({ ...formData, poste_travail: e.target.value })}
              style={{ width: '100%', padding: '10px 12px', fontSize: '14px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '6px', color: '#1e293b' }}>
              Pistes
            </label>
            <input
              type="number"
              min="1"
              value={formData.pistes}
              onChange={(e) => setFormData({ ...formData, pistes: e.target.value })}
              style={{ width: '100%', padding: '10px 12px', fontSize: '14px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            />
          </div>
        </div>

        {/* Ligne 3 : Client optionnel & Remarques */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 2fr', gap: '14px', marginBottom: '20px' }}>
          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '6px', color: '#1e293b' }}>
              Client (optionnel)
            </label>
            <select
              value={formData.client_id}
              onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
              style={{ width: '100%', padding: '10px 12px', fontSize: '14px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            >
              <option value="">Stock / Commande Interne</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom} ({c.numero_client})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '6px', color: '#1e293b' }}>
              Instructions particulières (affichées sur la fiche)
            </label>
            <input
              type="text"
              placeholder="Ex: double soudure, emballage carton renforcé..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              style={{ width: '100%', padding: '10px 12px', fontSize: '14px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            />
          </div>
        </div>

        {/* Bouton d'action principal */}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '14px',
            backgroundColor: loading ? '#93c5fd' : '#2563eb',
            color: '#fff',
            fontSize: '15px',
            fontWeight: 700,
            border: 'none',
            borderRadius: '6px',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s',
          }}
        >
          {loading ? 'Création et numérotation en cours...' : '🖨️ Valider & Imprimer la Fiche de Production A4'}
        </button>
      </form>

      {/* Tableau des derniers OF générés */}
      <div style={{ marginTop: '36px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#334155', marginBottom: '12px' }}>
          Derniers Ordres de Production émis
        </h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden', fontSize: '13px' }}>
          <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <tr>
              <th style={{ textAlign: 'left', padding: '10px 14px' }}>N° OP</th>
              <th style={{ textAlign: 'left', padding: '10px 14px' }}>Article</th>
              <th style={{ textAlign: 'center', padding: '10px 14px' }}>Qté Cible</th>
              <th style={{ textAlign: 'center', padding: '10px 14px' }}>Machine</th>
              <th style={{ textAlign: 'center', padding: '10px 14px' }}>Statut</th>
              <th style={{ textAlign: 'right', padding: '10px 14px' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {recentOfs.map((of) => (
              <tr key={of.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 700 }}>{of.numero_of}</td>
                <td style={{ padding: '10px 14px' }}>{of.produit_name || of.produit?.name || 'Article'}</td>
                <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600 }}>
                  {of.quantite_cible} {of.unite_abbreviation || of.unite?.abbreviation || 'U'}
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'center' }}>{of.poste_travail || 'S2'}</td>
                <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                  <span style={{ background: '#e2e8f0', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                    {of.statut}
                  </span>
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                  <button
                    onClick={() => handlePrint(of.id)}
                    style={{ background: '#0f172a', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                  >
                    🖨️ Fiche A4
                  </button>
                </td>
              </tr>
            ))}
            {recentOfs.length === 0 && (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>
                  Aucun ordre de fabrication enregistré pour le moment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}