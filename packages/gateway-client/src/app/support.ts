import platform from 'platform';

export function isPwa() {
    return ['fullscreen', 'standalone', 'minimal-ui'].some(
        displayMode =>
            window.matchMedia('(display-mode: ' + displayMode + ')').matches
    );
}

export function isSupportedPlatform(p = platform) {
    // if (query.expo) return true
    if (p.name?.startsWith(getSupportedPlatform())) {
        return getSupportedPlatform();
    }

    return false;
}

export function getSupportedPlatform(p = platform) {
    switch (p.os?.family) {
        case 'iOS':
            return 'Safari';
        default:
            return 'Chrome';
    }
}
