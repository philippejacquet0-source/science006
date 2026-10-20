# Clusters de zones en variation et en déplacement

La recherche examine toutes les balises de l'instantané local. FR1191 n'est ni une balise de départ de l'algorithme ni une condition d'identification ; elle sert à vérifier que le passage observé appartient à un événement plus large. Aucune corrélation de courbes, forme de pic ou sélection d'un maximum individuel n'intervient dans la construction des clusters.

## Résultat sur le jeu du 2–9 octobre 2026

La configuration historique (sensibilité moyenne, voisinage 120 km, au moins 4 balises, liaison 40 km et progression 8 h) identifie 436 zones horaires, reliées en 57 ensembles temporels. Un ensemble satisfait les critères de déplacement. Le cluster 1 contient la variation de FR1191 le 7 octobre à 10 h UTC : il rassemble 2 747 balises dans 20 pays, avec au plus 661 balises simultanément retenues, du 6 octobre à 13 h au 9 octobre à 19 h UTC (79 cases horaires, dont la dernière partielle). Sa structure comporte 19 nœuds de séparation et 23 nœuds de fusion. Ces nombres décrivent la détection, et non un nombre établi de processus physiques. Les réglages par défaut ont été modifiés le 20 octobre ; les résultats historiques ci-dessus restent associés à leur configuration.

Une route de nouveaux territoires activés va de 48,36° N, 4,76° O le 6 octobre à 13 h à 47,03° N, 9,07° E le 8 octobre à 09 h UTC. Son déplacement net est d'environ 1 044 km, pour une route d'environ 1 217 km. Elle appartient à l'ascendance temporelle des zones du cluster. Elle n'est pas une trajectoire mesurée de transport.

## 1. Variations aux balises

Les observations locales sont regroupées en moyennes horaires, sans interpolation. Pour chaque balise, la référence est la médiane des 72 premières heures, avec au moins 48 heures mesurées. L'échelle de variabilité est le maximum de 1,4826 × MAD et de 1,5 nSv/h. Une heure est active si son excès positif dépasse z fois cette échelle et atteint le minimum absolu. Seules les suites d'au moins deux heures actives sont retenues ; une lacune les interrompt.

La commande Sensibilité choisit des critères descriptifs :

| Sensibilité | Score robuste z | Excès absolu minimal |
|---|---:|---:|
| Haute | 3 | 3 nSv/h |
| Moyenne | 4 | 5 nSv/h |
| Faible, initiale | 6 | 10 nSv/h |

Ce score n'est pas une probabilité, et ces seuils ne sont pas des tests de significativité. La référence courte, les dépendances temporelles et la recherche multiple limitent l'interprétation. Au réglage initial, l'excès doit atteindre au moins 10 nSv/h et dépasser six fois l'échelle de variabilité.

## 2. Zones simultanées

À chaque heure, les balises actives sont reliées par une distance géodésique de voisinage de 150 km, réglable. Une composante contenant au moins dix balises forme une zone. Cette distance est celle entre voisines, et non le rayon total de la zone : le chaînage peut produire une zone étendue.

Les contours affichés sont des enveloppes convexes des balises actives. Ils peuvent englober des régions sans mesure. Une zone ne représente donc ni un champ interpolé de valeurs ni une surface contaminée. Les observations instrumentales restent accessibles séparément.

## 3. Liaisons d'une heure à la suivante

Chaque emprise est résumée par des cellules approximatives de 50 km afin de limiter la domination des sites avec de nombreuses balises rapprochées. Le maillage utilise les latitudes et les longitudes converties approximativement en kilomètres ; les distances de liaison sont géodésiques. Les points des cellules sont les médianes des coordonnées instrumentées.

Une cellule est proche de la zone suivante si au moins une cellule suivante se trouve à 100 km ou moins, tolérance réglable. Le lien requiert la proximité d'au moins 60 % des cellules d'au moins une des deux emprises. Si les zones ne partagent pas au moins deux balises, il requiert aussi au moins 20 % de l'autre emprise. Un bord isolé de deux grandes zones ne suffit donc pas à les réunir. Une emprise compacte peut néanmoins être liée à une partie d'une emprise plus grande, afin d'autoriser séparations et fusions.

