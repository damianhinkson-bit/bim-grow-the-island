import { DIFFICULTY, MAX_PLAYERS, type Difficulty, type LobbyInfo, type Mode } from '@bim/sim';

const $ = <E extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as E;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
};
/** Online play needs the hosted server; the single-file build (e.g. the Claude artifact) is solo only. */
export const ONLINE = import.meta.env.MODE !== 'single' && location.protocol !== 'file:';

export interface MenuActions {
  solo(d: Difficulty): void;
  create(name: string): void;
  join(name: string, code: string): void;
  settings(m: { mode?: Mode; difficulty?: Difficulty }): void;
  start(): void;
  leave(): void;
}

const seg = (id: string, opts: [string, string, string][], on: string) =>
  `<div class="seg" id="${id}" role="radiogroup">${opts.map(([v, l, sub]) => `<button class="seg-b${v === on ? ' on' : ''}" role="radio" aria-checked="${v === on}" data-v="${v}">${l}<small>${sub}</small></button>`).join('')}</div>`;
const DIFF_OPTS: [string, string, string][] = [['easy', 'Easy', 'Slow, lots of warning'], ['normal', 'Normal', 'A fair race'], ['hard', 'Hard', 'Buys fast']];

/** The start screen and the online lobby, drawn into the overlay card. */
export class Menu {
  private difficulty: Difficulty = 'normal';
  constructor(private a: MenuActions) {}

  private card() { return $('#card'); }
  show() { $('#overlay').hidden = false; }
  hide() { $('#overlay').hidden = true; }

