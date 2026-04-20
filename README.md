# Dunk App

Extracted from the Livewager monorepo — just the Dunk tilt game + its ICRC points ledger.

## Run locally

```bash
npm install --legacy-peer-deps
npm run dev
# → http://localhost:3002/dunk
```

`/` redirects to `/dunk`. See [CONTRIBUTING.md](./CONTRIBUTING.md) for
the full local-dev workflow, commit style, and the
polish/test/routes-200 gate every tick goes through.

## What's NOT in here

Deliberately stripped from the source repo: Clerk auth, LiveKit streaming,
Pusher, socket.io, the `/settings/*` admin tree, the landing-page
TempleDice component, and anything that required `livewagerToken`. The game
is the hero.

## Optional: run the ICP points ledger

```bash
dfx start --background --clean
dfx deploy points_ledger --argument "(record { minter = principal \"$(dfx identity get-principal)\" })"
```

The `#drop` section in the UI will then connect to the local canister.
