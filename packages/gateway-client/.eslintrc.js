const restrictedGlobals = require('confusing-browser-globals');

module.exports = {
    extends: ['plugin:@nrwl/nx/react', '../../.eslintrc.json'],
    ignorePatterns: ['!**/*'],
    overrides: [
        {
            files: ['*.ts', '*.tsx', '*.js', '*.jsx'],
            rules: {
                'no-restricted-globals': ['error'].concat(
                    restrictedGlobals.filter(global => global !== 'self')
                ),
            },
        },
        {
            files: ['*.ts', '*.tsx'],
            rules: {},
        },
        {
            files: ['*.js', '*.jsx'],
            rules: {},
        },
    ],
};