  home(note?: string) {
    this.show();
    const params = new URLSearchParams(location.search);
    const code = (params.get('room') ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
    const name = store.get('bim:name') ?? '';
    this.card().innerHTML = `<div class="flag"><i></i><i></i><i></i></div>
      <div class="kicker">Damian Grows presents</div>
      <h1>Bim: Grow the Island</h1>
      <p class="sub">Grow food for Barbados. Feed <strong>6 of the 11 parishes</strong> and grow through five ages to the <strong>Co-op Age</strong> before AgroCorp buys up the island.</p>
      ${note ? `<p class="note">${esc(note)}</p>` : ''}
      <ul>
        <li><strong>Tap a worker</strong>, then tap breadfruit, coral stone, a spring or flying fish to gather.</li>
        <li><strong>Build</strong> houses, farms, roads and seawalls; trade at the port and airport.</li>
        <li><strong>Tap a parish</strong> next to yours to feed it and win it over.</li>
        <li><strong>Money (BBD)</strong> comes from co-op dues in every parish you feed, and from selling food.</li>
        <li>Drag to pan. Pinch or scroll to zoom.</li>
      </ul>
      <div class="mtabs" role="tablist">
        <button class="mtab${code ? '' : ' on'}" data-tab="solo" role="tab">Play solo</button>
        <button class="mtab${code ? ' on' : ''}" data-tab="online" role="tab">Play online</button>
      </div>
      <div class="mpane" data-pane="solo"${code ? ' hidden' : ''}>
        <div class="kicker">AgroCorp difficulty</div>
        ${seg('difficulty', DIFF_OPTS, this.difficulty)}
        <button class="btn primary" id="go-solo">Start growing</button>
      </div>
      <div class="mpane" data-pane="online"${code ? '' : ' hidden'}>
        ${ONLINE ? `
        <label class="field" for="nm">Your name<input id="nm" maxlength="16" autocomplete="nickname" placeholder="e.g. Damian" value="${esc(name)}"></label>
        <button class="btn primary" id="go-create">Create a game</button>
        <div class="or">or join a friend's game</div>
        <div class="joinrow"><input id="code" maxlength="5" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="CODE" value="${code}" aria-label="Game code"><button class="btn" id="go-join">Join</button></div>
        <p class="hint">Up to ${MAX_PLAYERS} players. Play together against AgroCorp, or race each other.</p>`
        : `<p class="hint">Online play works from the hosted game link, not this preview. Ask Damian for the link.</p>`}
      </div>
      <p class="credit">Parish borders: geoBoundaries / Wikimedia Commons, CC BY 2.5.</p>`;
    this.card().querySelectorAll<HTMLButtonElement>('.mtab').forEach((t) => t.onclick = () => {
      this.card().querySelectorAll<HTMLButtonElement>('.mtab').forEach((o) => o.classList.toggle('on', o === t));
      this.card().querySelectorAll<HTMLElement>('.mpane').forEach((p) => (p.hidden = p.dataset.pane !== t.dataset.tab));
    });
    this.bindSeg('#difficulty', (v) => (this.difficulty = v as Difficulty));
    $('#go-solo').onclick = () => this.a.solo(this.difficulty);
    if (ONLINE) {
      const nm = () => { const v = $<HTMLInputElement>('#nm').value.trim(); if (v) store.set('bim:name', v); return v || 'Player'; };
      $('#go-create').onclick = () => { const n = nm(); this.waiting('Creating your game…'); this.a.create(n); };
      const join = () => {
        const c = $<HTMLInputElement>('#code').value.toUpperCase().replace(/[^A-Z]/g, '');
        if (c.length !== 5) { $<HTMLInputElement>('#code').focus(); return; }
        const n = nm(); this.waiting('Joining…'); this.a.join(n, c);
      };
      $('#go-join').onclick = join;
      $<HTMLInputElement>('#code').onkeydown = (e) => { if (e.key === 'Enter') join(); };
    }
  }

  waiting(msg: string) { this.show(); this.card().innerHTML = `<div class="flag"><i></i><i></i><i></i></div><h1 style="font-size:28px">${esc(msg)}</h1><p class="sub">The server may take up to a minute to wake up the first time.</p><button class="btn" id="m-back">Back</button>`; $('#m-back').onclick = () => { this.a.leave(); this.home(); }; }

  lobby(l: LobbyInfo, mySlot: number) {
    this.show();
    const host = l.host === mySlot;
    const link = `${location.origin}${location.pathname}?room=${l.code}`;
    const seats = Array.from({ length: MAX_PLAYERS }, (_, k) => {
      const p = l.players[k];
      return p ? `<li><span class="sw" style="background:${p.color}"></span><span>${esc(p.name)}${p.slot === mySlot ? ' <em>(you)</em>' : ''}${p.slot === l.host ? ' <em>· host</em>' : ''}</span>${p.connected ? '' : '<span class="pill warn">offline</span>'}</li>`
        : '<li class="empty"><span class="sw"></span><span>Open seat</span></li>';
    }).join('');
    const modeName = l.mode === 'coop' ? 'Co-op vs AgroCorp' : 'Versus';
    this.card().innerHTML = `<div class="flag"><i></i><i></i><i></i></div>
      <div class="kicker">Game code</div>
      <div class="bigcode" aria-label="Game code ${l.code.split('').join(' ')}">${l.code}</div>
      <div class="joinrow"><input id="link" readonly value="${esc(link)}" aria-label="Invite link"><button class="btn" id="copy">Copy link</button></div>
      <p class="hint">Send the link or read out the code. Friends open the game, tap Play online, and join.</p>
      <ul class="seats">${seats}</ul>
      ${host ? `<div class="kicker">Mode</div>${seg('mode', [['coop', 'Co-op', 'Together vs AgroCorp'], ['versus', 'Versus', 'Race each other']], l.mode)}
        <div class="kicker">AgroCorp difficulty</div>${seg('ldiff', DIFF_OPTS, l.difficulty)}
        <button class="btn primary" id="m-start"${l.mode === 'versus' && l.players.length < 2 ? ' disabled' : ''}>Start the game</button>`
        : `<p class="sub"><strong>${modeName}</strong> · AgroCorp ${DIFFICULTY[l.difficulty].label}. Waiting for the host to start…</p>`}
      <button class="btn ghost" id="m-leave">Leave</button>`;
    $('#copy').onclick = async () => {
      const inp = $<HTMLInputElement>('#link');
      try { await navigator.clipboard.writeText(link); $('#copy').textContent = 'Copied'; }
      catch { inp.select(); $('#copy').textContent = 'Select & copy'; }
    };
    if (host) {
      this.bindSeg('#mode', (v) => this.a.settings({ mode: v as Mode }));
      this.bindSeg('#ldiff', (v) => this.a.settings({ difficulty: v as Difficulty }));
      $('#m-start').onclick = () => this.a.start();
    }
    $('#m-leave').onclick = () => { this.a.leave(); history.replaceState(null, '', location.pathname); this.home(); };
  }

  private bindSeg(sel: string, on: (v: string) => void) {
    this.card().querySelectorAll<HTMLButtonElement>(`${sel} .seg-b`).forEach((b) => b.onclick = () => {
      this.card().querySelectorAll<HTMLButtonElement>(`${sel} .seg-b`).forEach((o) => { o.classList.toggle('on', o === b); o.setAttribute('aria-checked', String(o === b)); });
      on(b.dataset.v!);
    });
  }
}
