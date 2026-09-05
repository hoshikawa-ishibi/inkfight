import { CHARACTERS, SCENES } from "../src/data/data.js";
import { teamSizeFor } from "../src/core/state.js";
import { runInkBattle } from "./ink-sim.js";
export { executeSkill } from "../src/core/skill-executor.js";

const MAX_ROUNDS = 120;
export function simOneBattle(p1ids, p2ids, scene, opts = {}) {
  return runInkBattle(p1ids, p2ids, scene, {
    ...opts,
    p1Noise: opts.p1Noise ?? opts.p1Ai?.inkNoise ?? 0,
    p2Noise: opts.p2Noise ?? opts.p2Ai?.inkNoise ?? 0,
    maxRounds: opts.maxRounds || MAX_ROUNDS,
  });
}

export function shuffle(arr) {
  const r = arr.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

function randomPicks() {
  const ids = CHARACTERS.map((c) => c.id),
    n = teamSizeFor("ai");
  return [shuffle(ids).slice(0, n), shuffle(ids).slice(0, n)];
}

export function runSimulation(totalRounds, onProgress, onDone) {
  const charStats = {};
  for (const c of CHARACTERS)
    charStats[c.id] = { wins: 0, games: 0, name: c.name };
  let done = 0,
    totalBattleRounds = 0,
    timeouts = 0;
  const runBatch = () => {
    const end = Math.min(done + 500, totalRounds);
    for (; done < end; done++) {
      const scene = SCENES[Math.floor(Math.random() * SCENES.length)];
      const [p1ids, p2ids] = randomPicks();
      const { winner, rounds, timeout } = simOneBattle(p1ids, p2ids, scene);
      totalBattleRounds += rounds;
      if (timeout) timeouts++;
      for (const id of [...p1ids, ...p2ids]) charStats[id].games++;
      for (const id of winner === 1 ? p1ids : p2ids) charStats[id].wins++;
    }
    onProgress(done, totalRounds);
    if (done < totalRounds) setTimeout(runBatch, 0);
    else
      onDone(charStats, {
        avgRounds: totalBattleRounds / totalRounds,
        timeoutPct: (timeouts / totalRounds) * 100,
      });
  };
  setTimeout(runBatch, 0);
}
