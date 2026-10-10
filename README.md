# Rémanence — science006

Application statique d'exploration des variations du débit de dose gamma et de leur évolution territoriale. La page est publiée sur https://philippejacquet0-source.github.io/science006/.

## Recherche des événements

Toutes les balises sont examinées. Les variations persistantes par rapport à une référence locale forment des zones simultanées ; leurs liaisons entre heures constituent des clusters, avec séparations et fusions. Aucune forme de pic et aucune balise de départ ne sont imposées. Le classement et la sélection décrivent les mesures ; ils ne déterminent pas une origine physique.

Réglages initiaux demandés :

| Paramètre | Valeur |
|---|---:|
| Sensibilité | Moyenne : z = 4, excès minimal = 5 nSv/h |
| Déplacement territorial minimal | 1 000 km |
| Balises simultanées minimales par zone | 4 |
| Distance entre balises voisines | 120 km |
| Tolérance de liaison entre deux heures | 40 km |
| Durée minimale de progression | 8 cases horaires |

Les autres critères et leurs limites sont décrits dans [CLUSTERS.md](CLUSTERS.md). Lecture anime les zones ; le graphe montre leurs branches. Rechercher d'autres événements recalcule l'ensemble du réseau avec les nouveaux seuils. Filtrer par pays ou balise agit sur la liste des résultats. Afficher une balise ouvre sa courbe et, s'il est retenu, le cluster auquel elle appartient.

## Instantané publié

Collecte réalisée par l'utilisateur dans sa session REMAP, après passage manuel du CAPTCHA : du 2 octobre 2026 à 00 h UTC au 9 octobre à 19:24:21 UTC. L'instantané contient 5 981 balises et 1 021 060 observations sources ; la couverture horaire est de 90,8 %. Six lots manquent et la dernière heure est partielle. Les coordonnées et les valeurs proviennent du traitement observé dans le client REMAP ; aucun facteur de décodage n'est conjecturé.

Les fichiers `data/meta.json` et `data/values.bin` contiennent les métadonnées et les moyennes horaires. `values.bin` est une matrice Float64, ordre balise puis heure ; les lacunes sont des NaN. Le protocole documente la référence, les seuils, les routes territoriales et les limites.

Avec les réglages initiaux, un cluster est retenu sur 57 ensembles constitués de 436 zones horaires. Il contient le passage de FR1191 : 2 747 balises dans 20 pays, jusqu'à 661 simultanément, et une route territoriale d'environ 1 044 km. Ces effectifs dépendent des seuils.

## Collecte et hébergement

GitHub Pages héberge la page et l'instantané déjà préparé. GitHub Actions vérifie les fichiers puis publie le site ; il ne contacte pas REMAP et ne collecte aucune mesure. Toute nouvelle collecte reste effectuée par l'utilisateur dans son navigateur avec passage manuel du CAPTCHA, puis normalisée localement.

L'[ancien outil de capture passive](tools/index.html) reste disponible, avec ses limites expérimentales. Il ne constitue pas le collecteur réseau utilisé pour l'instantané publié. Les anciens modules `src/` et leurs tests sont conservés ; la page actuelle utilise `app.mjs`, `cluster-engine.mjs` et `worker.mjs`.

Les calculs sont effectués dans le navigateur, dans un Web Worker. Le fond simplifié Natural Earth et Leaflet sont fournis avec la page. Fond détaillé charge facultativement les tuiles visibles OpenStreetMap. Les observations ne sont pas transmises au fournisseur du fond. La qualité instrumentale, la météorologie et la cause des variations ne sont pas validées par cet outil.

## Lancer et vérifier

Avec Node.js 24 pour les tests et Python 3 pour servir les fichiers :

```sh
npm test
python3 -m http.server 4173 --bind 127.0.0.1
```

Ouvrir http://127.0.0.1:4173/. Les modules nécessitent HTTP(S), pas `file://`. Aucune installation npm n'est nécessaire. Les tests incluent les séparations/fusions, les zones stationnaires, les lacunes, la progression entre balises distinctes et une vérification sur l'instantané réel avec FR1191.

La publication utilise `.github/workflows/pages.yml` sur la branche `main`. Les fichiers collectés bruts, les pièces jointes et les chemins locaux ne sont pas inclus dans le site.
