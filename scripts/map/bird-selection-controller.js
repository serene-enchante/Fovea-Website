import { normalizeZoneId } from '../utils/format-utils.js';
import { state as sharedState } from '../state.js';
import { clearBirdObservationPopup } from '../components/bird-observation-view.js';
import { loadTurfLibrary as loadTurfLibraryDefault } from './map-vendor-loader.js';

const activeBirdRequests = new WeakMap();

function cancelPendingBirdRequest(state) {
    const controller = activeBirdRequests.get(state);
    if (!controller) return;
    activeBirdRequests.delete(state);
    controller.abort();
}

export function clearBirdObservations(state = sharedState) {
    cancelPendingBirdRequest(state);
    state.selectedBird = null;
    state.selectedBirdObservations = [];
    state.selectedBirdPhotoUrl = '';
    state.selectedBirdPhotoCredit = '';
    clearBirdObservationPopup();
    state.map?.getSource('bird-observations')?.setData({ type: 'FeatureCollection', features: [] });
}

export function createBirdSelectionController({
    state,
    fetchObservations,
    fetchDefaultPhoto,
    getBbox,
    updateHeader,
    renderSidebarList,
    updateSidebarBirdPanel,
    setupObservationsLayer,
    documentObject = globalThis.document,
    turfObject = globalThis.turf,
    loadTurfLibrary = loadTurfLibraryDefault,
    AbortControllerConstructor = globalThis.AbortController,
    onError = (...args) => console.error(...args)
}) {
    async function selectBird(birdName) {
        cancelPendingBirdRequest(state);
        state.selectedBird = birdName;
        updateHeader(birdName);

        const backButton = documentObject?.getElementById('btn-capsule-back');
        if (backButton) {
            backButton.disabled = false;
            backButton.classList.remove('is-disabled');
            backButton.setAttribute('aria-label', 'Back to Zone');
            backButton.setAttribute('title', 'Back to Zone');
        }

        renderSidebarList();
        if (!state.map) return;

        const targetFeature = state.allFeatures.find(feature => {
            const zoneId = feature.properties?.zid;
            return zoneId && (zoneId.toLowerCase() === state.currentId.toLowerCase() || normalizeZoneId(zoneId) === normalizeZoneId(state.currentId));
        });
        if (!targetFeature) return;

        setupObservationsLayer();
        const requestController = new AbortControllerConstructor();
        activeBirdRequests.set(state, requestController);

        try {
            const requestOptions = { signal: requestController.signal };
            const turfPromise = turfObject
                ? Promise.resolve(turfObject)
                : loadTurfLibrary().catch(() => null);
            const data = await fetchObservations(birdName, getBbox(targetFeature), requestOptions);
            if (requestController.signal.aborted || state.selectedBird !== birdName) return;
            const spatialLibrary = await turfPromise;

            const results = data.results || [];
            const features = [];
            results.forEach(observation => {
                if (!observation.location) return;
                const [lat, lng] = observation.location.split(',').map(Number);
                if (Number.isNaN(lat) || Number.isNaN(lng)) return;

                let isInside = true;
                try {
                    if (spatialLibrary?.booleanPointInPolygon && spatialLibrary.point) {
                        isInside = spatialLibrary.booleanPointInPolygon(spatialLibrary.point([lng, lat]), targetFeature);
                    }
                } catch {
                    isInside = true;
                }

                if (!isInside) return;
                const photo = observation.photos?.[0]?.url?.replace('square', 'medium') || '';
                features.push({
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [lng, lat] },
                    properties: {
                        id: observation.id,
                        user: observation.user?.login || 'Observer',
                        date: observation.observed_on || observation.created_at_details?.date || 'Recent',
                        place: observation.place_guess || '',
                        photoUrl: photo,
                        uri: observation.uri || `https://www.inaturalist.org/observations/${observation.id}`,
                        species: birdName
                    }
                });
            });

            state.selectedBirdObservations = features;
            state.map.getSource('bird-observations')?.setData({ type: 'FeatureCollection', features });

            let featuredPhotoUrl = '';
            let photoCredit = '';
            for (const feature of features) {
                if (!feature.properties.photoUrl) continue;
                featuredPhotoUrl = feature.properties.photoUrl.replace('square', 'large').replace('medium', 'large');
                photoCredit = `Photo by ${feature.properties.user} via iNaturalist`;
                break;
            }

            if (!featuredPhotoUrl) {
                for (const observation of results) {
                    const photoUrl = observation.photos?.[0]?.url;
                    if (!photoUrl) continue;
                    featuredPhotoUrl = photoUrl.replace('square', 'large').replace('medium', 'large');
                    photoCredit = `Photo by ${observation.user?.login || 'iNaturalist user'} via iNaturalist`;
                    break;
                }
            }

            if (!featuredPhotoUrl) {
                const defaultPhoto = await fetchDefaultPhoto(birdName, requestOptions);
                if (requestController.signal.aborted || state.selectedBird !== birdName) return;
                if (defaultPhoto) {
                    featuredPhotoUrl = (defaultPhoto.medium_url || defaultPhoto.url || '').replace('square', 'large').replace('medium', 'large');
                    photoCredit = defaultPhoto.attribution || 'Photo via iNaturalist';
                }
            }

            state.selectedBirdPhotoUrl = featuredPhotoUrl;
            state.selectedBirdPhotoCredit = photoCredit;
            if (state.activeTab === 'observations') renderSidebarList();
            else updateSidebarBirdPanel(birdName, features, featuredPhotoUrl, photoCredit);
        } catch (error) {
            if (requestController.signal.aborted || state.selectedBird !== birdName) return;
            onError('iNaturalist error:', error);
            const listContainer = documentObject?.getElementById('sidebar-zone-list');
            const status = listContainer?.querySelector('.sidebar-bird-panel__status');
            if (status) status.textContent = 'Could not load observations from iNaturalist.';
        } finally {
            if (activeBirdRequests.get(state) === requestController) activeBirdRequests.delete(state);
        }
    }

    return { selectBird };
}