Les liens sont orientés vers l'heure suivante. Un nœud avec plusieurs descendants décrit une séparation ; un nœud avec plusieurs parents décrit une fusion. Tous les nœuds d'une même composante temporelle conservent le même identifiant de cluster. Aucun lien ne franchit une heure entièrement absente de la chaîne ; aucune zone n'est interpolée.

Ces règles ne garantissent pas une origine commune. Des variations indépendantes voisines peuvent être fusionnées ; le choix des seuils peut aussi créer des branches artificielles. La carte et le graphe des branches rendent ces liaisons vérifiables. Dans le graphe, la position verticale organise les zones d'une même heure selon leur longitude ; elle ne représente pas une distance.

## 4. Déplacement territorial cohérent

Une grande emprise simultanée n'est pas assimilée à une migration. Pour chaque cluster, on conserve l'heure de première activation de chaque cellule instrumentée pendant l'événement. Deux nouveaux territoires peuvent être reliés dans une route si :

- leurs heures d'activation sont strictement croissantes, séparées de 1 à 6 heures ;
- leur distance ne dépasse pas la tolérance de déplacement par heure multipliée par le délai ;
- la zone du second territoire descend de la zone du premier dans le graphe temporel.

On examine les routes de ce graphe acyclique. Pour chaque origine, le chemin de plus faible longueur géodésique vers chaque arrivée est utilisé. La cohérence est le rapport entre distance directe des extrémités et somme des distances des étapes. Une route admissible doit comporter au moins trois territoires activés à des heures différentes, durer au moins cinq heures (nombre de cases inclusives), avec une cohérence d'au moins 0,55. Deux points seuls ne suffisent pas à qualifier une progression cohérente. Parmi ces routes, la plus grande distance nette est retenue pour filtrer le cluster ; cette distance doit atteindre 1 000 km au réglage initial. Le seuil de distance et la durée sont réglables. Un chemin plus long contenant davantage d'étapes n'est pas examiné si le plus court est trop peu documenté ; certains événements peuvent ainsi être manqués.

Les activations simultanées d'un territoire stationnaire ne peuvent pas produire une telle route. Cette mesure évite aussi de prendre les sauts du barycentre lors d'une séparation ou d'une fusion pour un déplacement. Elle peut cependant associer des recrutements successifs de territoires causés par des processus distincts. La première activation ne décrit pas un second passage dans une cellule déjà active ; les routes ne résument donc pas toute la dynamique d'un événement.

La tolérance de liaison est un paramètre de recherche, pas une vitesse physique estimée. Les routes sautent parfois plusieurs cases horaires entre les nouveaux territoires ; leur ascendance dans les zones, elle, reste continue. Aucun déplacement entre leurs points n'est représenté comme une mesure interpolée.

## 5. Lecture et recherche

La liste présente tous les clusters satisfaisant les critères, classés initialement par déplacement net décroissant. Le premier de ce classement est sélectionné à l'ouverture et après recalcul. Le classement par activité totale reste disponible : il utilise la somme des nombres de balises actives aux heures retenues. Ces classements ne qualifient ni une gravité ni une importance radiologique. Une recherche par pays, balise ou identifiant filtre la liste d'événements déjà calculés ; elle ne change pas l'identification globale.

Lecture parcourt les zones horaires et leurs branches. Début revient à la première heure de l'événement. Le graphe montre les séparations et fusions ; cliquer sur une zone affiche son heure sur la carte. Une recherche de balise dans le panneau des mesures ouvre son cluster retenu, s'il existe, et affiche son maximum mesuré dans les heures où elle participe aux zones. Cet outil de navigation n'impose aucun pic à la recherche globale.

Le dialogue Rechercher d'autres événements propose trois commandes principales : sensibilité, déplacement minimal et soutien instrumental minimal. Les réglages complémentaires modifient le voisinage, la tolérance de déplacement et la durée. À chaque recalcul, toutes les balises sont examinées. L'export conserve les réglages, les zones et leurs liens, la route de nouveaux territoires et les mesures des balises du cluster.

