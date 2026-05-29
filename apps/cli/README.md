# e18 — envir18ment CLI

Manage your team's environment secrets from the terminal. End-to-end encrypted — the server never sees your plaintext values.

## Install

```bash
npm install -g @champ18ion/e18
```

## Usage

```bash
e18 login          # authenticate with your envir18ment account
e18 link           # link current directory to a workspace/project/environment
e18 sync           # pull secrets into .env (reads .e18 config)
e18 push           # push local .env to the server
e18 pull           # pull secrets to a specific .env file
e18 run <cmd>      # run a command with secrets injected as env vars
e18 list           # list secrets in the linked environment
e18 logout
e18 whoami
```

## Quick start

```bash
e18 login
cd your-project
e18 link           # interactive picker — choose workspace, project, environment
e18 sync           # writes secrets to .env
```

## Source

[github.com/champ18ion/envir18ment](https://github.com/champ18ion/envir18ment)
