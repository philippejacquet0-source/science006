# Fond des exports animés

Natural Earth, échelle 1:50m, domaine public : https://www.naturalearthdata.com/about/terms-of-use/

Source : https://github.com/nvkelso/natural-earth-vector/tree/ca96624a56bd078437bca8184e78163e5039ad19/geojson

Couches `ne_50m_admin_0_countries`, `ne_50m_admin_1_states_provinces_lines`, `ne_50m_lakes`, `ne_50m_rivers_lake_centerlines` et `ne_50m_populated_places`.

`europe-export.geojson` retient les composantes intersectant l'étendue −32° à 65° E, 25° à 79° N. Les capitales nationales et les villes d'au moins un million d'habitants sont conservées. Les propriétés inutilisées sont retirées, les coordonnées du fond arrondies à trois décimales. Aucune coordonnée instrumentale n'est modifiée.

Régénération : `node tools/prepare-export-map.mjs dossier-des-GeoJSON-sources`. L'export charge uniquement ce fond local et le fond mondial Natural Earth déjà fourni avec Bouffi.
