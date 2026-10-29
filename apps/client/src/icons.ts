/**
 * Small inline icons for the top bar, pop-ups and panel headers. Drawn on a 20x20 grid, shown at 16-18 px.
 * Each is a complete <svg>, coloured for a dark background, and hidden from screen readers (labels carry the meaning).
 */
const svg = (body: string) => `<svg class="ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false">${body}</svg>`;

export const ICON = {
  /** breadfruit: round green fruit with a bumpy skin and a leaf */
  food: svg('<path d="M10.5 4.2c1.6-2.2 4.2-2.6 5.6-2-0.4 1.9-2.4 3.3-5.1 3.3z" fill="#4E9A3A"/><circle cx="9.5" cy="11.5" r="6.6" fill="#8CC63F"/><circle cx="9.5" cy="11.5" r="6.6" fill="none" stroke="#5E8F25" stroke-width="1"/><g fill="#5E8F25"><circle cx="7" cy="9.5" r=".9"/><circle cx="10.5" cy="8.6" r=".9"/><circle cx="12.6" cy="11.6" r=".9"/><circle cx="8.6" cy="12.6" r=".9"/><circle cx="6.4" cy="14.6" r=".9"/><circle cx="11" cy="15" r=".9"/></g>'),
  /** water drop */
  water: svg('<path d="M10 2.2C10 2.2 4.4 8.6 4.4 12.4a5.6 5.6 0 0 0 11.2 0C15.6 8.6 10 2.2 10 2.2z" fill="#5BC0EB"/><path d="M7.2 12.6a2.9 2.9 0 0 0 2.4 2.9" fill="none" stroke="#E8F8FF" stroke-width="1.4" stroke-linecap="round"/>'),
  /** a cut block of coral stone */
  stone: svg('<path d="M3 7.5 10 4l7 3.5v6.8L10 18l-7-3.7z" fill="#E7E0CC"/><path d="M10 11v7l7-3.7V7.5z" fill="#BFB399"/><path d="M3 7.5 10 11l7-3.5" fill="none" stroke="#9E9378" stroke-width=".8"/><g fill="#B4A98F"><circle cx="6" cy="11" r=".8"/><circle cx="7.6" cy="14" r=".7"/><circle cx="13" cy="13.6" r=".7" fill="#968B70"/></g>'),
  /** a person */
  people: svg('<circle cx="10" cy="6.2" r="3.4" fill="#F2A7C3"/><path d="M3.8 18c0-3.9 2.8-6.6 6.2-6.6s6.2 2.7 6.2 6.6z" fill="#F2A7C3"/>'),
  /** a gold Barbados dollar coin with a trident */
  bbd: svg('<circle cx="10" cy="10" r="8.4" fill="#FFC726"/><circle cx="10" cy="10" r="6.6" fill="none" stroke="#C9921A" stroke-width="1"/><path d="M10 5.2v9.6M6.8 6.6v2.3c0 1.6 1.4 2.5 3.2 2.5s3.2-.9 3.2-2.5V6.6" fill="none" stroke="#7A5310" stroke-width="1.5" stroke-linecap="round"/>'),
  /** a sprouting seedling, for ages */
  age: svg('<path d="M10 18V9" stroke="#8CC63F" stroke-width="1.8" stroke-linecap="round"/><path d="M10 10.5C9.6 6.6 6.6 4.6 3 4.8c.2 3.6 3 6 7 5.7z" fill="#6CC24A"/><path d="M10 9C10.6 5 13.6 2.8 17.2 3c-.2 3.8-3.2 6.4-7.2 6z" fill="#8CC63F"/>'),
  /** hurricane swirl */
  storm: svg('<path d="M10 3.2a6.8 6.8 0 0 1 6.8 6.4M10 16.8a6.8 6.8 0 0 1-6.8-6.4" fill="none" stroke="#9FD3F0" stroke-width="2.2" stroke-linecap="round"/><circle cx="10" cy="10" r="3" fill="none" stroke="#9FD3F0" stroke-width="2.2"/>'),
  /** sun, for drought */
  sun: svg('<circle cx="10" cy="10" r="4" fill="#FFB03A"/><g stroke="#FFB03A" stroke-width="1.6" stroke-linecap="round"><path d="M10 1.8v2.2M10 16v2.2M1.8 10H4M16 10h2.2M4.2 4.2l1.6 1.6M14.2 14.2l1.6 1.6M4.2 15.8l1.6-1.6M14.2 5.8l1.6-1.6"/></g>'),
  /** a flag on land, for parishes */
  parish: svg('<path d="M5 18V2.8" stroke="#F3F6FF" stroke-width="1.6" stroke-linecap="round"/><path d="M5.6 3.4h10l-2.6 3.4 2.6 3.4h-10z" fill="#FFC726"/>'),
  /** factory with a smokestack, for AgroCorp */
  agro: svg('<path d="M2.5 17.5V9.5l4.5 2.6V9.5l4.5 2.6V5h3.2v12.5z" fill="#E2553F"/><path d="M12.6 3.6c.6-1.2 2-1.6 3-1" fill="none" stroke="#B9C2D6" stroke-width="1.2" stroke-linecap="round"/><g fill="#FFD9D2"><rect x="4.4" y="13.6" width="1.8" height="1.8"/><rect x="8.8" y="13.6" width="1.8" height="1.8"/></g>'),
  /** players */
  players: svg('<circle cx="7" cy="6.6" r="2.8" fill="#3FD0C9"/><path d="M2.2 16.6c0-3.2 2.1-5.4 4.8-5.4s4.8 2.2 4.8 5.4z" fill="#3FD0C9"/><circle cx="13.6" cy="7.6" r="2.5" fill="#FF7AC8"/><path d="M9.6 16.6c.3-2.9 1.9-4.6 4-4.6 2.4 0 4.2 1.9 4.2 4.6z" fill="#FF7AC8"/>'),
  /** a crosshair, for "show me on the map" */
  locate: svg('<circle cx="10" cy="10" r="5.4" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="10" cy="10" r="1.6" fill="currentColor"/><path d="M10 1.8v3M10 15.2v3M1.8 10h3M15.2 10h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'),
  /** a worker with a hoe */
  worker: svg('<circle cx="9" cy="5" r="2.8" fill="#F3F6FF"/><path d="M4.4 17.6c0-3.6 2-6.2 4.6-6.2s4.6 2.6 4.6 6.2z" fill="#F3F6FF"/><path d="M15.6 6.4v11.2M13.4 7l4.4-1.4" stroke="#C9A66B" stroke-width="1.5" stroke-linecap="round"/>'),
  /** a house */
  house: svg('<path d="M2.6 9.6 10 3.2l7.4 6.4" fill="none" stroke="#FFC726" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/><path d="M4.6 9v8.4h10.8V9L10 4.6z" fill="#F4A6B8"/><rect x="8.4" y="12" width="3.2" height="5.4" fill="#5A3A22"/>'),
  /** a tree, for resources on the map */
  tree: svg('<rect x="9" y="11" width="2" height="7" fill="#6B4A2B"/><circle cx="10" cy="8.4" r="6" fill="#3E9A3E"/><g fill="#C3DD5E"><circle cx="7.6" cy="7.6" r="1.1"/><circle cx="12.2" cy="9" r="1.1"/><circle cx="10" cy="5.4" r="1.1"/></g>'),
} as const;

export type IconName = keyof typeof ICON;
