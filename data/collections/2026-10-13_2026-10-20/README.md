# Collecte REMAP du 13 au 20 octobre 2026

Période demandée : du 13 octobre 2026 à 00:00:00 UTC au 20 octobre à 11:53:33,687 UTC, borne finale exclue. Collecte fournie par l'utilisateur, exécutée dans sa session REMAP après CAPTCHA manuel ; aucune collecte n'est effectuée par GitHub.

- 5 955 balises dans l'inventaire ; 966 761 observations normalisées.
- 1 192 lots attendus, tous présents et valides ; aucun lot absent ou invalide ; aucun doublon retiré.
- 180 cases horaires, dont la dernière partielle ; couverture instrument × heure : 90,1913 %.
- Le manifeste conserve une erreur HTTP historique sur `w01-b0090`. Le fichier final de ce lot est présent et passe les mêmes vérifications que les autres ; cette erreur n'est pas une lacune dans le dossier final.

`meta.json` décrit les métadonnées et les contrôles ; `values.bin` contient les moyennes horaires Float64, ordre balise puis heure, avec des NaN pour les cases sans mesure. Aucun remplissage des lacunes ni conversion supplémentaire des valeurs n'est effectué.

`collecte.zip` conserve les 1 192 lots JSON et le manifeste final, à extraire dans un dossier avant import dans Bouffi. Les deux sauvegardes intermédiaires du manifeste ne sont pas nécessaires à cette campagne finale et ne sont pas incluses dans l'archive.

Préparation reproductible avec `node tools/prepare-hosted-dataset.mjs dossier-source data/collections/2026-10-13_2026-10-20`, en réutilisant le même validateur que l'import local. Tous les fichiers de la collecte sont vérifiés avant la création des moyennes horaires.

Avec les critères par défaut du 20 octobre (sensibilité faible, voisinage 150 km, 10 balises, liaison horaire 100 km, progression 5 h et déplacement minimal 1 000 km), 202 zones horaires forment 11 ensembles temporels ; deux satisfont le filtre. Le tri décroissant des déplacements place le cluster 2 (environ 2 058 km, 474 balises dans 6 pays) avant le cluster 1 (environ 1 498 km, 974 balises dans 11 pays). Ce résultat dépend des critères et n'attribue pas une cause aux variations.
