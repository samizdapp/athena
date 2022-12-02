# Athena

This project holds the custom services and apps that make up SamizdApp.

The new structure of the herakles project is currently being developed here:
https://docs.google.com/document/d/1yYs_DpihNry7s5gMlIveZMjwnDlYOWgG1kRJCNedhQM/edit#heading=h.fdp41s6w6tv0

## Install

### nvm

Run:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.2/install.sh | bash
```

### Anaconda

```bash
curl https://repo.anaconda.com/archive/Anaconda3-2022.10-Linux-x86_64.sh -o /tmp/anaconda.sh && bash /tmp/anaconda.sh
```

```bash
conda config --set auto_activate_base false
```

```bash
conda env create
```

### Poetry

```bash
conda activate athena
```

```bash
curl -sSL https://install.python-poetry.org | python3 - --version 1.2.0
```

### Autoenv

Installing autoenv eliminates the need to run `nvm use` and
`conda activate athena` every time you `cd` into the project.

Run:

```bash
curl -#fLo- 'https://raw.githubusercontent.com/hyperupcall/autoenv/master/scripts/install.sh' | sh
```

The above command will append a line to your `~/.bashrc` file that sources
`autoenv/activate.sh`. Add the following variables to your `~/.bashrc` file
immediately _before_ the source line:

```bash
AUTOENV_ENABLE_LEAVE=yes
AUTOENV_ENV_FILENAME=.autoenv
AUTOENV_ENV_LEAVE_FILENAME=.autoenv.leave
```

### Project

Once all above dependencies are installed, run:

```bash
nvm use
conda activate athena

npm install

poetry install
```

## Nx Workspace

This repo is an Nx workspace, which you can learn more about
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
