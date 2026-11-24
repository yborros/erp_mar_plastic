// src/navigation/modulesConfig.js

export const ERP_MODULES = [
  {
    id: 'logistique',
    title: 'Logistique & Expéditions',
    icon: '📦',
    description: 'Étiquetage Zebra, traçabilité des colis et consommables',
    submenus: [
      {
        id: 'etiquetage',
        title: 'Étiquetage & Impression',
        icon: '🏷️',
        description: 'Poste d\'impression directe Zebra (bobines, sachets, cartons)'
      },
      {
        id: 'stocks',
        title: 'Stocks & Consommables',
        icon: '📊',
        description: 'Gestion des emballages, cartons, mandrins et adhésifs'
      },
      {
        id: 'pesee_bobine',
        title: 'Pesée & Bobines',
        icon: '⚖️',
        description: 'Poste direct de pesée balance et étiquetage bobines'
      },
    ]
  },
  {
    id: 'production',
    title: 'Gestion de Production',
    icon: '⚙️',
    description: 'Ordres de fabrication et suivi atelier',
    submenus: [
      {
        id: 'of',
        title: 'Ordres de Fabrication (OF)',
        icon: '📋',
        description: 'Émission et impression des fiches suiveuses A4'
      }
    ]
  }
];