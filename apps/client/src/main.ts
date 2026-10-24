import './style.css';
import { LocalGame } from './game';
import { Renderer } from './render';
import { UI } from './ui';

async function boot() {
  let game = new LocalGame({ players: 1 });
  const r = new Renderer();
  await r.init(game, document.getElementById('app')!);
  const centerHome = () => {
    const home = game.state.parishes[game.state.players[0].home];
    r.z = Math.max(0.9, Math.min(1.5, r.vw / (13 * 24)));
    r.centerOn(home.lx, home.ly);
  };
  centerHome();
  const ui = new UI(game, r, () => {
    game = new LocalGame({ players: 1 });
    r.setGame(game); ui.setGame(game); centerHome(); ui.start();
  });
  document.getElementById('start')!.onclick = () => ui.start();
  addEventListener('resize', () => r.clampCam());
  r.app.ticker.add((t) => {
    const dt = t.deltaMS / 1000;
    if (ui.running) game.advance(dt);
    r.frame(game, ui.view, dt);
    ui.tick(dt);
  });
  ui.renderPanel(true);
  // expose for debugging and automated play-tests
  (window as unknown as { bim: unknown }).bim = { get game() { return game; }, r, ui };
}
boot();
