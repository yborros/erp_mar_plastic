import React, { useState, useEffect } from 'react';
import './App.css';
import { ERP_MODULES } from './navigation/modulesConfig';
import PrintingModule from './modules/logistics/PrintingModule';
import StockModule from './modules/logistics/StockModule';
import BobineWeighingModule from './modules/logistics/BobineWeighingModule';

export default function App() {
  const [activeModuleId, setActiveModuleId] = useState(null);
  const [activeSubmenuId, setActiveSubmenuId] = useState(null);

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [clients, setClients] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [printers, setPrinters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);

  const urlParams = new URLSearchParams(window.location.search);
  const stationParam = urlParams.get('station');
  const isPowerUser = !stationParam;
  const API_BASE = `http://${window.location.hostname}:8000`;

  // Chargement global initial
  useEffect(() => {
    const fetchJson = (url) => fetch(url).then(r => r.ok ? r.json() : []).catch(() => []);

    Promise.all([
      fetchJson(`${API_BASE}/api/products/`),
      fetchJson(`${API_BASE}/api/categories/`),
      fetchJson(`${API_BASE}/api/clients/`),
      fetchJson(`${API_BASE}/api/templates/`),
      fetchJson(`${API_BASE}/api/printers/`)
    ]).then(([prodData, catData, cliData, tplData, printData]) => {
      const getList = (d) => Array.isArray(d) ? d : (d?.results || []);
      setProducts(getList(prodData));
      // CORRECTION : On conserve TOUTES les catégories (y compris les emballages is_printable: false)
      setCategories(getList(catData));
      setClients(getList(cliData));
      setTemplates(getList(tplData));
      setPrinters(getList(printData));
      setLoading(false);
    });
  }, []);

  const currentModule = ERP_MODULES.find(m => m.id === activeModuleId);
  const currentSubmenu = currentModule?.submenus.find(s => s.id === activeSubmenuId);

  const resetToHome = () => {
    setActiveModuleId(null);
    setActiveSubmenuId(null);
  };

  return (
    <div className="kiosk-container">
      {/* Toast de notification */}
      {notification && (
        <div style={{
          position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
          background: notification.type === 'success' ? '#27ae60' : '#e74c3c',
          color: '#fff', padding: '12px 24px', borderRadius: '8px', zIndex: 9999, fontWeight: 'bold'
        }}>
          {notification.message}
        </div>
      )}

      {/* Barre d'en-tête & Fil d'Ariane */}
      <header className="kiosk-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, cursor: 'pointer' }} onClick={resetToHome}>MAR PLASTIC ERP</h1>
          <nav style={{ marginTop: '4px', fontSize: '14px', color: 'rgba(255,255,255,0.8)' }}>
            <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={resetToHome}>Accueil</span>
            {currentModule && (
              <>
                <span> &gt; </span>
                <span 
                  style={{ cursor: currentSubmenu ? 'pointer' : 'default', textDecoration: currentSubmenu ? 'underline' : 'none' }}
                  onClick={() => setActiveSubmenuId(null)}
                >
                  {currentModule.icon} {currentModule.title}
                </span>
              </>
            )}
            {currentSubmenu && (
              <>
                <span> &gt; </span>
                <span style={{ fontWeight: 'bold', color: '#fff' }}>
                  {currentSubmenu.icon} {currentSubmenu.title}
                </span>
              </>
            )}
          </nav>
        </div>

        {activeModuleId && (
          <button
            onClick={resetToHome}
            style={{
              background: '#34495e',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.4)',
              padding: '8px 16px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            🏠 Accueil ERP
          </button>
        )}
      </header>

      {loading ? (
        <p style={{ textAlign: 'center', marginTop: '40px' }}>Chargement des données ERP...</p>
      ) : (
        <main style={{ padding: '20px 0' }}>
          {/* NIVEAU 0 : Menu principal */}
          {!currentModule && (
            <div style={{ maxWidth: '1000px', margin: '40px auto', padding: '0 20px' }}>
              <h2 style={{ textAlign: 'center', color: '#2c3e50', marginBottom: '8px' }}>
                SYSTÈME CENTRAL ERP
              </h2>
              <p style={{ textAlign: 'center', color: '#7f8c8d', marginBottom: '40px' }}>
                Sélectionnez un département de travail
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '25px' }}>
                {ERP_MODULES.map(mod => (
                  <div
                    key={mod.id}
                    onClick={() => setActiveModuleId(mod.id)}
                    style={{
                      background: '#fff',
                      borderRadius: '14px',
                      border: '2px solid #cbd5e1',
                      padding: '30px 20px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
                    }}
                  >
                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>{mod.icon}</div>
                    <h3 style={{ color: '#1e293b', margin: '0 0 8px 0' }}>{mod.title}</h3>
                    <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 20px 0' }}>{mod.description}</p>
                    <span style={{ display: 'inline-block', background: '#2563eb', color: '#fff', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px' }}>
                      {mod.submenus.length} sous-menus &rarr;
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* NIVEAU 1 : Sous-menu du département choisi */}
          {currentModule && !currentSubmenu && (
            <div style={{ maxWidth: '1000px', margin: '40px auto', padding: '0 20px' }}>
              <h2 style={{ textAlign: 'center', color: '#2c3e50', marginBottom: '8px' }}>
                {currentModule.icon} {currentModule.title}
              </h2>
              <p style={{ textAlign: 'center', color: '#7f8c8d', marginBottom: '40px' }}>
                Sélectionnez l'application à ouvrir
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '25px' }}>
                {currentModule.submenus.map(sub => (
                  <div
                    key={sub.id}
                    onClick={() => setActiveSubmenuId(sub.id)}
                    style={{
                      background: '#fff',
                      borderRadius: '14px',
                      border: '2px solid #2563eb',
                      padding: '30px 20px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(37,99,235,0.08)'
                    }}
                  >
                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>{sub.icon}</div>
                    <h3 style={{ color: '#2563eb', margin: '0 0 8px 0' }}>{sub.title}</h3>
                    <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 20px 0' }}>{sub.description}</p>
                    <span style={{ display: 'inline-block', background: '#2563eb', color: '#fff', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px' }}>
                      Ouvrir l'application &rarr;
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* NIVEAU 2 : Sous-module actif */}
          {activeModuleId === 'logistique' && activeSubmenuId === 'etiquetage' && (
            <PrintingModule
              products={products}
              categories={categories}
              clients={clients}
              templates={templates}
              printers={printers}
              isPowerUser={isPowerUser}
              stationParam={stationParam}
              apiBase={API_BASE}
              setNotification={setNotification}
            />
          )}

          {activeModuleId === 'logistique' && activeSubmenuId === 'stocks' && (
            <StockModule
              apiBase={API_BASE}
              setNotification={setNotification}
            />
          )}

          {activeModuleId === 'logistique' && activeSubmenuId === 'pesee_bobine' && (
            <BobineWeighingModule
              categories={categories}
              clients={clients}
              templates={templates}
              printers={printers}
              isPowerUser={isPowerUser}
              stationParam={stationParam}
              apiBase={API_BASE}
              setNotification={setNotification}
            />
          )}

          {activeModuleId === 'production' && activeSubmenuId === 'of' && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <h2>📋 Ordres de Fabrication</h2>
              <p>Module des fiches suiveuses A4.</p>
            </div>
          )}
        </main>
      )}
    </div>
  );
}