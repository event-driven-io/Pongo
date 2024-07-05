# Contributing to Pongo

We take Pull Requests!

## Before you send Pull Request

1. Contact the contributors via the [Discord channel](https://discord.gg/fTpqUTMmVa) or the [Github Issue](https://github.com/event-driven-io/Pongo/issues/new) to make sure that this is issue or bug should be handled with proposed way. Send details of your case and explain the details of the proposed solution.
2. Once you get approval from one of the maintainers, you can start to work on your code change.
3. After your changes are ready, make sure that you covered your case with automated tests and verify that you have limited the number of breaking changes to a bare minimum.
4. We also highly appreciate any relevant updates to the documentation.
5. Make sure that your code is compiling and all automated tests are passing.

## After you have sent Pull Request

1. Make sure that you applied or answered all the feedback from the maintainers.
2. We're trying to be as much responsive as we can, but if we didn't respond to you.
3. Pull request will be merged when you get approvals from at least one of the maintainers (and no rejection from others). Pull request will be tagged with the target Pongo version in which it will be released. We also label the Pull Requests with information about the type of change.

## Setup your work environment

We try to limit the number of necessary setup to a minimum, but few steps are still needed:

### 1. Install the latest Node.js LTS version

Available [here](https://Node.js.org/en/download/).

If you're using [NVM](https://github.com/nvm-sh/nvm) you can also call:

```shell
nvm install
```

and

```shell
nvm use
```

To use current recommended version.

### 2. Install Docker

Available [here](https://docs.docker.com/engine/install/).

You are now ready to contribute to Pongo.

### 3. Setup dev environment

You can streamling setup by running setup script:

- For Linux and MacOS

```shell
./setup.sh
```

- For Windows

```shell
.\buildScript.ps1
```

Or perform manual steps

### 3.1. Go to source codes

Source codes are located under [./src/](./src/) folder.

```shell
cd src
```

### 3.2. Install packages

```shell
npm install
```

### 3.3 Build project

```shell
npm run build
```

### 3.4. Run tests

```shell
npm run test
```

If any of those steps didn't work for you, please contact us on [Discord channel](https://discord.gg/fTpqUTMmVa).

## Project structure

Pongo is using [NPM Workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces).

The source codes are located in [src](./src/) folder. Packages are nested under [./src/packages](./src/packages) folder.

For documentation Pongo is using [Vitepress](https://vitepress.dev). Documentation is located under [./src/docs](./src/docs/) folder.

To build documentation locally, run in `src` folder:

```shell
npm run docs:dev
```

See also other helpful scripts in [./src/package.json](./src/package.json).

## Working with the Git

1. Fork the repository.
2. Create a feature branch from the `main` branch.
3. We're not squashing the changes and using rebase strategy for our branches (see more in [Git documentation](https://git-scm.com/book/en/v2/Git-Branching-Rebasing)). Having that, we highly recommend using clear commit messages. Commits should also represent the unit of change.
4. Before sending PR to make sure that you rebased the latest `main` branch from the main Pongo repository.
5. When you're ready to create the [Pull Request on GitHub](https://github.com/event-driven-io/Pongo/compare).

## Code style

Pongo is using the recommended [TypeScript](./src/tsconfig.shared.json), [ESLint](./src/.eslintrc.json) and [Prettier](./src/.prettierrc.json) coding style configurations. They should be supported by all popular IDE (eg. Visual Studio Code, WebStorm) so if you didn't disabled it manually they should be automatically applied after opening the solution. We also recommend turning automatic formatting on saving to have all the rules applied.

## Licensing and legal rights

By contributing to Pongo:

1. You assert that contribution is your original work.
2. You assert that you have the right to assign the copyright for the work.

## Code of Conduct

This project has adopted the code of conduct defined by the [Contributor Covenant](http://contributor-covenant.org/) to clarify expected behavior in our community.
