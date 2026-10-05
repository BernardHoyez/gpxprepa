# GPXPREPA

PWA statique de préparation de randonnées.

## Fonctionnalités
- Import local GPX, KML et KMZ.
- Distance, dénivelé positif/négatif, altitude maximale.
- Estimation de durée tenant compte de la distance et du dénivelé.
- Détection des pentes fortes (≥15 %, ≥25 %).
- Estimation de difficulté.
- Waypoints et carte OpenStreetMap.
- Profil altimétrique.
- Résumé automatique.
- Rapport texte exportable.
- Analyse générative optionnelle via une API compatible OpenAI.
- Service worker `brise-cache.js`.

## Important
Une PWA statique ne doit pas contenir une clé API secrète. La clé saisie dans ⚙ IA est conservée uniquement dans le `localStorage` du navigateur. Pour un déploiement public, il est préférable d'utiliser un petit proxy/backend sécurisé.

## Limitation actuelle
La détection réelle des forêts, crêtes, vallées, villages et des POI géographiques nécessite une source cartographique. La prochaine version peut interroger OpenStreetMap/Overpass ou exploiter des données IGN locales. Si le fichier ne contient pas d'altitudes, le dénivelé et les pentes ne peuvent pas être calculés correctement.

## Déploiement
Copier le contenu du dossier sur GitHub Pages, Cloudflare Pages, Netlify ou tout serveur HTTPS statique.
