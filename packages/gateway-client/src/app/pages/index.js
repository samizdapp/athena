import { useEffect, useState } from 'react';

import { CircularIndeterminate } from '../components/progress';
import Trust from '../components/trust';
import BasicLayout from '../layouts/basic';
import { getSupportedPlatform, isPwa, isSupportedPlatform } from './support';

async function reload() {
    if (document.visibilityState === 'visible') {
        await sendReload();
    }
}

async function registerReloader() {
    if (typeof window === 'undefined') return;
    // alert('add visibility listener')
    document.addEventListener('visibilitychange', reload);
    // alert('try reload')
}

registerReloader().catch(e => {
    alert(e.message);
});

async function sendReload(
    setSanity = m => {
        console.log(m);
    }
) {
    setSanity('wait for controller');
    let i = 0;
    let swstate = navigator.serviceWorker?.controller?.state;
    while (swstate !== 'activated') {
        setSanity(
            `waiting for controller ${++i} ${
                navigator.serviceWorker?.controller?.state
            }`
        );
        swstate = navigator.serviceWorker?.controller?.state;
        await new Promise(r => setTimeout(r, 1000));
    }
    const url = new URL(window.location.href);
    const address = url.searchParams.get('mdns');
    setSanity('send reload message to worker');
    navigator.serviceWorker.onmessage = msg => {
        if (msg.data === 'NAVIGATE') {
            window.location.href = '/';
        }
    };

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
}

export default function Home() {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [platform, setPlatform] = useState('');
    const [recommended, setRecommended] = useState('');
    const [reloading] = useState(false);
    const [error] = useState(null);
    const [sanity, setSanity] = useState('insane2');

    useEffect(() => {
        setSanity('insane in the membrane');
        if (isSupportedPlatform()) {
            setPlatform(getSupportedPlatform());
        } else {
            setRecommended(getSupportedPlatform());
        }
    }, [reloading]);

    useEffect(() => {
        if (isPwa()) {
            sendReload(setSanity);
        } else {
            setSanity('please install PWA to continue');
        }
    }, []);

    if (recommended) {
        return <Unsupported recommended={recommended} />;
    }

    // if (platform) {
    //     return <Instructions platform={platform} />;
    // }

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
