import './style.css';
import { stateHash, type Difficulty } from '@bim/sim';
import { LocalGame, type GameSession } from './game';
import { Menu } from './menu';
import { NetworkGame } from './net';
import { Renderer } from './render';
import { UI } from './ui';

async function boot() {
  let game: GameSession = new LocalGame({ players: 1 });
  let net: NetworkGame | null = null;
  const r = new Renderer();
  r.onContextLost = () => {
    const o = document.getElementById('overlay')!, c = document.getElementById('card')!;
    c.innerHTML = '<h1 style="font-size:28px">Your phone needs a moment</h1><p class="sub">The browser ran short of graphics memory. Close other tabs or apps, then reload. Online games pick up where you left off.</p><button class="btn primary" onclick="location.reload()">Reload</button>';
    o.hidden = false;
  };
  try {
    await r.init(game, document.getElementById('app')!);
  } catch (e) {
    document.getElementById('card')!.innerHTML = '<h1 style="font-size:28px">This browser can\'t run the game</h1><p class="sub">The game needs WebGL graphics. Try the latest Chrome, Safari or Samsung Internet, and make sure hardware acceleration is on.</p>';
    console.error(e);
    return;
  }
  const centerHome = () => {
    const me = game.state.players.find((p) => p.id === game.me) ?? game.state.players[0];
    const home = game.state.parishes[me.home];
    r.z = Math.max(0.9, Math.min(1.5, r.vw / (13 * 24)));
    r.centerOn(home.lx, home.ly);
  };
  const play = (g: GameSession) => { game = g; r.setGame(g); ui.setGame(g); centerHome(); menu.hide(); ui.start(); };
  const leaveNet = () => { net?.leave(); net = null; };

  const ui = new UI(game, r, () => { ui.stop(); leaveNet(); menu.home(); });
  const menu = new Menu({
    solo: (difficulty: Difficulty) => { leaveNet(); play(new LocalGame({ players: 1, difficulty })); },
    create: (name) => { leaveNet(); net = new NetworkGame(handlers(), name); net.create(); },
    join: (name, code) => { leaveNet(); net = new NetworkGame(handlers(), name); net.join(code); },
    settings: (m) => net?.settings(m),
    start: () => net?.startGame(),
    leave: () => leaveNet(),
  });
  function handlers() {
    return {
      lobby: (l: Parameters<Menu['lobby']>[0], slot: number) => {
        if (!l.started) { try { sessionStorage.removeItem('bim:reloaded'); } catch { /* blocked */ } menu.lobby(l, slot); history.replaceState(null, '', `${location.pathname}?room=${l.code}`); }
      },
      started: (g: NetworkGame) => { try { sessionStorage.removeItem('bim:reloaded'); } catch { /* blocked */ } play(g); },
      error: (msg: string, fatal: boolean) => {
        if (!fatal) { ui.toast(msg, 'warn'); return; }
        // the game was updated while this page was open: reload once to get the new version, then rejoin
        if (/out of date/i.test(msg)) {
          let tried = false; try { tried = sessionStorage.getItem('bim:reloaded') === '1'; sessionStorage.setItem('bim:reloaded', '1'); } catch { /* blocked */ }
          if (!tried) { menu.waiting('The game was just updated. Loading the new version…'); setTimeout(() => location.reload(), 600); return; }
        }
        // the room is gone (or full): forget it so the menu doesn't keep offering it
        const code = new URLSearchParams(location.search).get('room');
        if (code && /no game|already started|full/i.test(msg)) { try { localStorage.removeItem(`bim:token:${code}`); } catch { /* blocked */ } history.replaceState(null, '', location.pathname); }
        ui.stop(); net = null; menu.home(msg);
      },
      status: (msg: string | null) => { if (msg) ui.toast(msg, /started/.test(msg) ? 'good' : 'warn'); },
      result: (res: { ok: boolean; msg?: string }) => ui.result(res),
      paused: (p: boolean, by: string) => ui.showPaused(p, by),
      presence: (name: string, connected: boolean) => ui.toast(connected ? `${name} is back and in charge of their co-op.` : `${name} left the game. If they're not back in 2 minutes, the computer will look after their co-op.`, connected ? 'good' : 'warn'),
      caretaker: (name: string) => ui.toast(`The computer is looking after ${name}'s co-op until they're back.`, 'info'),
    };
  }
  menu.home();
  // Coming back to a room link we already have a seat in (page reloaded, or the phone killed the tab while you were
  // sending the code): rejoin straight away, same room and code.
  const back = (new URLSearchParams(location.search).get('room') ?? '').toUpperCase();
  let saved: string | null = null;
  try { saved = back ? localStorage.getItem(`bim:token:${back}`) : null; } catch { /* storage blocked */ }
  if (back && saved) {
    let name = 'Player'; try { name = localStorage.getItem('bim:name') || name; } catch { /* blocked */ }
    menu.waiting(`Reconnecting to game ${back}…`);
    net = new NetworkGame(handlers(), name); net.join(back);
  }
  centerHome();
  addEventListener('resize', () => r.clampCam());
  r.app.ticker.add((t) => {
    const dt = t.deltaMS / 1000;
    if (ui.running) game.advance(dt);
    r.frame(game, ui.view, dt);
    ui.tick(dt);
  });
  ui.renderPanel(true);
  // expose for debugging and automated play-tests
  (window as unknown as { bim: unknown }).bim = { get game() { return game; }, r, ui, stateHash };
}
boot();
