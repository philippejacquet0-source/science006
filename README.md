# Rémanence

Une application **statique**, en HTML/CSS/JavaScript, pour explorer localement les écarts du débit de dose gamma en Europe. Sans serveur applicatif, dépendance JavaScript, collecte centralisée ou transfert des mesures importées. Les seuls accès réseau du site sont ses propres fichiers et le fond géographique local. Le lien REMAP ouvre un onglet distinct.

## Ce que cette version permet

- Carte de balises, zoom, déplacement et sélection au clavier.
- Frise horaire, animation et histogramme des balises en écart.
- Référence locale robuste, persistance et regroupement géographique paramétrables.
- Liste d’épisodes, succession des centres des groupes et courbes détaillées.
- Import CSV/JSON et export des mesures normalisées avec les paramètres d’analyse.
- Outil expérimental de capture des nouvelles réponses JSON dans une session REMAP ouverte manuellement.

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

[Télécharger l’exemple](data/exemple.csv) : trois balises fictives, un historique et un épisode, avec des noms contenant une virgule. Les captures réseau brutes REMAP ne sont pas des CSV de mesures et ne doivent pas être présentées comme des imports fonctionnels.

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

L’utilisateur ouvre REMAP, passe lui-même le CAPTCHA et les étapes d’accès, lance le favori, puis ouvre des courbes ou actualise la carte. L’outil observe les futures réponses JSON de `fetch` et `XMLHttpRequest` dans l’onglet courant ; il n’émet pas de nouvelles requêtes et ne récupère pas de cookies ou d’en-têtes. Il filtre les chemins d’authentification, supprime les paramètres d’URL et certains champs sensibles. Il n’est pas un collecteur universel et ne lit pas les réponses antérieures à son activation, les WebSockets ou les réponses non JSON.

La capture `remap-capture-v1` est un échantillon technique pour développer l’adaptateur. **Aucun import automatique de la structure réelle REMAP n’est actuellement revendiqué.** Le parcours après CAPTCHA n’a pas été validé sur des mesures réelles. L’utilisateur utilise ses données dans le cadre des autorisations dont il dispose.

## Publier sur GitHub Pages

Le workflow `.github/workflows/pages.yml` valide les tests, prépare les fichiers statiques et les publie lors d’un push sur `main` ou d’un lancement manuel. Il n’effectue aucune collecte REMAP.

Dans le dépôt GitHub, sélectionner **Settings → Pages → Source → GitHub Actions**, puis lancer le workflow. Tous les chemins du site sont relatifs pour fonctionner sous le sous-répertoire `science006`.

## Fond géographique

`data/europe.geojson` : extrait des pays européens et limitrophes de Natural Earth, résolution 1:110m, domaine public. Source : [natural-earth-vector](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson). Aucune tuile externe n’est demandée. Ces frontières simplifiées servent à l’exploration, pas à la précision géographique des mesures.
