import type { Difficulty } from './defs';
import type { Command, Snapshot } from './sim';
import type { Mode } from './types';

/**
 * Messages between the phones and the game server.
 * Online games run in lockstep: the server gathers every player's commands for a tick, applies them to its own copy,
 * steps it, and broadcasts the same commands to every phone, which does exactly the same. 10 ticks per second.
 */
export const PROTOCOL = 1;
export const CODE_LEN = 5;

export interface LobbyPlayer { slot: number; name: string; color: string; connected: boolean }
export interface LobbyInfo { code: string; host: number; players: LobbyPlayer[]; mode: Mode; difficulty: Difficulty; started: boolean }

export type ClientMsg =
  | { t: 'create'; name: string; v: number }
  | { t: 'join'; code: string; name: string; token?: string; v: number }
  | { t: 'settings'; mode?: Mode; difficulty?: Difficulty }
  | { t: 'start' }
  | { t: 'cmd'; c: Command }
  | { t: 'hash'; tick: number; h: string }
  | { t: 'pause' }
  | { t: 'leave' };

export type ServerMsg =
  | { t: 'joined'; code: string; slot: number; token: string }
  | { t: 'lobby'; lobby: LobbyInfo }
  | { t: 'start'; snap: Snapshot; you: string }
  /** One lockstep tick: apply these commands in order, then step once. `n` is the tick number after stepping. */
  | { t: 'tick'; n: number; cmds: [string, Command][] }
  | { t: 'snap'; snap: Snapshot }
  | { t: 'paused'; paused: boolean; by: string }
  | { t: 'error'; msg: string; fatal?: boolean };
