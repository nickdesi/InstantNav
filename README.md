# InstantNav

⚡ Extension Brave pour une navigation web quasi-instantanée grâce à la prédiction intelligente des clics.

## 🚀 Fonctionnalités

- **Prédiction intelligente** : Analyse le mouvement du curseur pour anticiper vos clics
- **Loi de Fitts** : Scoring basé sur la taille et la distance des liens
- **Speculation Rules API** : Prerendering natif Chrome/Brave pour des pages instantanées
- **Mode adaptatif** : S'adapte automatiquement à la batterie, réseau et RAM
- **Visual Feedback** : Highlight subtil des liens en préchargement (optionnel)
- **Respect de la vie privée** : Tout l'apprentissage reste local sur votre appareil

## 📦 Installation

### Développement

```bash
# Cloner le repo
git clone https://github.com/nickdesi/InstantNav.git
cd instantnav

# Installer les dépendances
npm install

# Lancer en mode développement
npm run dev
```

### Charger dans Brave

1. Ouvrir `brave://extensions`
2. Activer "Mode développeur"
3. Cliquer "Charger l'extension non empaquetée"
4. Sélectionner le dossier `dist/`

## 🛠️ Architecture

```
src/
├── background/          # Service Worker
│   ├── service-worker.js
│   ├── prefetcher.js    # Speculation Rules API
│   └── context-manager.js
├── content/             # Scripts injectés
│   ├── tracker.js       # Suivi curseur 60fps
│   ├── predictor.js     # Scoring Fitts + intention
│   └── visual-feedback.js
├── popup/               # Interface popup
├── dashboard/           # Stats et graphiques
├── storage/             # IndexedDB learning
└── utils/               # Trust list
```

## 🎯 Comment ça marche

1. **Tracking** : Le curseur est suivi à 60fps
2. **Scoring** : Chaque lien visible reçoit un score 0-100 basé sur :
   - Loi de Fitts inversée (30%)
   - Vecteur d'intention (30%)
   - Proximité (15%)
   - Historique (15%)
   - Contexte page (10%)
3. **Prefetching** : Selon le score :
   - 30-50 → DNS Prefetch
   - 50-70 → Preconnect
   - 70-85 → Prefetch HTML
   - 85-100 → Prerender complet
4. **Affichage** : La page s'affiche en <50ms au lieu de 1-3 secondes

## 🔒 Vie privée

- Aucune donnée envoyée à l'extérieur
- Apprentissage 100% local (IndexedDB)
- Données automatiquement supprimées après 30 jours
- Sites "untrusted" : seulement DNS prefetch

## 📄 Licence

MIT
