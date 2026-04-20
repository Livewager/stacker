# Stacker

A 30-second arcade skill game built on the Internet Computer. Slide a
row, tap to lock, reach the top for a 3× demo prize. Non-custodial
points wallet, ICRC-1 + ICRC-2 + ICRC-3 on ICP.

## Run locally

```bash
npm install --legacy-peer-deps
npm run dev
# → http://localhost:3002/stacker
```

`/` redirects to `/play` (the games hub). See [CONTRIBUTING.md](./CONTRIBUTING.md)
for the full local-dev workflow, commit style, and the
polish/test/routes-200 gate every tick goes through.

## Site map

- `/play` — games hub (single game today, room to grow)
- `/stacker` — the game, with hero, livestream placeholder, difficulty
  ladder, how-it-works, wager primer
- `/wallet` — non-custodial LWP balance, activity, II sign-in
- `/deposit` — LTC on-ramp (demo), card + bank waitlist
- `/send` — principal-to-principal LWP transfer
- `/withdraw` — LTC off-ramp (demo), buy-LWP flow
- `/leaderboard` — hourly board, hall of fame, your bests
- `/account` — your principal, session, profile
- `/settings` — haptics, reduced motion, storage
- `/fair-play` — anti-cheat + wager disclosure

## Optional: run the ICP points ledger

```bash
dfx start --background --clean
dfx deploy points_ledger --argument "(record { minter = principal \"$(dfx identity get-principal)\" })"
```

The wallet page will connect to the local canister and render real
ICRC balances + transfers.
