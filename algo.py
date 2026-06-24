!pip install geopandas networkx scipy shapely -q

import geopandas as gpd
import networkx as nx
from scipy.spatial import cKDTree
import pandas as pd
import os
import shutil

print("1. Import des fichiers...")
gdf_reseau = gpd.read_file("troncon_avis_pedaleur_stat_4km.gpkg") # Tronçons avec notes
gdf_points = gpd.read_file("trajets_finaux.gpkg") # Points de départ / d'arrivée

G = nx.Graph()

print("2. Création du graphe de réseau...")
for idx, row in gdf_reseau.iterrows():
    geom = row.geometry
    if geom is None: continue
    start_node = geom.coords[0]
    end_node = geom.coords[-1]
    dist = geom.length
    note = row['moyenne_ressentie']

    # Calcul de la pénalité
    penalite = ((5.0 - note) / 4.0) ** 2
    
    G.add_edge(start_node, end_node, distance=dist, penalite=penalite, note=note, geometry=geom)

nodes = list(G.nodes())
tree = cKDTree(nodes)

alphas_finaux = [0, 2, 4]

# Préparation des exports
stats_globales = [] 
os.makedirs("Traces_QGIS", exist_ok=True)

noms_trajets = gdf_points['trajet'].dropna().unique()

print("3. Calcul des itinéraires...")
for nom in noms_trajets:
    print(f"\n-> Traitement du trajet : {nom}")
    points_du_trajet = gdf_points[gdf_points['trajet'] == nom]

    try:
        geom_depart = points_du_trajet[points_du_trajet['type'] == 'depart'].geometry.values[0]
        geom_arrivee = points_du_trajet[points_du_trajet['type'] == 'arrivee'].geometry.values[0]

        _, idx_A = tree.query((geom_depart.x, geom_depart.y))
        _, idx_B = tree.query((geom_arrivee.x, geom_arrivee.y))
        noeud_depart = nodes[idx_A]
        noeud_arrivee = nodes[idx_B]
    except Exception as e:
        print(f"    Erreur : Vérifie l'orthographe 'depart'/'arrivee' pour le trajet {nom}")
        continue

    dist_reference = 0
    geometries_du_trajet = []

    for alpha in alphas_finaux:
        # Mise à jour du coût sur le réseau
        for u, v, d in G.edges(data=True):
            d['cout_actuel'] = d['distance'] + (d['distance'] * alpha * d['penalite'])

        try:
            chemin = nx.dijkstra_path(G, source=noeud_depart, target=noeud_arrivee, weight='cout_actuel')
            
            distance_totale = 0
            somme_notes_ponderees = 0

            for u, v in zip(chemin[:-1], chemin[1:]):
                dist_segment = G[u][v]['distance']
                note_segment = G[u][v]['note']
                
                distance_totale += dist_segment
                somme_notes_ponderees += (note_segment * dist_segment)

            # La vraie note moyenne du trajet
            note_moyenne_trajet = somme_notes_ponderees / distance_totale
            dist_reelle = distance_totale

            if alpha == 0:
                dist_reference = dist_reelle
                detour_pct = 0.0
            else:
                detour_pct = ((dist_reelle - dist_reference) / dist_reference) * 100

            # Unification de la géométrie
            lignes_geom = [G[u][v]['geometry'] for u, v in zip(chemin[:-1], chemin[1:])]
            ligne_unifiee = gpd.GeoSeries(lignes_geom).unary_union

            # Déf du niveau de sensibilité
            if alpha == 0:
                niveau_sensibilite = 'Priorité : Distance stricte'
            elif alpha == 2:
                niveau_sensibilite = 'Priorité : Compromis équilibré'
            else:
                niveau_sensibilite = 'Priorité : Confort maximal'

            # Ajout des données au tableau CSV 
            stats_globales.append({
                'Trajet': nom,
                'Sensibilite': niveau_sensibilite,
                'Alpha': alpha,
                'Distance_m': round(dist_reelle, 1),
                'Detour_pct': round(detour_pct, 1),
                'Note_moyenne': round(note_moyenne_trajet, 2)
            })

            # Ajout de la ligne spatiale 
            geometries_du_trajet.append({
                'Trajet': nom,
                'Sensibilite': niveau_sensibilite,
                'Alpha': alpha,
                'Distance_m': round(dist_reelle, 1),
                'Detour_pct': round(detour_pct, 1),
                'Note_moyenne': round(note_moyenne_trajet, 2),
                'geometry': ligne_unifiee
            })

            print(f"   ✓ Alpha {alpha} : Dist = {dist_reelle:.1f}m | Détour = +{detour_pct:.1f}% | Note = {note_moyenne_trajet:.2f}/5")

        except nx.NetworkXNoPath:
            print(f"   x Impossible de trouver un chemin pour Alpha {alpha}")

    # Export du fichier web individuel 
    if len(geometries_du_trajet) > 0:
        nom_fichier_propre = nom.replace(" ", "_").replace("/", "_")

        # 1. On crée le tableau spatial
        gdf_trajet = gpd.GeoDataFrame(geometries_du_trajet, crs=gdf_reseau.crs)

        # 2. On convertit directement en coordonnées WGS84
        if gdf_trajet.crs is not None:
            gdf_trajet = gdf_trajet.to_crs(epsg=4326)

        # 3. On sauvegarde le fichier final en .geojson
        chemin_export = f"Traces_QGIS/Trajet_{nom_fichier_propre}.geojson"
        gdf_trajet.to_file(chemin_export, driver="GeoJSON")

print("\n4. Sauvegardes finales...")
# Sauvegarde du CSV
df_stats = pd.DataFrame(stats_globales)
df_stats.to_csv("statistiques_trajets_finaux.csv", index=False)
print("    Fichier CSV 'statistiques_trajets_finaux.csv' généré !")

# Zippage du dossier
shutil.make_archive('Traces_QGIS', 'zip', 'Traces_QGIS')
print("    Fichier 'Traces_QGIS.zip' généré !")
print("\n TERMINÉ !")