module.exports = options => {
    //
    return {
        ...options,
        module: {
            ...(options.module || {}),
            rules: ((options.module && options.module.rules) || []).concat([
                {
                    test: /\.js$/,
                    loader: 'string-replace-loader',
                    options: {
                        search: "req('../../package.json')",
                        replace:
                            "require('../../../../node_modules/@achingbrain/ssdp/package.json')",
                    },
                },
            ]),
        },
    };
};
