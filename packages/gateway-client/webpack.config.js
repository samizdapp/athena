// require the main @nrwl/react/plugins/webpack configuration function.
const nrwlConfig = require('@nrwl/react/plugins/webpack');
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');
const { InjectManifest } = require('workbox-webpack-plugin');

module.exports = (config, _context) => {
    // first call it so that it @nrwl/react plugin adds its configs,
    nrwlConfig(config);

    // then override your config.
    return {
        ...config,
<<<<<<< Updated upstream
=======
        devServer: {
            ...(config.devServer || {}),
            headers: {
                ...(config.devServer?.headers || {}),
                'Service-Worker-Allowed': '/',
            },
        },
        module: {
            ...config.module,
            rules: [
                // {
                //     test: /\.([jt])sx?$/,
                //     loader: require.resolve(
                //         '@nrwl/web/src/utils/web-babel-loader'
                //     ),
                //     exclude: /node_modules/,
                //     options: {
                //         babelrc: true,
                //     },
                // },
                ...config.module.rules.map(it => {
                    if (it.loader?.includes('web-babel-loader')) {
                        it.options.plugins = [];
                    }
                    return it;
                }),
            ],
        },
>>>>>>> Stashed changes
        node: {
            ...config.node,
            global: true,
        },
        resolve: {
            ...config.resolve,
            fallback: {
                ...config.resolve.fallback,
                net: false,
                tls: false,
                bufferutil: false,
                'utf-8-validate': false,
            },
        },
        plugins: [
            ...config.plugins,
            new NodePolyfillPlugin(),
            new InjectManifest({
                swSrc: 'packages/gateway-client/src/worker/index.ts',
                swDest: 'service-worker.js',
            }),
        ],
    };
};
