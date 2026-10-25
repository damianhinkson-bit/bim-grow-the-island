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
  solo(d: Difficulty, bots: number): void;
  create(name: string): void;
  join(name: string, code: string): void;
  settings(m: { mode?: Mode; difficulty?: Difficulty }): void;
  start(): void;
  leave(): void;
}

const seg = (id: string, opts: [string, string, string][], on: string) =>
  `<div class="seg" id="${id}" role="radiogroup">${opts.map(([v, l, sub]) => `<button class="seg-b${v === on ? ' on' : ''}" role="radio" aria-checked="${v === on}" data-v="${v}">${l}${sub ? `<small>${sub}</small>` : ""}</button>`).join('')}</div>`;
const DIFF_OPTS: [string, string, string][] = [['easy', 'Easy', 'Slow, lots of warning'], ['normal', 'Normal', 'A fair race'], ['hard', 'Hard', 'Buys fast']];
/** Just the names, for the compact difficulty row; the hint under it explains the one picked. */
const DIFF_SMALL = DIFF_OPTS.map(([v, l]) => [v, l, ''] as [string, string, string]);

const botsHint = (n: number) => n === 0 ? 'Just you against AgroCorp.' : `Race ${n === 1 ? 'one computer co-op' : `${n} computer co-ops`} to feed the island, with AgroCorp after everyone's land.`;

