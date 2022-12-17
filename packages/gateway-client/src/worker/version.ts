import { WorkerVersionManifest } from '../worker-messaging';

declare const self: {
    version: WorkerVersionManifest;
} & ServiceWorkerGlobalScope;

// if version not initialized
if (!self.version) {
    self.version = {
        root: {},
        app: {},
    };
}

self.version.app = {
    build: process.env.NX_BUILD_NUMBER,
    branch: process.env.NX_BUILD_BRANCH,
    commit: process.env.NX_BUILD_COMMIT,
};

export const getVersion = () => self.version;

export const setUpdateAvailable = (
    which: 'root' | 'app',
    available: boolean
) => {
    if (!self.version[which]) {
        self.version[which] = {};
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    self.version[which]!.updateAvailable = available;
};
