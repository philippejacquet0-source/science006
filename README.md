# Rémanence

Une application **statique**, en HTML/CSS/JavaScript, pour explorer localement les écarts du débit de dose gamma en Europe. Sans serveur applicatif, dépendance JavaScript, collecte centralisée ou transfert des mesures importées. Les seuls accès réseau du site sont ses propres fichiers et le fond géographique local. Le lien REMAP ouvre un onglet distinct.

## Ce que cette version permet

- Carte de balises, zoom, déplacement et sélection au clavier.
- Frise horaire, animation et histogramme des balises en écart.
- Référence locale robuste, persistance et regroupement géographique paramétrables.
- Liste d’épisodes, succession des centres des groupes et courbes détaillées.
- Import CSV/JSON, diagnostic des captures REMAP et import des états client dont les identifiants et coordonnées sont exploitables ; export des mesures normalisées avec les paramètres d’analyse.
- Capture passive des réponses réseau et observation des objets JSON après les callbacks du client jQuery, dans une session REMAP ouverte manuellement.

Le premier écran utilise **96 balises fictives et des mesures synthétiques** entre le 22 septembre et le 9 octobre 2026. La fenêtre analysée commence le 6 octobre. Il illustre un scénario Bretagne → Finlande ; il ne confirme aucune observation réelle. Une pointe brève et des données manquantes sont incluses. Les noms et coordonnées du réseau de démonstration ne sont pas ceux des balises EURDEP.

## Lancer et tester

Node.js 24 pour les tests ; Python 3 pour servir les fichiers. Aucune installation npm nécessaire.

```sh
cd /workspace/science006
npm test
python3 -m http.server 4173 --bind 0.0.0.0
```

Ouvrir le serveur dans un navigateur ; les modules et le Web Worker nécessitent HTTP(S), pas une ouverture directe en `file://`. L’analyse est exécutée dans un Web Worker lorsque disponible. Les données restent en mémoire de l’onglet ; les exporter avant de fermer pour les conserver. Aucun stockage automatique ni analyse en arrière-plan après fermeture.

## Import CSV

En-tête minimal :

```csv
station_id,station_name,latitude,longitude,timestamp,value,unit
FR-A,Exemple A,48.4,-4.5,2026-10-05T00:00:00Z,100,nSv/h
```

`station_name` et `country` sont facultatifs. Virgule, point-virgule ou tabulation ; champs entre guillemets pris en charge. Les nombres à virgule sont acceptés avec un séparateur point-virgule. L’horodatage doit indiquer explicitement son fuseau (`Z` ou un décalage). Les µSv/h et μSv/h sont convertis en nSv/h. Unités absentes ou inconnues, coordonnées contradictoires et doublons ayant des valeurs différentes sont refusés. Les doublons identiques sont retirés.

[Télécharger l’exemple](data/exemple.csv) : trois balises fictives, un historique et un épisode, avec des noms contenant une virgule. Les captures réseau brutes REMAP peuvent être encodées ; elles sont diagnostiquées sans tracer leurs valeurs. Voir la section REMAP.

## Import JSON

```json
{
  "schema": "remanence-v1",
  "name": "Mes séries",
  "unit": "nSv/h",
  "stations": [{"id": "FR-A", "name": "Exemple A", "lat": 48.4, "lon": -4.5}],
  "observations": [{"stationId": "FR-A", "time": "2026-10-05T00:00:00Z", "value": 100}]
}
```

Une unité peut être fournie pour chaque observation au lieu de l’unité globale. Les exports Rémanence conservent le marqueur `synthetic` pour que les données de démonstration restent identifiées après réimport. `analysisSettings` dans l’export documente les paramètres ; l’import initialise une nouvelle fenêtre, ajustable dans les réglages.

Limites du prototype : 20 Mo, 250 000 mesures, 6 000 balises et 120 jours par session. Pour un historique paneuropéen complet, importer un sous-ensemble régional ; la capacité à traiter plusieurs millions de mesures n’est pas validée.

## Méthode de détection

Les observations sont regroupées par heure UTC. En présence de plusieurs mesures dans une heure, la valeur est leur moyenne arithmétique ; aucun point n’est interpolé.

1. Pour chaque balise, sélectionner jusqu’à 14 jours **avant** le début de l’analyse. Exiger au moins 24 heures contenant une mesure.
2. Référence = médiane de ces moyennes horaires. Variabilité = maximum de `1,4826 × MAD` et d’un plancher configurable (par défaut 1,5 nSv/h).
3. Score = `(mesure − référence) / variabilité`. Retenir les scores strictement supérieurs à 4 pendant au moins deux heures consécutives. Les données absentes interrompent la séquence. La référence reste figée pendant l’analyse.
4. Chaque heure, relier les balises en écart séparées de 180 km ou moins ; retenir les composantes connexes de trois balises ou plus. Une composante peut s’étendre au-delà de 180 km par chaînage.
5. Associer les groupes entre deux heures consécutives par balises communes, puis par centres proches (au plus 100 km, et jamais au-delà du réglage de proximité). Les associations sont une heuristique, pas une preuve de transport. Les fusions/séparations sont traitées par correspondance un-à-un ; une branche séparée devient un nouvel épisode. Une heure sans groupe interrompt l’épisode.

