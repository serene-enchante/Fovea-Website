import { APP_INSTRUCTION_CONFIGS } from '../config/app-config.js';
import { normalizeAppKey } from './app-launch-service.js';

export function resolveAppInstructionConfig(appKeyOrName) {
    const normalizedKey = normalizeAppKey(appKeyOrName);
    let config;

    if (normalizedKey.includes('avenza')) config = APP_INSTRUCTION_CONFIGS.avenza;
    else if (normalizedKey.includes('gaia')) config = APP_INSTRUCTION_CONFIGS.gaia;
    else if (normalizedKey.includes('caltopo')) config = APP_INSTRUCTION_CONFIGS.caltopo;
    else if (normalizedKey.includes('osmand')) config = APP_INSTRUCTION_CONFIGS.osmand;
    else {
        config = {
            appName: appKeyOrName,
            scheme: `${normalizedKey}://`,
            formatKey: 'gpx',
            ext: 'gpx',
            iconSrc: '../images/app_icons/gaia.webp',
            step1Heading: 'Download the Map File',
            step2Heading: `Launch ${appKeyOrName}`,
            step2Text: `Tap <strong>Continue to ${appKeyOrName}</strong> below to open the app.`,
            step3Heading: 'Import Map',
            step3Text: `Inside ${appKeyOrName}, select your downloaded map file from the <strong>Downloads</strong> folder.`,
            continueBtnText: `Continue to ${appKeyOrName}`
        };
    }

    return { config, normalizedKey };
}
