# Bouffi — science006

Application statique d'exploration des variations du débit de dose gamma et de leur évolution territoriale. La page est publiée sur https://philippejacquet0-source.github.io/science006/.

## Recherche des événements

Toutes les balises sont examinées. Les variations persistantes par rapport à une référence locale forment des zones simultanées ; leurs liaisons entre heures constituent des clusters, avec séparations et fusions. Aucune forme de pic et aucune balise de départ ne sont imposées. Le classement et la sélection décrivent les mesures ; ils ne déterminent pas une origine physique.

Réglages initiaux demandés :

| Paramètre | Valeur |
|---|---:|
| Sensibilité | Faible : z = 6, excès minimal = 10 nSv/h |
| Déplacement territorial minimal | 1 000 km |
| Balises simultanées minimales par zone | 10 |
| Distance entre balises voisines | 150 km |
| Tolérance de liaison entre deux heures | 100 km |
| Durée minimale de progression | 5 cases horaires |

Les autres critères et leurs limites sont décrits dans [CLUSTERS.md](CLUSTERS.md). Lecture anime les zones ; le graphe montre leurs branches. Rechercher d'autres événements recalcule l'ensemble du réseau avec les nouveaux seuils. Filtrer par pays ou balise agit sur la liste des résultats. Afficher une balise ouvre sa courbe et, s'il est retenu, le cluster auquel elle appartient.

La page privilégie la carte et sa chronologie. Les volets **Données et collecte**, **Zones et branches** et **Mesures des balises** s'ouvrent à la demande. Un clic sur une balise de la carte ouvre ses mesures.

La vitesse normale de lecture correspond à l'ancien ×5 : une case horaire toutes les 140 ms. Le bouton **Générer le GIF**, visible près de la carte, lance directement la création de l'animation de trois secondes, avec aperçu et téléchargement. Les données JSON restent accessibles dans **Mesures des balises** et dans la fenêtre du GIF. Le GIF cadre l'Europe indépendamment de la carte interactive, affiche le réseau complet, les zones et liaisons du cluster, les dates UTC, les critères et une courbe d'activité. Un repère mondial conserve les sites hors Europe. Il utilise le fond Natural Earth 1:50m embarqué (pays, limites régionales, lacs, cours d'eau, villes), sans tuiles distantes. Jusqu'à 60 images sont conservées ; au-delà, des instants horaires régulièrement espacés sont sélectionnés, sans interpolation, en conservant le début et la fin. La durée encodée est exactement 3 000 ms, en boucle. La génération est annulable et reste dans le navigateur.

## Jeux de données en ligne

Deux collectes réalisées par l'utilisateur dans sa session REMAP, après passage manuel du CAPTCHA, sont proposées :

| Période UTC | Balises | Observations | Couverture horaire | Lots absents |
|---|---:|---:|---:|---:|
| 13 octobre 2026 à 00 h → 20 octobre à 11:53:33 | 5 955 | 966 761 | 90,2 % | 0 |
| 2 octobre 2026 à 00 h → 9 octobre à 19:24:21 | 5 981 | 1 021 060 | 90,8 % | 6 |

Le jeu le plus récent est chargé par défaut. La dernière heure de chaque période est partielle. Les coordonnées et les valeurs proviennent du traitement observé dans le client REMAP ; aucun facteur de décodage n'est conjecturé.

`data/catalogue.json` décrit les jeux disponibles et leurs fichiers. Le jeu du 2–9 octobre conserve `data/meta.json` et `data/values.bin`. Celui du 13–20 octobre est dans `data/collections/2026-10-13_2026-10-20/`, avec une archive ZIP des lots et du manifeste final. Chaque `values.bin` est une matrice Float64, ordre balise puis heure ; les lacunes sont des NaN. Le protocole documente la référence, les seuils, les routes territoriales et les limites.

Avec ces réglages, le jeu du 13–20 octobre produit 202 zones horaires et 11 ensembles temporels, dont deux satisfont le filtre de déplacement. Le classement initial est décroissant selon le déplacement net : cluster 2, environ 2 058 km (474 balises, 6 pays), puis cluster 1, environ 1 498 km (974 balises, 11 pays). Le cluster 2 est sélectionné à l'ouverture. Ces résultats dépendent des seuils et ne constituent pas une attribution physique.

## Collecte et hébergement

GitHub Pages héberge la page et l'instantané déjà préparé. GitHub Actions vérifie les fichiers puis publie le site ; il ne contacte pas REMAP et ne collecte aucune mesure. Toute nouvelle collecte reste effectuée par l'utilisateur dans son navigateur avec passage manuel du CAPTCHA, puis normalisée localement.

La page propose un accès direct à [REMAP](https://remap.jrc.ec.europa.eu/) et au [collecteur réseau avec reprise](tools/collecte-remap.html). Le favori est lancé par l'utilisateur dans sa carte REMAP, après passage manuel du CAPTCHA. Il enregistre les lots dans un dossier choisi. Le choix **Dossier sur cet ordinateur**, puis **Importer un dossier local**, charge cette campagne sans transmettre les fichiers. Le dossier doit contenir `manifest.json` et ses lots. Le bilan distingue les lots absents et invalides ; une annulation ou un import refusé conserve les données précédentes. Pour les collectes hébergées, choisir **Jeux de données en ligne**, la période, puis **Charger ce jeu**. Un changement validé réinitialise le filtre et les balises affichées, tout en conservant les critères de recherche. Voir [IMPORT.md](IMPORT.md) pour les formats et limites. La page de collecte peut être régénérée avec `node tools/build-collector-page.mjs`.

L'[ancien outil de capture passive](tools/index.html) reste disponible, avec ses limites expérimentales. Les anciens modules `src/` et leurs tests sont conservés ; la page actuelle utilise `app.mjs`, `cluster-engine.mjs` et `worker.mjs`.

Les calculs sont effectués dans le navigateur, dans un Web Worker. Le fond simplifié Natural Earth et Leaflet sont fournis avec la page. Fond détaillé charge facultativement les tuiles visibles OpenStreetMap. Les observations ne sont pas transmises au fournisseur du fond. La qualité instrumentale, la météorologie et la cause des variations ne sont pas validées par cet outil.

## Lancer et vérifier

Avec Node.js 24 pour les tests et Python 3 pour servir les fichiers :

```sh
npm test
python3 -m http.server 4173 --bind 127.0.0.1
```

Ouvrir http://127.0.0.1:4173/. Les modules nécessitent HTTP(S), pas `file://`. Aucune installation npm n'est nécessaire. Les tests incluent les séparations/fusions, les zones stationnaires, les lacunes, la progression entre balises distinctes et une vérification sur l'instantané réel avec FR1191.

La publication utilise `.github/workflows/pages.yml` sur la branche `main`. Les fichiers collectés bruts, les pièces jointes et les chemins locaux ne sont pas inclus dans le site.