Les intervalles horaires détectés sont analysés rétrospectivement : le début d’un écart est marqué une fois sa persistance connue. Le score robuste n’est ni un niveau de confiance ni une probabilité. Les seuils ne sont pas calibrés sur des observations réelles. La courbe et les données manquantes restent visibles même si une référence est insuffisante.

Les unités de la carte REMAP sont confirmées par son aide : moyennes horaires en nSv/h, horodatages UTC, historique de 35 jours. Une hausse de ces mesures ne permet pas à elle seule d’attribuer un radionucléide, une origine ou une trajectoire physique.

## Tester une récupération depuis REMAP

[L’outil de capture](tools/index.html) installe un favori JavaScript autonome, sans charger de script depuis GitHub dans la page REMAP.

L’utilisateur ouvre REMAP, passe lui-même le CAPTCHA et les étapes d’accès, lance le favori, puis **sélectionne les balises, ouvre leurs courbes et règle la période**. La présence d’une balise sur la carte ne signifie pas que sa série est chargée. Seules les séries effectivement consultées peuvent être capturées ; un ensemble régional incomplet ne constitue pas une couverture paneuropéenne.

L’outil observe les futures réponses JSON de `fetch` et `XMLHttpRequest` et, quand jQuery est présent, les objets transmis à `ajaxSuccess` après les callbacks de l’application. La sérialisation est différée de 100 ms pour observer une éventuelle transformation en place. Il ne décode pas les nombres ou les chaînes lui-même ; une transformation produisant de nouveaux objets peut ne pas être observée.

Aucune requête supplémentaire n’est émise. Le fichier exporte les chemins des scripts et les noms des en-têtes de réponse, sans leurs valeurs, paramètres d’URL, cookies ni corps des requêtes. Il filtre les chemins d’authentification et certains champs sensibles. Les réponses antérieures à son activation, les WebSockets et les réponses non JSON ne sont pas collectées.

Le format reste `remap-capture-v1`, avec `toolVersion: 2`, des diagnostics `client` et un `stage` par réponse (`network` ou `application`). L’adaptateur reconnaît les listes `/mapSvc/api/timeseries/v1/stations/<début>/<fin>/area` et les tableaux `/mapSvc/api/timeseries/v1/stations/timeseries/<début>/<fin>`. Il associe les séries par `code`, convertit `date` en UTC et `long` en longitude. **Seuls les états `application` avec identifiants ASCII et coordonnées valides sont importés.** Les réponses réseau seules ne sont pas assimilées à des débits de dose décodés.

Une capture réelle fournie le 9 octobre 2026 contient 14 réponses : 6 listes de balises et 8 séries (400 points au total), dont deux séries de 186 points du 2 au 9 octobre. Les identifiants, noms et coordonnées y sont encodés ; ce fichier est correctement diagnostiqué, mais ses valeurs ne sont pas importées. Aucun déchiffrement conjectural ou facteur de conversion déduit de la plausibilité des valeurs n’est appliqué. Les captures de l’outil version 2 et leur transformation réelle restent à valider après le CAPTCHA. L’utilisateur utilise ses données dans le cadre des autorisations dont il dispose.

## Vérifications navigateur

Dans l’environnement de développement disposant de Playwright Python et Chromium, démarrer le serveur puis exécuter :

```sh
python3 tests/browser_smoke.py
python3 tests/capture_smoke.py
```

Le premier vérifie l’interface, les imports et l’affichage mobile. Le second utilise exclusivement des réponses et un client jQuery simulés ; il ne valide pas une récupération réelle après CAPTCHA.

## Publier sur GitHub Pages

Le workflow `.github/workflows/pages.yml` valide les tests, prépare les fichiers statiques et les publie lors d’un push sur `main` ou d’un lancement manuel. Il n’effectue aucune collecte REMAP.

Dans le dépôt GitHub, sélectionner **Settings → Pages → Source → GitHub Actions**, puis lancer le workflow. Tous les chemins du site sont relatifs pour fonctionner sous le sous-répertoire `science006`.

## Fond géographique

`data/europe.geojson` : extrait des pays européens et limitrophes de Natural Earth, résolution 1:110m, domaine public. Source : [natural-earth-vector](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson). Aucune tuile externe n’est demandée. Ces frontières simplifiées servent à l’exploration, pas à la précision géographique des mesures.