/** The start screen and the online lobby, drawn into the overlay card. */
export class Menu {
  private difficulty: Difficulty = 'normal';
  /** Computer co-ops racing you in a solo game. */
  private bots = Math.max(0, Math.min(3, Number(store.get('bim:bots') ?? 1) || 0));
  /** Players seen in the current lobby and when they first appeared. */
  private seen = new Map<string, number>();
  private baseTitle = document.title;
  constructor(private a: MenuActions) {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(() => (document.title = this.baseTitle), 4000); });
  }
  /** Someone joined: buzz the phone and put their name in the tab title, so you notice even from another app. */
  private arrived(name: string) {
    try { navigator.vibrate?.([120, 80, 120]); } catch { /* not supported */ }
    document.title = `${name} joined · Bim`;
    if (document.visibilityState === 'visible') setTimeout(() => (document.title = this.baseTitle), 5000);
  }
  resetLobby() { this.seen.clear(); document.title = this.baseTitle; }

  private card() { return $('#card'); }
  show() { $('#overlay').hidden = false; }
  hide() { const o = $('#overlay'); o.hidden = true; o.classList.remove('poster', 'dim', 'bare'); this.card().classList.remove('home', 'open'); }

  home(note?: string) {
    this.show(); this.resetLobby();
    const params = new URLSearchParams(location.search);
    const code = (params.get('room') ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
    const name = store.get('bim:name') ?? '';
    if (code && ONLINE && !this.soloInstead) { this.invite(code, name, note); return; }
    // the start screen is the poster itself: pick solo or online, then the few settings that go with it
    this.poster(false);
    this.card().classList.add('home');
    const diffHint = (d: string) => DIFF_OPTS.find(([v]) => v === d)![2];
    this.card().innerHTML = `
      <div class="hposter" role="img" aria-label="Barbados: heroes of the island's history and today"><div class="presents">Damian Grows presents</div></div>
      <div class="hbottom">
        <h1 class="ptitle">Grow the Island</h1>
        ${note ? `<p class="note">${esc(note)}</p>` : ''}
        <div class="hstep" data-step="pick">
          <div class="pick2">
            <button class="btn primary" data-go="solo">Play solo</button>
            <button class="btn gold-ghost" data-go="online">Play online</button>
          </div>
          <div class="hlinks"><button class="linkbtn" data-go="how">How to play</button></div>
        </div>
        <div class="hstep" data-step="solo" hidden>
          <div class="diffrow">${seg('difficulty', DIFF_SMALL, this.difficulty)}</div>
          <p class="hint" id="diff-hint">${esc(diffHint(this.difficulty))}</p>
          <div class="diffrow stack"><span class="kicker">Computer co-ops racing you</span>${seg('bots', ['0', '1', '2', '3'].map((v) => [v, v, ''] as [string, string, string]), String(this.bots))}</div>
          <p class="hint" id="bots-hint">${esc(botsHint(this.bots))}</p>
          <button class="btn primary" id="go-solo">Start growing</button>
          <div class="hlinks"><button class="linkbtn" data-go="pick">Back</button></div>
        </div>
        <div class="hstep" data-step="online" hidden>
          ${ONLINE ? `
          <label class="field" for="nm">Your name<input id="nm" maxlength="16" autocomplete="nickname" placeholder="e.g. Damian" value="${esc(name)}"></label>
          <button class="btn primary" id="go-create">Create a game</button>
          <div class="or">or join a friend's game</div>
          <div class="joinrow"><input id="code" maxlength="5" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="CODE" value="${code}" aria-label="Game code"><button class="btn" id="go-join">Join</button></div>
          <p class="hint">Up to ${MAX_PLAYERS} players. Play together against AgroCorp, or race each other.</p>`
          : `<p class="hint">Online play works from the hosted game link, not this preview. Ask Damian for the link.</p>`}
          <div class="hlinks"><button class="linkbtn" data-go="pick">Back</button></div>
        </div>
        <div class="hstep how" data-step="how" hidden>
          <p class="sub">Grow food for Barbados. Feed <strong>6 of the 11 parishes</strong> and grow through five ages to the <strong>Co-op Age</strong> before AgroCorp buys up the island.</p>
          <ul>
            <li><strong>Tap a worker</strong>, then tap breadfruit, coral stone, a spring or flying fish to gather.</li>
            <li><strong>Build</strong> houses, farms, roads and seawalls; trade at the port and airport.</li>
            <li><strong>Tap a parish</strong> next to yours to feed it and win it over.</li>
            <li><strong>Money (BBD)</strong> comes from co-op dues in every parish you feed, and from selling food.</li>
            <li>Drag to pan. Pinch or scroll to zoom.</li>
          </ul>
          <div class="hlinks"><button class="linkbtn" data-go="pick">Back</button></div>
        </div>
        <p class="credit">Parish borders: geoBoundaries / Wikimedia Commons, CC BY 2.5.</p>
      </div>`;
    const go = (step: string) => {
      this.card().querySelectorAll<HTMLElement>('.hstep').forEach((el) => (el.hidden = el.dataset.step !== step));
      this.card().classList.toggle('open', step !== 'pick');
    };
    this.card().querySelectorAll<HTMLButtonElement>('[data-go]').forEach((b) => (b.onclick = () => go(b.dataset.go!)));
    this.bindSeg('#difficulty', (v) => { this.difficulty = v as Difficulty; $('#diff-hint').textContent = diffHint(v); });
    this.bindSeg('#bots', (v) => { this.bots = Number(v); store.set('bim:bots', v); $('#bots-hint').textContent = botsHint(this.bots); });
    $('#go-solo').onclick = () => this.a.solo(this.difficulty, this.bots);
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
      if (code) go('online');
    }
  }

  /** Puts the poster behind the menu; `dim` darkens it under the lobby and invite cards so their text stays readable. */
  private poster(dim: boolean) {
    const o = $('#overlay'); o.classList.add('poster'); o.classList.toggle('dim', dim); o.classList.toggle('bare', !dim);
    this.card().classList.remove('home', 'open');
  }

  /** Set when someone opened an invite link but chose to play solo instead. */
  private soloInstead = false;
  /** Opened from an invite link: one clear job, joining that game. */
  private invite(code: string, name: string, note?: string) {
    this.poster(true);
    this.card().innerHTML = `<div class="flag"><i></i><i></i><i></i></div>
      <div class="kicker">You're invited to</div>
      <h1>Bim: Grow the Island</h1>
      <p class="sub">A friend is waiting for you in their game. Grow food for Barbados together.</p>
      ${note ? `<p class="note">${esc(note)}</p>` : ''}
      <div class="kicker">Game code</div>
      <div class="bigcode">${esc(code)}</div>
      <label class="field" for="nm">Your name<input id="nm" maxlength="16" autocomplete="nickname" placeholder="e.g. Kemar" value="${esc(name)}"></label>
      <button class="btn primary big" id="go-join">Join the game</button>
      <button class="linkbtn" id="go-solo-instead">Play solo instead</button>`;
    const go = () => {
      const v = $<HTMLInputElement>('#nm').value.trim();
      if (!v) { $<HTMLInputElement>('#nm').focus(); $<HTMLInputElement>('#nm').placeholder = 'Type your name first'; return; }
      store.set('bim:name', v);
      this.waiting('Joining…'); this.a.join(v, code);
    };
    $('#go-join').onclick = go;
    $<HTMLInputElement>('#nm').onkeydown = (e) => { if (e.key === 'Enter') go(); };
    $('#go-solo-instead').onclick = () => { this.soloInstead = true; history.replaceState(null, '', location.pathname); this.home(); };
  }

  waiting(msg: string) { this.show(); this.poster(true); this.card().innerHTML = `<div class="flag"><i></i><i></i><i></i></div><h1 style="font-size:28px">${esc(msg)}</h1><p class="sub">The server may take up to a minute to wake up the first time.</p><button class="btn" id="m-back">Back</button>`; $('#m-back').onclick = () => { this.a.leave(); this.home(); }; }

  lobby(l: LobbyInfo, mySlot: number) {
    this.show(); this.poster(true);
    const host = l.host === mySlot;
    const link = `${location.origin}${location.pathname}?room=${l.code}`;
    const canShare = typeof navigator.share === 'function';
    const modeName = l.mode === 'coop' ? 'Co-op vs AgroCorp' : 'Versus';
    const away = l.players.filter((p) => !p.connected).map((p) => p.name);
    // who arrived since the last lobby update: highlight them, and buzz the phone if it's someone else
    const now = Date.now();
    for (const p of l.players) if (!this.seen.has(p.name)) { this.seen.set(p.name, now); if (p.slot !== mySlot && this.seen.size > 1) this.arrived(p.name); }
    const fresh = (n: string) => now - (this.seen.get(n) ?? 0) < 8000 && this.seen.size > 1;
    const seats = Array.from({ length: MAX_PLAYERS }, (_, k) => {
      const p = l.players[k];
      return p ? `<li${fresh(p.name) && p.slot !== mySlot ? ' class="new"' : ''}><span class="sw" style="background:${p.color}"></span><span>${esc(p.name)}${p.slot === mySlot ? ' <em>(you)</em>' : ''}${p.slot === l.host ? ' <em>· host</em>' : ''}</span>${p.connected ? (fresh(p.name) && p.slot !== mySlot ? '<span class="pill good">just joined</span>' : '') : '<span class="pill warn">offline</span>'}</li>`
        : '<li class="empty"><span class="sw"></span><span>Open seat</span></li>';
    }).join('');
    this.card().innerHTML = `<div class="flag"><i></i><i></i><i></i></div>
      <div class="kicker">Game code</div>
      <div class="bigcode" aria-label="Game code ${l.code.split('').join(' ')}">${l.code}</div>
      ${canShare ? '<button class="btn primary big" id="share">Share invite</button>' : ''}
      <div class="joinrow"><input id="link" readonly value="${esc(link)}" aria-label="Invite link"><button class="btn" id="copy">Copy link</button></div>
      <p class="hint">Send the invite. Your friends tap the link and press <strong>Join the game</strong>, or open the game, tap Play online and type the code.</p>
      <ul class="seats">${seats}</ul>
      ${host ? `<div class="kicker">Mode</div>${seg('mode', [['coop', 'Co-op', 'Together vs AgroCorp'], ['versus', 'Versus', 'Race each other']], l.mode)}
        <div class="kicker">Difficulty</div>${seg('ldiff', DIFF_SMALL, l.difficulty).replace('class="seg"', 'class="seg small"')}
        <button class="btn primary" id="m-start"${(l.mode === 'versus' && l.players.length < 2) || away.length ? ' disabled' : ''}>${away.length ? `Waiting for ${esc(away.join(' and '))} to come back…` : 'Start the game'}</button>`
        : `<p class="sub"><strong>${modeName}</strong> · ${DIFFICULTY[l.difficulty].label}. Waiting for the host to start…</p>`}
      <button class="btn ghost" id="m-leave">Leave</button>`;
    const inviteText = `Join my game of Bim: Grow the Island! Tap the link and press Join (code ${l.code}).`;
    if (canShare) $('#share').onclick = async () => {
      try { await navigator.share({ title: 'Bim: Grow the Island', text: inviteText, url: link }); } catch { /* closed the share sheet */ }
    };
    $('#copy').onclick = async () => {
      const inp = $<HTMLInputElement>('#link');
      try { await navigator.clipboard.writeText(`${inviteText} ${link}`); $('#copy').textContent = 'Copied'; }
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
