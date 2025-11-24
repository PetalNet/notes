# Contributing

You'd like contribute? Hurruh!

## Setup

Before you can begin contributing, you'll first need to set up the repository.

### Required Software

In order to contribute, you'll need the following software installed and on your `PATH`.

- Node.js: [Download Node.js](https://nodejs.org/en/download/current) with the version specified in our [`nvmrc`](./.nvmrc)
  - Corepack: [How to Install](https://github.com/nodejs/corepack#manual-installs) (tl;dr: `npm i -g corepack && corepack enable`)
- Git: [Install](https://git-scm.com/install/)

### Steps

To actually set up the repository, follow these instructions:

- [Fork](https://github.com/PetalNet/notes/fork) the repository on GitHub (you'll need to [sign up for a GitHub account](https://docs.github.com/en/get-started/start-your-journey/creating-an-account-on-github) if you don't already have one, sorry).
- Clone your new repository: `git clone https://github.com/<you-username>/notes.git`.
- Switch to a new branch for your contribution: `git switch -c my-awesome-new-feature`.
- Install project dependencies: `pnpm i` (Corepack should've automatically setup pnpm for you already).
- Tell the project where you'd like to store the database:
  - POSIX (macOS, Linux): `cp .env.example .env`
  - PowerShell: `Copy-Item .env.example .env`
- Create said database: `pnpm db:push`.
- Happy developing!

## Helpful Commands

- Run development server: `pnpm dev`
- Update the database: `pnpm db:push`
- Inspect the database: `pnpm db:studio`
