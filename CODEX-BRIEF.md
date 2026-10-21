# Reprise Codex — eau, précipitations et clusters Bouffi

Contexte de la conversation du 21 octobre 2026, reporté dans le dépôt à la
demande de Philippe. Ce document permet de reprendre le travail dans une
autre session Codex ; il ne déplace pas le fil de conversation lui-même.

## Objectif utilisateur

Lorsqu'un pic dosimétrique survient sur les balises REMAP, identifier
visuellement la structure météorologique qui pourrait l'accompagner,
expliquer sa cohérence avec les activations successives des balises et
anticiper son passage sur les territoires suivants.

Priorités explicites :

1. Masses d'eau atmosphérique et précipitations, très prioritaires.
2. Vents à plusieurs niveaux et prévisions météo pour suivre les structures.
3. Particules seulement comme information secondaire, ultérieure.

L'utilisateur souhaite s'affranchir d'une carte d'exhalation imposée : amorcer
le suivi avec les pics effectivement mesurés, puis utiliser les autres
balises pour vérifier et actualiser l'association. Ne pas transformer cette
préférence en une affirmation que les émissions de radon n'ont aucun effet.

## Sources discutées

- Projet : https://github.com/philippejacquet0-source/science006
- Site : https://philippejacquet0-source.github.io/science006/
- Référence visuelle : https://earth.nullschool.net/fr/#2026/10/20/1100Z/wind/surface/level/overlay=total_cloud_water/orthographic=-350.63,45.16,973
- Source ouverte initiale : https://github.com/cambecc/earth
- Travaux IRSN sur pics gamma, pluie et descendants du radon :
  https://meetingorganizer.copernicus.org/EGU2020/EGU2020-14940.html

La couche CELT de Nullschool représente l'eau des nuages sur toute la colonne,
alors que le vent de surface affiché ne suit pas nécessairement ces nuages.
Ne pas confondre cette couche avec la vapeur intégrée (eau précipitable).

## Évolution réalisée dans cette branche

Carte native synchronisée avec les heures radio, eau précipitable et pluie
GFS réelles, vent à 850 hPa facultatif, sélection d'une structure pluvieuse,
suivi exploratoire à +3/+6/+12/+24 h, fichiers de reconstitution distincts de
calculs individuels de prévision datés, et inclusion des couches dans le GIF.
Les particules et les cartes d'exhalation ne sont pas requises.

Lire METEO.md pour les sources, la grille 2°, les intervalles horaires,
l'algorithme, les lacunes et les limites du rejeu. `weather-engine.mjs` est
testable indépendamment de l'interface. L'ancienne détection des clusters
radio n'a pas été changée pour l'adapter artificiellement à la météo.

## Étape suivante attendue

Passer d'une association exploratoire de structures pluvieuses à une
anticipation évaluée des prochaines activations : séparer les données de
calage et de validation, préserver les runs disponibles avant le pic,
prendre en compte les non-détections et estimer l'incertitude. Ne pas
présenter une trajectoire météo comme une prévision dosimétrique validée.
