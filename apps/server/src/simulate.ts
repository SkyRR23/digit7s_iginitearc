import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { originalPrototypePreset, type BotDifficulty, type Outcome } from '@ashfall/shared';
import { createDay } from '@ashfall/shared/day';
import { dealIdentities } from '@ashfall/shared/identities';
import { RoomStore } from './rooms.js';

function seededIndex(seed: number): (max: number) => number {
  let state = seed >>> 0 || 1;
  return max => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor(state / 4294967296 * max);
  };
}

export interface BotGameResult {
  seed: number;
  outcome: Outcome | null;
  transitions: number;
  stuck: boolean;
  failures: number;
}

export function runBotGame(seed: number, difficulty: BotDifficulty = 'NORMAL', maxTransitions = 20_000): BotGameResult {
  let clock = 1_000; const randomIndex = seededIndex(seed);
  const store = new RoomStore(() => {}, () => {}, 60_000, () => clock,
    (identity, now) => createDay(identity, originalPrototypePreset, randomIndex, randomUUID, now),
    ids => dealIdentities(ids, originalPrototypePreset, randomIndex, randomUUID),
    randomIndex, { fast: true, seed, messages: false });
  const code = store.createBotSimulation(difficulty);
  let transitions = 0; let stuck = false;
  try {
    while (transitions < maxTransitions) {
      const actions = store.tickBots(Math.min(1_000, maxTransitions - transitions));
      transitions += actions;
      const status = store.simulationStatus(code);
      if (!status) { stuck = true; break; }
      if (status.phase === 'GAME_OVER')
        return { seed, outcome: status.outcome, transitions, stuck: false, failures: store.botFailures.length };
      if (actions === 0) {
        if (status.deadline === null) { stuck = true; break; }
        clock = Math.max(clock, status.deadline);
        store.sweep(); transitions++;
      }
    }
    return { seed, outcome: store.simulationStatus(code)?.outcome ?? null, transitions,
      stuck: stuck || transitions >= maxTransitions, failures: store.botFailures.length };
  } finally {
    store.removeSimulation(code); store.dispose();
  }
}

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const games = Math.max(1, Number.parseInt(argument('--games', '100'), 10));
  const seed = Number.parseInt(argument('--seed', '20261016'), 10) >>> 0;
  const difficulty = argument('--difficulty', 'NORMAL').toUpperCase() === 'EASY' ? 'EASY' : 'NORMAL';
  const results: BotGameResult[] = [];
  for (let index = 0; index < games; index++) {
    const gameSeed = (seed + index) >>> 0;
    try { results.push(runBotGame(gameSeed, difficulty)); }
    catch (error) {
      results.push({ seed: gameSeed, outcome: null, transitions: 0, stuck: true, failures: 1 });
      console.error(`Seed ${gameSeed} crashed:`, error instanceof Error ? error.message : error);
    }
  }
  const humans = results.filter(result => result.outcome?.winner === 'HUMAN').length;
  const witches = results.filter(result => result.outcome?.winner === 'WITCH').length;
  const stuck = results.filter(result => result.stuck).length;
  const failures = results.reduce((total, result) => total + result.failures, 0);
  const longest = Math.max(...results.map(result => result.transitions));
  console.log(`Bot simulation: ${games} games, seed ${seed}, difficulty ${difficulty}`);
  console.log(`Human wins: ${humans}; Witch wins: ${witches}; stuck/crashed: ${stuck}; invalid bot actions: ${failures}; longest run: ${longest} transitions.`);
  if (stuck || failures || humans + witches !== games) {
    console.error(`Failing seeds: ${results.filter(result => result.stuck || result.failures || !result.outcome).map(result => result.seed).join(', ')}`);
    process.exitCode = 1;
  }
}
