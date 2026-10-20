# Importer une collecte locale dans Bouffi

Le bouton **Importer un dossier local**, sous les liens REMAP, ouvre le sélecteur de dossiers du navigateur. Dans Chrome sur ordinateur, choisissez directement le dossier de campagne contenant `manifest.json` et les fichiers `w00-b0000.json`, etc. Ne choisissez pas le dossier parent de plusieurs campagnes. Le navigateur peut demander de confirmer la lecture de son contenu.

## Traitement

Bouffi lit les fichiers dans un Web Worker de votre navigateur. Aucun de ces fichiers ni leurs mesures ne sont envoyés à GitHub ou à un serveur. Le dossier n'est pas modifié. Le bouton **Annuler l'import** interrompt la lecture ; les données précédemment affichées restent disponibles. Un import refusé conserve également ces données.

Le format accepté est celui du collecteur Bouffi : manifeste `remanence-collection-v1` et lots normalisés `remanence-v1`, non synthétiques, en nSv/h. Les réponses réseau REMAP encore encodées ne sont pas interprétées. Aucun facteur de décodage ou de conversion d'unité n'est appliqué à l'import.

L'inventaire, les coordonnées, les identifiants, les périodes des lots, la provenance, les unités et les observations sont vérifiés. Les horodatages doivent indiquer leur fuseau. Les observations hors période, les valeurs non numériques et les métadonnées contradictoires entraînent l'exclusion du lot concerné. Les doublons identiques sont retirés ; un doublon contradictoire invalide le lot. La validation porte sur le lot entier avant son intégration.

Tous les lots attendus sont recherchés dans le dossier, même si le manifeste n'a pas enregistré leur fin avant une interruption. Les sauvegardes et audits ne sont pas utilisés comme observations. Le **Bilan des fichiers et lacunes** indique les lots présents, absents et exclus, avec les motifs d'exclusion. Un dossier ne contenant aucune observation valide est refusé.

Les moyennes horaires sont calculées en UTC sur la période déclarée par le manifeste. Les heures sans mesure restent absentes ; aucun zéro ni aucune interpolation ne sont ajoutés. Les balises déclarées sans mesures sont conservées dans l'inventaire et dans le calcul de couverture. La dernière heure peut être partielle.

## Affichage et analyse

Après validation et calcul, le dossier remplace l'instantané publié dans l'onglet. Son nom, sa période, ses effectifs et sa couverture sont affichés. Les filtres de la liste et la sélection de balise sont réinitialisés ; les critères de recherche appliqués sont conservés. Les événements sont recalculés sur le dossier importé.

La méthode actuelle utilise les 72 premières heures comme référence et analyse les heures suivantes. L'import doit donc couvrir plus de 72 cases horaires pour alimenter cette recherche. Les fichiers d'une campagne plus courte ne sont pas chargés par cette interface. Une balise avec moins de 48 heures mesurées dans la référence peut être consultée, mais ne participe pas à la détection.

La capacité actuelle est de 12 millions de cases balise × heure, pour limiter la mémoire du navigateur. La collecte locale utilisée pour la vérification comporte 5 981 balises, 188 heures, 1 192 lots valides et six lots absents. Ses 1 021 060 observations reproduisent exactement la matrice horaire de l'instantané publié. Le pilote réel de deux balises et 374 observations a également été importé dans le navigateur.

**Revenir à l'instantané publié** recharge les données fournies avec le site. L'import reste limité à la session de l'onglet : après un rechargement, choisissez à nouveau votre dossier. Il n'ajoute aucun fichier à la publication GitHub. Le fond détaillé OpenStreetMap reste facultatif et ne reçoit aucune mesure.
