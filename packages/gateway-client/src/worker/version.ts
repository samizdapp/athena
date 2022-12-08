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
