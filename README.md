# Bim: Grow the Island

A mobile-first strategy game set on the real map of Barbados, by Damian Grows.
Grow real Bajan crops, build aquaponics, survive hurricanes and feed the island's parishes
before AgroCorp buys them up. Play solo, or online with up to 4 players in co-op or versus.

## Where things are

- `docs/design-doc.md` — the game design: rules, crops, aquaponics, ages, multiplayer, build plan
- `packages/sim` — the game rules as a pure simulation: fixed 0.1 s steps, seeded randomness,
  every player action a validated command. Runs the same in the browser and on a server.
- `apps/client` — the phone/browser game: PixiJS rendering, touch controls, HUD
- `prototype/index.html` — the original single-file prototype

## Running it

```
npm install
npm run dev        # play locally at the address Vite prints (also reachable from your phone on the same Wi-Fi)
npm test           # simulation tests, including the determinism check
npm run build      # production build into apps/client/dist
npm run build:single -w @bim/client   # one self-contained HTML file in apps/client/dist-single
```

## Status

- Step 1, real map: done.
- Step 2, foundation: done. The game plays as the prototype did, on the new engine, with
  separate stockpiles per player and support for up to 4 players in the simulation.
- Next: step 3, the multiplayer prototype (Colyseus server, invite codes, trading).

## Credits

Parish borders: [geoBoundaries](https://www.geoboundaries.org/) / Wikimedia Commons, CC BY 2.5.
