import { useEffect, useState } from 'react';

import { CircularIndeterminate } from '../components/progress';
import Trust from '../components/trust';
import BasicLayout from '../layouts/basic';
import { getSupportedPlatform, isPwa, isSupportedPlatform } from './support';

const WELCOME_STATUS = `http://pleroma.3b836fd1ff44e0fca4768822415ef6614d0c0d4f07b96008b1367734161e628.f.yg/api/v1/statuses/AMZ2VxYnjpo5sK8W00`;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const WELCOME_STATUS_PAGE = `/@ryan@pleroma.3b836fd1ff44e0fca4768822415ef6614d0c0d4f07b96008b1367734161e628.f.yg/posts/AMZ2VxYnjpo5sK8W00`;

// let timeout = null;
let _reloading = false;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function waitForWelcomeAvailable() {
    while (true) {
        const res = await fetch(WELCOME_STATUS).catch(e => {
            console.warn(e);
            return null;
        });
        if (res && res.ok) {
            return;
        }
        await new Promise(r => setTimeout(r, 2000));
    }
}

async function getLoadUrl() {
    // const welcome = await localStorage.getItem('welcome')

    // await waitForWelcomeAvailable()

    return '/';
}

async function reload() {
    // alert('reload fn')
    if (isPwa() && document.visibilityState === 'visible') {
        // alert('wait for active worker')
        while (navigator.serviceWorker?.controller?.state !== 'activated')
            await new Promise(r => setTimeout(r, 100));
        // alert('reload')
        if (!_reloading) {
            _reloading = true;
            window.location.href = await getLoadUrl();
        }
    }
}

async function registerReloader() {
    if (typeof window === 'undefined') return;
    // alert('add visibility listener')
    document.addEventListener('visibilitychange', reload);
    // alert('try reload')
    return reload();
}

registerReloader().catch(e => {
    alert(e.message);
});

export default function Home() {
    const [platform, setPlatform] = useState('');
    const [recommended, setRecommended] = useState('');
    const [reloading, setReloading] = useState(false);
    const [error] = useState(null);
    const [sanity, setSanity] = useState('insane2');

    useEffect(() => {
        setSanity('insane in the membrane');
        if (isPwa()) {
            setReloading(true);
            reload();
        } else if (isSupportedPlatform()) {
            setPlatform(getSupportedPlatform());
        } else {
            setRecommended(getSupportedPlatform());
        }
    }, [reloading]);

    useEffect(() => {
        (async function () {
            console.log('wait for controller');
            while (navigator.serviceWorker?.controller?.state !== 'activated') {
                console.log('wait', navigator.serviceWorker?.controller);
                await new Promise(r => setTimeout(r, 1000));
            }
            const url = new URL(window.location.href);
            console.log('url');
            const address = url.searchParams.get('mdns');
            if (address) {
                console.log('postmessage');
                navigator.serviceWorker.controller.postMessage({
                    type: 'MDNS',
                    address,
                });
            } else {
                navigator.serviceWorker.controller.postMessage({
                    type: 'START',
                });
            }
        })();
    }, []);

    if (recommended) {
        return <Unsupported recommended={recommended} />;
    }

    if (platform) {
        return <Instructions platform={platform} />;
    }

    return (
        <BasicLayout>
            {`${sanity} reloading ${reloading}: ${
                error ? error.message : 'no error'
            }`}
            <CircularIndeterminate />
        </BasicLayout>
    );
}

function Unsupported({ recommended }) {
    return (
        <BasicLayout>
            <h1>Please open this page in {recommended}</h1>
        </BasicLayout>
    );
}

function Instructions({ platform }) {
    if (platform === 'Chrome') {
        return (
            <BasicLayout>
                <Trust />
            </BasicLayout>
        );
    } else if (platform === 'Safari') {
        return <SafariInstall />;
    }
}

function SafariInstall() {
    <BasicLayout>add to home screen</BasicLayout>;
}
