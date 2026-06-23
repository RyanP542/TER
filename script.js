// ==========================================
// 1. CARTE LEAFLET (En arrière-plan)
// ==========================================
const map = L.map('map', { zoomControl: false }).setView([48.5839, 7.7455], 13);
L.control.zoom({ position: 'bottomright' }).addTo(map);

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; CARTO'
}).addTo(map);

// ==========================================
// AJOUT DE LA LÉGENDE CARTOGRAPHIQUE (AVEC SVG)
// ==========================================
const legende = L.control({ position: 'bottomleft' });

legende.onAdd = function () {
    const div = L.DomUtil.create('div', 'legende-carte');
    
    // On utilise du CSS en ligne pur et de vrais tracés SVG pour simuler les routes
    div.innerHTML = `
        <div style="background-color: rgba(31, 41, 55, 0.95); padding: 15px; border-radius: 8px; border: 1px solid #4b5563; color: white; font-family: ui-sans-serif, system-ui, sans-serif; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);">
            <h4 style="margin: 0 0 12px 0; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #9ca3af;">
                Niveaux d'exigence
            </h4>
            
            <div style="display: flex; align-items: center; margin-bottom: 10px;">
                <svg width="35" height="10" style="margin-right: 12px; overflow: visible;">
                    <line x1="0" y1="5" x2="35" y2="5" stroke="#ef4444" stroke-width="6" stroke-linecap="round" style="filter: drop-shadow(0px 0px 4px rgba(239,68,68,0.5));" />
                </svg>
                <span style="font-size: 13px; font-weight: 500;">Plus court chemin </span>
            </div>
            
            <div style="display: flex; align-items: center; margin-bottom: 10px;">
                <svg width="35" height="10" style="margin-right: 12px; overflow: visible;">
                    <line x1="0" y1="5" x2="35" y2="5" stroke="#f97316" stroke-width="6" stroke-linecap="round" style="filter: drop-shadow(0px 0px 4px rgba(249,115,22,0.5));" />
                </svg>
                <span style="font-size: 13px; font-weight: 500;">Compromis </span>
            </div>
            
            <div style="display: flex; align-items: center;">
                <svg width="35" height="10" style="margin-right: 12px; overflow: visible;">
                    <line x1="0" y1="5" x2="35" y2="5" stroke="#22c55e" stroke-width="6" stroke-linecap="round" style="filter: drop-shadow(0px 0px 4px rgba(34,197,94,0.5));" />
                </svg>
                <span style="font-size: 13px; font-weight: 500;">Meilleur ressenti </span>
            </div>
        </div>
    `;
    
    L.DomEvent.disableClickPropagation(div);
    return div;
};

legende.addTo(map);

let coucheGeoJSON;
let donneesJsonActuelles = null;

function getCouleur(alpha) {
    if (alpha == 0) return "#ef4444"; // Rouge
    if (alpha == 2) return "#f97316"; // Orange
    if (alpha == 4) return "#22c55e"; // Vert
    return "#ffffff";
}

// ==========================================
// 2. LIAISON AVEC L'INTERFACE 
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const selectTrajet = document.getElementById('select-trajet');
    const alphaButtons = document.querySelectorAll('.btn-alpha');
    const distVal = document.getElementById('dist-val'); 
    const timeVal = document.getElementById('time-val'); 
    const noteVal = document.getElementById('note-val'); 
    
    // 1. Transformer les boutons en "cases à cocher"
    alphaButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Au lieu de désactiver les autres, on bascule juste l'état (Toggle)
            button.classList.toggle('active');
            updateMap(); // On met à jour la carte
        });
    });

    // 2. Écouteur sur le menu déroulant
    selectTrajet.addEventListener('change', () => {
        chargerFichierJson(selectTrajet.value);
    });

    // ==========================================
    // 3. MOTEUR DE MISE À JOUR
    // ==========================================

    // Charger le fichier JSON du trajet sélectionné
    function chargerFichierJson(nomFichier) {
        fetch(`Traces_QGIS/${nomFichier}.json`)
            .then(res => res.json())
            .then(data => {
                donneesJsonActuelles = data;
                if (coucheGeoJSON) map.removeLayer(coucheGeoJSON);

                // On ajoute la couche sans l'afficher encore
                coucheGeoJSON = L.geoJSON(data).addTo(map);
                map.fitBounds(coucheGeoJSON.getBounds());

                updateMap(); // Applique les couleurs et les stats
            })
            .catch(err => console.error("Erreur de chargement JSON:", err));
    }

    // Mettre à jour les lignes et le panneau
    function updateMap() {
    if (!donneesJsonActuelles || !coucheGeoJSON) return;

    // On regarde quels boutons ont la classe 'active'
    const alphasActifs = Array.from(document.querySelectorAll('.btn-alpha.active'))
                              .map(btn => parseInt(btn.getAttribute('data-alpha')));

    let derniereDistance = "--";
    let dernierDetour = "--";
    let derniereNote = "--"; // <-- 1. Nouvelle variable pour stocker la note

    // Mise à jour de la couleur des lignes
    coucheGeoJSON.setStyle(function (feature) {
        const alpha = feature.properties.Alpha;
        
        if (alphasActifs.includes(alpha)) {
            // Si la ligne est affichée, on garde ses stats pour le panneau
            derniereDistance = feature.properties.Distance_m;
            dernierDetour = feature.properties.Detour_pct;
            
            // <-- 2. Récupération de la note depuis le GeoJSON Python
            derniereNote = feature.properties.Note_moyenne; 

            return { color: getCouleur(alpha), weight: 6, opacity: 1 };
        } else {
            return { opacity: 0, weight: 0 }; // Ligne cachée
        }
    });

    // Mise à jour des petits encarts textes !
    if (alphasActifs.length > 0) {
        distVal.textContent = `${derniereDistance} m`;
        timeVal.textContent = `+ ${dernierDetour} %`; 
        
        if (typeof noteVal !== 'undefined') {
            noteVal.textContent = `${derniereNote} / 5 `;
        }

    } else {
        distVal.textContent = "-- m";
        timeVal.textContent = "-- %";
        if (typeof noteVal !== 'undefined') {
            noteVal.textContent = "-- / 5 ";   
        }
    }
}

fetch('Traces_QGIS/4km.geojson')
    .then(response => response.json())
    .then(data => {
        L.geoJSON(data, {
            style: {
                color: '#60a5fa',       
                weight: 2,             
                dashArray: '8, 8',      
                fillColor: '#60a5fa',   
                fillOpacity: 0.05,      
                interactive: false     
            }
        }).addTo(map); // Et on l'ajoute à ta carte !
    })
    .catch(error => console.error("Erreur de chargement de la zone :", error));

    // On charge le premier trajet du menu déroulant
    chargerFichierJson(selectTrajet.value);
});