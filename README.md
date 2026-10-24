# Bim: Grow the Island

A mobile-first strategy game set on the real map of Barbados, by Damian Grows.
Grow real Bajan crops, build aquaponics, survive hurricanes and feed the island's parishes
before AgroCorp buys them up. Play solo, or online with up to 4 players in co-op or versus.

## Where things are

- `docs/design-doc.md` — the game design: rules, crops, aquaponics, ages, multiplayer, build plan
- `packages/sim` — the game rules as a pure simulation: fixed 0.1 s steps, seeded randomness,
  every player action a validated command. Runs the same in the browser and on a server.
- `apps/client` — the phone/browser game: PixiJS rendering, touch controls, HUD, menu and lobby
- `apps/server` — the online server: serves the game and runs lockstep rooms over WebSocket
- `prototype/index.html` — the original single-file prototype

## Running it

```
npm install
npm run dev:server   # the game server on :8787
npm run dev          # the game at the address Vite prints (also reachable from your phone on the same Wi-Fi)
npm test             # simulation and server tests, including lockstep and determinism checks
npm run build        # builds the game page and the server
npm start            # serves the built game and online rooms on $PORT (default 8787)
npm run build:single -w @bim/client   # one self-contained HTML file (solo play only) in apps/client/dist-single
```

## Putting it online (Render, free)

1. Sign in at render.com with your GitHub account.
2. **New + → Blueprint**, pick `bim-grow-the-island`, then **Apply**. Render reads `render.yaml`.
3. Wait for the first deploy (a few minutes). Your game is at `https://bim-grow-the-island.onrender.com` (or the name Render shows).
4. Every push to `main` redeploys automatically.

The free plan sleeps after 15 minutes without visitors; the first visit after that takes about a minute to wake.
For no sleep, switch the service to a paid plan, or deploy the same build to Fly.io.

## How online play works

Lockstep: every phone runs the same simulation. The server gathers each player's commands for a 0.1 s tick,
applies them to its own copy, steps it and broadcasts the commands; every phone does exactly the same. Phones send
a fingerprint of their game every 5 seconds and the server sends a fresh snapshot to any phone that drifted.
Players who drop out rejoin with the code (their seat is kept for the whole game).

## Status

- Step 1, real map: done.
- Step 2, foundation: done. The game plays as the prototype did, on the new engine, with
  separate stockpiles per player and support for up to 4 players in the simulation.
- Step 3, multiplayer: done. Rooms with 5-letter codes and invite links for up to 4 players, Co-op or Versus,
  lockstep play with server checks and resync, rejoin, shared pauses, trading and co-op gifts.
- Also built: dashboard, food upkeep, roads, Bridgetown Port, Grantley Adams Airport and all five ages.

## Credits

Parish borders: [geoBoundaries](https://www.geoboundaries.org/) / Wikimedia Commons, CC BY 2.5.
