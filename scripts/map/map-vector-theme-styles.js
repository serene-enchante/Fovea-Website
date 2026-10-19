export function applyVectorThemeStyles(map, isLightMapMode) {
    if (isLightMapMode) {
        // Refined Light Mode styling with soft modern neutral-gray land
        const lightLandColor = '#d9dce1'; // refined Apple Maps/Carto neutral grey
        const lightLandLayers = ['background', 'landcover', 'landuse'];
        lightLandLayers.forEach(lId => {
            if (map.getLayer(lId)) {
                if (lId === 'background') {
                    map.setPaintProperty(lId, 'background-color', lightLandColor);
                } else {
                    map.setPaintProperty(lId, 'fill-color', lightLandColor);
                }
            }
        });

        // Soft sage green for parks
        const parkLayers = ['park_national_park', 'park_nature_reserve'];
        parkLayers.forEach(lId => {
            if (map.getLayer(lId)) {
                map.setPaintProperty(lId, 'fill-color', '#c8decb');
            }
        });

        // Water and waterways in soft sky-blue
        if (map.getLayer('water')) {
            map.setPaintProperty('water', 'fill-color', '#a8cbdf');
        }
        if (map.getLayer('waterway')) {
            map.setPaintProperty('waterway', 'line-color', '#8eb6cd');
        }

        // Road names in pure black without dropshadows/halos
        if (map.getLayer('roadname_minor')) {
            map.setLayoutProperty('roadname_minor', 'text-size', 11.5);
            map.setPaintProperty('roadname_minor', 'text-color', '#000000');
            map.setPaintProperty('roadname_minor', 'text-halo-width', 0);
        }
        if (map.getLayer('roadname_sec')) {
            map.setLayoutProperty('roadname_sec', 'text-size', {
                stops: [[14, 11], [16, 13.5], [18, 15.5]]
            });
            map.setPaintProperty('roadname_sec', 'text-color', '#000000');
            map.setPaintProperty('roadname_sec', 'text-halo-width', 0);
        }
        if (map.getLayer('roadname_pri')) {
            map.setLayoutProperty('roadname_pri', 'text-size', {
                stops: [[13, 11], [15, 13], [16, 14.5], [18, 16.5]]
            });
            map.setPaintProperty('roadname_pri', 'text-color', '#000000');
            map.setPaintProperty('roadname_pri', 'text-halo-width', 0);
        }
        if (map.getLayer('roadname_major')) {
            map.setLayoutProperty('roadname_major', 'text-size', {
                stops: [[13, 11.5], [15, 13.5], [16, 15], [18, 17.5]]
            });
            map.setPaintProperty('roadname_major', 'text-color', '#000000');
            map.setPaintProperty('roadname_major', 'text-halo-width', 0);
        }

        // Place names in pure black without dropshadows/halos
        const placeLayers = [
            'place_city_r5', 'place_city_r6', 'place_town',
            'place_village', 'place_suburb', 'place_neighbourhood', 'place_hamlet'
        ];
        placeLayers.forEach(lId => {
            if (map.getLayer(lId)) {
                map.setPaintProperty(lId, 'text-color', '#000000');
                map.setPaintProperty(lId, 'text-halo-width', 0);
                map.setLayoutProperty(lId, 'text-transform', 'none');
            }
        });
    } else {
        // Dark Mode styling (original)
        const landColor = '#1a1b1e';
        const landLayers = ['background', 'landcover', 'park_national_park', 'park_nature_reserve', 'landuse'];
        landLayers.forEach(lId => {
            if (map.getLayer(lId)) {
                if (lId === 'background') {
                    map.setPaintProperty(lId, 'background-color', landColor);
                } else {
                    map.setPaintProperty(lId, 'fill-color', landColor);
                }
            }
        });

        // Tweak parks to have a very subtle forest-green tint (#161c18)
        const parkLayers = ['park_national_park', 'park_nature_reserve'];
        parkLayers.forEach(lId => {
            if (map.getLayer(lId)) {
                map.setPaintProperty(lId, 'fill-color', '#161c18');
            }
        });

        // Tweak waterway color for compatibility
        if (map.getLayer('waterway')) {
            map.setPaintProperty('waterway', 'line-color', '#242a30');
        }

        // Substantially enlarge road names and brighten them
        if (map.getLayer('roadname_minor')) {
            map.setLayoutProperty('roadname_minor', 'text-size', 11.5);
            map.setPaintProperty('roadname_minor', 'text-color', 'rgba(165, 165, 165, 0.85)');
        }
        if (map.getLayer('roadname_sec')) {
            map.setLayoutProperty('roadname_sec', 'text-size', {
                stops: [[14, 11], [16, 13.5], [18, 15.5]]
            });
            map.setPaintProperty('roadname_sec', 'text-color', 'rgba(185, 185, 185, 0.9)');
        }
        if (map.getLayer('roadname_pri')) {
            map.setLayoutProperty('roadname_pri', 'text-size', {
                stops: [[13, 11], [15, 13], [16, 14.5], [18, 16.5]]
            });
            map.setPaintProperty('roadname_pri', 'text-color', 'rgba(215, 215, 215, 0.95)');
        }
        if (map.getLayer('roadname_major')) {
            map.setLayoutProperty('roadname_major', 'text-size', {
                stops: [[13, 11.5], [15, 13.5], [16, 15], [18, 17.5]]
            });
            map.setPaintProperty('roadname_major', 'text-color', 'rgba(235, 235, 235, 1)');
        }

        // Place, town, and city labels in elegant slate-blue
        const placeLayers = [
            'place_city_r5', 'place_city_r6', 'place_town',
            'place_village', 'place_suburb', 'place_neighbourhood', 'place_hamlet'
        ];
        const placeColors = {
            'place_city_r5': '#b6d3e6',
            'place_city_r6': '#a2c2d6',
            'place_town': '#8eb1c7',
            'place_village': '#7d9eb3',
            'place_suburb': '#6e8c9f',
            'place_neighbourhood': '#607a8b',
            'place_hamlet': '#526877'
        };
        placeLayers.forEach(lId => {
            if (map.getLayer(lId)) {
                const color = placeColors[lId] || '#e2bd7e';
                map.setPaintProperty(lId, 'text-color', color);
                map.setLayoutProperty(lId, 'text-transform', 'none');
            }
        });
    }
}
