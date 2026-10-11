export const APP_STORE_URLS = Object.freeze({
    avenza: Object.freeze({
        ios: 'https://apps.apple.com/app/id388424049',
        android: 'https://play.google.com/store/apps/details?id=com.Avenza'
    }),
    gaia: Object.freeze({
        ios: 'https://apps.apple.com/app/id355727877',
        android: 'https://play.google.com/store/apps/details?id=com.trailbehind.android.gaiagps.pro'
    }),
    caltopo: Object.freeze({
        ios: 'https://apps.apple.com/app/id1489069904',
        android: 'https://play.google.com/store/apps/details?id=com.caltopo.android'
    }),
    osmand: Object.freeze({
        ios: 'https://apps.apple.com/app/id934850375',
        android: 'https://play.google.com/store/apps/details?id=net.osmand'
    })
});

const APP_KEY_ALIASES = Object.freeze({
    avenzamaps: 'avenza',
    gaiagps: 'gaia'
});

export function normalizeAppKey(appKey) {
    return String(appKey).toLowerCase().replace(/[^a-z]/g, '');
}

export function getAppStoreUrl(appKey, userAgent = '') {
    const normalizedKey = normalizeAppKey(appKey);
    const store = APP_STORE_URLS[APP_KEY_ALIASES[normalizedKey] || normalizedKey] || APP_STORE_URLS.avenza;
    return /android/i.test(userAgent) ? store.android : store.ios;
}

export function launchAppWithStoreFallback(appScheme, appKey) {
    const storeUrl = getAppStoreUrl(appKey, navigator.userAgent || '');
    const startTime = Date.now();
    const fallbackTimer = setTimeout(() => {
        if (Date.now() - startTime < 2500) window.open(storeUrl, '_blank');
    }, 1500);

    const clearFallback = () => {
        clearTimeout(fallbackTimer);
        window.removeEventListener('blur', clearFallback);
        document.removeEventListener('visibilitychange', clearFallback);
    };

    window.addEventListener('blur', clearFallback);
    document.addEventListener('visibilitychange', clearFallback);
    window.location.href = appScheme;
}
