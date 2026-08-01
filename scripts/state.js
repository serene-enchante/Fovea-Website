import { CIRCLE_ID } from './config/app-config.js';

export const state = {
    allFeatures: [],
    circlesFeatures: [],
    eugeneFeatures: [],
    florenceFeatures: [],
    currentFeature: "circles", // "circles", "eugene", "florence"
    isCirclesFeature: true,
    currentId: CIRCLE_ID,
    activeTab: "items",
    isSwipeTransitionActive: false,
    map: null,
    geoJsonLayer: null,
    featureLayersMap: new Map(), // maps zoneId/cid -> leaflet layer
    lastZoneClickTime: 0,
    userLocationMarker: null,
    userLocationAccuracy: null,
    isLocating: false,
    locateControl: null,
    fullscreenControl: null,
    layersControl: null,
    focusedTileIndex: -1,
    lastNavSource: "click",
    baseMapsList: [],
    currentBaseLayer: "dark",
    snapState: "default"
};
