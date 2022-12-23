import { InjectorTransformer } from './injector-transformer';

type Point = { x: number; y: number };

const debugGesture = () => {
    const tapRadius = 100;
    const tapInterval = 500;
    const tapCountThreshold = 15;

    const enterDebugMode = () => {
        window.location.href = '/smz/pwa/status';
    };

    const calculateDistance = (p1: Point, p2: Point) => {
        return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    };

    let lastTap: { count: number; time: number; point: Point } | null = null;

    window.addEventListener('pointerdown', e => {
        // track tap
        const now = Date.now();
        const previousTap = lastTap;
        const thisTap = {
            count: (previousTap?.count ?? 0) + 1,
            time: now,
            point: {
                x: e.clientX,
                y: e.clientY,
            },
        };

        // if we have no previous tap
        if (!previousTap) {
            // track this one
            lastTap = thisTap;
            // nothing more to do
            return;
        }

        // taps must be within the tap interval
        if (thisTap.time - previousTap.time > tapInterval) {
            // we've exited the pattern, stop tracking
            lastTap = null;
            // nothing more to do
            return;
        }

        // taps must be within the tap radius
        if (calculateDistance(thisTap.point, previousTap.point) > tapRadius) {
            // we've exited the pattern, stop tracking
            lastTap = null;
            // nothing more to do
            return;
        }

        // if we've reached the tap count threshold
        if (thisTap.count >= tapCountThreshold) {
            // enter debug mode
            enterDebugMode();
            // we've finished the pattern, stop tracking
            lastTap = null;
            // nothing more to do
            return;
        }

        // else, we haven't exited or completed the pattern
        // keep tracking
        lastTap = thisTap;
    });
};

export default new InjectorTransformer('text/html', /(<\/head>)/, {
    replacement: `{{snippet}}$1`,
    data: {
        snippet: `
            <script>
                (${debugGesture})();
            </script>
        `,
    },
});
