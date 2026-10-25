import type { Difficulty } from './defs';
import type { Command, Snapshot } from './sim';
import type { Mode } from './types';

/**
 * Messages between the phones and the game server.
 * Online games run in lockstep: the server gathers every player's commands for a tick, applies them to its own copy,
 * steps it, and broadcasts the same commands to every phone, which does exactly the same. 10 ticks per second.
 */
export const PROTOCOL = 3;
export const CODE_LEN = 5;

/**
 * ai: the caretaker is running this player's co-op while they're away.
 * key: a one-way fingerprint of the seat's secret token. Phones keep the list so any of them can rebuild the room
 * after a server restart, and everyone can still prove which seat is theirs.
 */
export interface LobbyPlayer { slot: number; name: string; color: string; connected: boolean; ai: boolean; key: string }
/** Seconds a player can be away before the caretaker takes over their co-op. */
export const AI_AFTER_S = 120;
/** The caretaker acts every this many ticks (2 s). */
export const AI_EVERY = 20;
export interface LobbyInfo { code: string; host: number; players: LobbyPlayer[]; mode: Mode; difficulty: Difficulty; started: boolean }

export type ClientMsg =
  | { t: 'create'; name: string; v: number }
  | { t: 'join'; code: string; name: string; token?: string; v: number }
  | { t: 'settings'; mode?: Mode; difficulty?: Difficulty }
  | { t: 'start' }
  | { t: 'cmd'; c: Command }
  | { t: 'hash'; tick: number; h: string }
  | { t: 'pause' }
  | { t: 'leave' }
  /** The server restarted and forgot the room: rebuild it from this phone's save, then seat this phone. */
  | { t: 'revive'; code: string; name: string; token: string; v: number; save: RoomSave };

/** What every phone keeps so a room can survive a server restart. */
export interface RoomSave { lobby: LobbyInfo; snap?: Snapshot; at: number }

export type ServerMsg =
  | { t: 'joined'; code: string; slot: number; token: string }
  | { t: 'lobby'; lobby: LobbyInfo }
  | { t: 'start'; snap: Snapshot; you: string }
  /** One lockstep tick: apply these commands in order, then step once. `n` is the tick number after stepping. */
  | { t: 'tick'; n: number; cmds: [string, Command][] }
  | { t: 'snap'; snap: Snapshot }
  | { t: 'paused'; paused: boolean; by: string }
  /** gone: the server doesn't know this room (it may have restarted); a phone with a save can rebuild it. */
  | { t: 'error'; msg: string; fatal?: boolean; gone?: boolean };
