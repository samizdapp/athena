# Athena

This project holds the custom services and apps that make up SamizdApp.

The new structure of the herakles project is currently being developed here:
https://docs.google.com/document/d/1yYs_DpihNry7s5gMlIveZMjwnDlYOWgG1kRJCNedhQM/edit#heading=h.fdp41s6w6tv0

## Nx Workspace

This repo is an Nx workspace, which you can lean more about
[here](https://nx.dev).

Use the following commands to manage and run the packages in this project:

### Generate an application

Run `npm run nx -- g @nrwl/react:app my-app` to generate an application.

When using Nx, you can create multiple applications and libraries in the same workspace.

### Generate a library

Run `npm run nx -- g @nrwl/react:lib my-lib` to generate a library.

Libraries are shareable across libraries and applications. They can be imported from `@athena/mylib`.

### Build

Run `npm run build my-app` to build the package. The build artifacts will be stored in the `dist/` directory. Use the `--prod` flag for a production build.

### Test

Run `npm test my-app` to execute the unit tests via [Jest](https://jestjs.io).

Run `npm run nx -- affected:test` to execute the unit tests affected by a change.

### Understand your workspace

Run `npm run nx -- graph` to see a diagram of the dependencies of your packages.
