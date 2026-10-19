export const MAP_PROVIDER_URLS = Object.freeze({
    carto: Object.freeze({
        lightVectorStyle: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
        darkVectorStyle: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        darkRasterTiles: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
    }),
    esri: Object.freeze({
        satelliteTiles: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        streetTiles: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
        topoTiles: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'
    })
});

export const CARTO_SUBDOMAINS = Object.freeze(['a', 'b', 'c', 'd']);
