export function getQrCodeImageUrl(dataUrl) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=350x350&format=png&data=${encodeURIComponent(dataUrl)}`;
}

export function getShareQrCodeImageUrl(url, { darkColor = 'b8b8b8' } = {}) {
    const params = new URLSearchParams({
        text: url,
        light: '00000000',
        dark: darkColor,
        size: '500',
        margin: '0'
    });
    return `https://quickchart.io/qr?${params}`;
}

export function loadQrCodeImage(dataUrl, { ImageConstructor = globalThis.Image, setTimeoutFn = globalThis.setTimeout } = {}) {
    if (!ImageConstructor) return Promise.resolve(null);

    return new Promise((resolve) => {
        const image = new ImageConstructor();
        image.crossOrigin = 'anonymous';
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = getQrCodeImageUrl(dataUrl);
        setTimeoutFn(() => resolve(null), 3000);
    });
}
