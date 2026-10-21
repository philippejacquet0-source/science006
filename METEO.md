# Eau atmosphérique, pluie et événements radiologiques

La carte peut superposer aux balises l'eau précipitable (vapeur intégrée sur
toute la colonne, kg/m²), les précipitations (pluie et neige en équivalent eau,
mm sur une heure) et le vent à 850 hPa. L'eau précipitable n'est pas le contenu
en eau liquide des nuages de la couche CELT de Nullschool : un lien daté permet
d'examiner cette dernière séparément. Aucune donnée de particules ni carte
d'exhalation n'est requise par cette version.

## Données réellement utilisées

NOAA GFS, modèle `gfs_global`, distribué par Open-Meteo sous CC BY 4.0 :

- [Archive de prévisions assemblées](https://open-meteo.com/en/docs/historical-forecast-api).
- [Calculs individuels datés](https://open-meteo.com/en/docs/single-runs-api).

Les valeurs sont échantillonnées tous les 2° entre 34 et 66° N et entre 16° O
et 36° E (459 positions). Les cellules affichées représentent cet
échantillonnage, **pas la résolution native de GFS**, ni un relevé local de
pluie. Aucune interpolation spatiale supplémentaire n'est effectuée par
Bouffi. Le fournisseur peut interpoler les sorties de son modèle.

Deux reconstitutions couvrent les collectes radio des 2–9 et 13–20 octobre
2026. Trois calculs individuels sont initialisés les 6, 16 et 19 octobre à
00 UTC. Leurs dates de validité, la date de récupération, la source, les unités
et le caractère rétrospectif/prévision sont conservés dans chaque fichier.
Les données sont servies avec le site ; consulter une collecte ne déclenche
pas de requête météo vers un tiers.

`python3 tools/prepare-weather.py` reconstruit les fichiers. Le téléchargement
est séquentiel, limité et reprend les lots déjà présents dans le cache local.
Il ne transmet aucune observation radiologique. Les dates des campagnes et
des runs sont explicites ; aucun renouvellement automatique n'est installé.

## Calage temporel

Toutes les heures sont en UTC. Une case radio Bouffi correspond à [t,t+1 h).
Open-Meteo fournit à t+1 h la pluie de l'heure précédente : le préparateur
prend donc cet indice pour la case t. Les champs de vapeur et de vent restent
ceux de t. Un décalage +6 h conserve les balises à t et affiche la météo à
t+6 h, avec deux horodatages visibles. Les données absentes restent absentes.

L'archive assemble les premières échéances de calculs successifs : parcourir
ses heures suivantes est une **reconstitution**, et non une prévision émise
à l'instant étudié. Seuls les fichiers d'un run individuel portent la mention
prévision. Le run est initialisé avant le repère radio, avec une garde de
6 heures pour tenir compte du calcul et de sa distribution. L'heure exacte
de publication n'étant pas archivée, cette garde ne prouve pas que le calcul
était déjà disponible : cette version n'est pas un rejeu opérationnel en
aveugle. Les clusters radio sont eux-mêmes détectés a posteriori sur la
collecte complète, notamment avec leur critère de persistance.

## Association et suivi expérimental

À l'heure radio, les cellules recevant au moins 0,2 mm sur l'heure sont
regroupées par voisinage à quatre côtés. Les structures candidates sont
classées par nombre de cellules instrumentées distinctes contenant des
balises actives, puis par nombre de balises actives. Ce classement évite de
privilégier uniquement un site très densément instrumenté. Un clic sur la
carte permet de choisir une autre structure pluvieuse ; Association
automatique restaure le classement.

Le contour associe des cellules météo, jamais une surface contaminée. Il
indique une coïncidence spatiale, sans démontrer une origine ni un mécanisme
commun. Il ne dépend pas des balises futures pour prolonger la structure.

Pour chaque heure suivante, le suivi retient les objets pluvieux qui touchent
la structure précédente ou une de ses cellules voisines (diagonales incluses).
Les branches peuvent se séparer et fusionner. Les liens cessent après une
heure absente ou lorsqu'aucun objet admissible n'existe. La tolérance d'une
cellule par heure est grossière à 2° ; elle peut créer des associations
fortuites. Les objets météo se forment et disparaissent : le suivi ne constitue
pas une trajectoire matérielle de l'eau, des aérosols ou du radon.

Aucune activité en radon ou dose future n'est inférée. Il n'existe encore ni
probabilité calibrée de pic, ni estimation validée d'heure d'activation. Les
prévisions affichées sont celles de la météorologie ; les balises restent des
mesures. Le GIF inclut les couches activées, leur décalage et leur provenance ;
il signale une météo absente ou un run trop récent au lieu de l'inventer.

## Fichier d'import

Le bouton Importer une météo accepte du JSON ou du JSON gzip au format
`bouffi-weather-v1`. Voir les fichiers préparés et `weather-engine.mjs` :
`source.kind` vaut `archive` ou `forecast`, `source.runInitializedAt` est
obligatoire pour une prévision, `grid` contient `lats`, `lons` et `step`.
Chaque frame possède une heure UTC explicite et quatre tableaux de taille
latitudes × longitudes, ordre latitude croissante puis longitude croissante :
`water`, `rain`, `u850`, `v850`. Une lacune est `null`, jamais zéro. Les unités
sont respectivement kg/m², mm, m/s et m/s ; `precipitationInterval` doit valoir
`[time,time+1h)`. Un import invalide conserve les données précédentes.

## Suite proposée

Affiner la grille, distinguer les branches persistantes, intégrer des
précipitations observées, puis comparer les prochaines activations des
balises aux échéances réellement disponibles. Le test devra masquer les
données radio futures, inclure les balises et pluies sans pic et comparer le
résultat à une simple persistance. La carte d'exhalation peut rester absente ;
la variabilité radiologique manquante devra alors être estimée depuis le réseau.