Le bouton **Exporter le cluster** donne accès aux données JSON et à un **GIF animé de trois secondes**, généré dans le navigateur. Le GIF affiche une vue européenne fixe pendant l'événement, le réseau entier en gris, les sites du cluster en vert, les zones actives en orange et les liaisons temporelles. Les sites hors du cadre européen figurent aussi dans un repère mondial. La chronologie UTC et son curseur suivent les moyennes horaires, sans déplacement interpolé ; la courbe indique le nombre de balises actives, avec l'excès médian à l'instant représenté. Les critères, l'effectif, les séparations, les fusions et le déplacement net restent visibles.

Toutes les cases sont représentées jusqu'à 60 images. Pour un événement plus long, 60 instants horaires régulièrement espacés sont retenus, en conservant le début et la fin ; ce sous-échantillonnage est indiqué dans l'image. La dernière case est signalée si elle est partielle. Les délais GIF, en centièmes de seconde, totalisent exactement 3 000 ms par boucle ; le lecteur utilisé peut influencer la cadence de restitution. Le GIF n'ajoute aucune observation entre les instants retenus. La lecture interactive normale utilise désormais une case toutes les 140 ms, cadence de l'ancien réglage ×5.

Le fond de l'export est une sélection européenne des couches [Natural Earth 1:50m](https://www.naturalearthdata.com/), dans le [domaine public](https://www.naturalearthdata.com/about/terms-of-use/). Le script `tools/prepare-export-map.mjs` conserve la provenance et arrondit les coordonnées géographiques du fond à trois décimales ; il ne modifie pas les coordonnées des balises. Les images sont encodées avec [gifenc 1.0.3](https://github.com/mattdesl/gifenc), fourni localement avec sa licence MIT. Aucun service de génération, de tuiles ou de collecte REMAP n'est appelé pour cet export.

## Données et limites

Le jeu du 13–20 octobre 2026 est chargé par défaut : 5 955 balises, 966 761 observations, 1 192 lots valides sur 1 192 et une couverture horaire de 90,2 %. Avec la sensibilité faible, au moins 10 balises par zone, un voisinage de 150 km, une liaison horaire de 100 km, une progression minimale de 5 h et un déplacement minimal de 1 000 km, 202 zones horaires forment 11 ensembles temporels ; deux satisfont le filtre. Le tri initial place le cluster 2 (environ 2 058 km, 474 balises dans 6 pays) avant le cluster 1 (environ 1 498 km, 974 balises dans 11 pays). Les critères de recherche restent réglables. Le catalogue conserve les périodes séparées et ne les fusionne pas.

Le bouton **Importer un dossier local** remplace les données de l'onglet par une collecte utilisateur, sans transmettre ses fichiers. Les événements sont recalculés avec les critères appliqués. La période, les effectifs et le bilan des lots se rapportent alors à ce dossier, et non à l'instantané ci-dessous. Voir [IMPORT.md](IMPORT.md) pour le format, les vérifications, les lacunes et les limites de l'import.

L'instantané comporte 5 981 balises, 1 021 060 observations sources, une couverture des cases horaires de 90,8 %, et six lots absents. La dernière case est partielle. Les coordonnées ont été arrondies par le client REMAP. La qualité instrumentale et les conditions météorologiques ne sont pas validées par cet outil.

La densité du réseau, les lacunes, les seuils, le chaînage spatial, les règles de proximité, les fusions et le choix de la première activation influencent fortement les clusters. La présence de FR1191 dans un vaste ensemble constitue une vérification de couverture du cas demandé, pas une preuve que toutes ses observations relèvent d'une même cause. L'appartenance doit être examinée heure par heure et par comparaison des sensibilités.

Les calculs sont effectués dans le navigateur. La page et cet instantané déjà collecté sont hébergés sur GitHub Pages. Le fond Natural Earth est fourni avec la page. Le bouton Fond détaillé charge des tuiles OpenStreetMap visibles, sans transmettre les mesures. GitHub ne collecte aucune donnée REMAP. Toute nouvelle collecte reste effectuée par l'utilisateur dans son navigateur, après passage manuel du CAPTCHA ; les fichiers normalisés sont ensuite préparés localement.
