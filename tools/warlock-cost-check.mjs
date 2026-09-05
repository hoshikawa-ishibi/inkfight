import { CHARACTERS, SCENES } from "../src/data/data.js";
import { PARTY_PRESETS } from "../src/core/party.js";
import {
  newExpedition,
  seededRandom,
  relicOffers,
  routeOffers,
  takeRelic,
  chooseRoute,
  launchEncounter,
  resolveEncounter,
  chooseCamp,
  applyExpeditionBattle,
} from "../src/core/expedition.js";
import { runInkBattle } from "./ink-sim.js";
import { readFileSync, writeFileSync } from "node:fs";

const battles = Math.max(2000, Number(process.argv[2]) || 2000);
const journeysPerParty = Math.max(10, Number(process.argv[3]) || 20);
const allVariants = [
  { id: "baseline" },
  { id: "plague2", skill: "瘟疫" },
  { id: "burst2", skill: "腐化爆发" },
  { id: "both2", skill: ["瘟疫", "腐化爆发"] },
  { id: "plague2_groupheal15", skill: "瘟疫", groupHeal: 15 },
  { id: "plague2_herbal85", skill: "瘟疫", herbalMultiplier: 0.85 },
  { id: "plague2_priestheal3", skill: "瘟疫", priestHealCost: 3 },
];
const requested = new Set((process.argv[4] || "").split(",").filter(Boolean));
const variants = requested.size
  ? allVariants.filter((v) => requested.has(v.id))
  : allVariants;
function modify(units, variant) {
  const names = new Set([variant.skill].flat().filter(Boolean));
  for (const u of units) {
    if (u.charId === "warlock")
      for (const s of u.skills) {
        if (s.name === "瘟疫") s.inkCost = names.has("瘟疫") ? 2 : 3;
        if (s.name === "腐化爆发") s.inkCost = names.has("腐化爆发") ? 2 : 3;
      }
    if (u.charId === "herbalist")
      for (const s of u.skills) {
        const old = { 百草汤: 18, 金疮药: 40, 醒神: 16 }[s.name];
        if (old) s.healAmt = old;
        if (s.name === "百草汤" && variant.groupHeal)
          s.healAmt = variant.groupHeal;
        if (s.healAmt && variant.herbalMultiplier)
          s.healAmt = Math.round(s.healAmt * variant.herbalMultiplier);
      }
    if (u.charId === "priest" && variant.priestHealCost)
      u.skills.find((s) => s.name === "治愈之光").inkCost =
        variant.priestHealCost;
  }
}
function shuffle(ids, random) {
  const a = ids.slice();
  for (let i = a.length - 1; i; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function versus(variant) {
  const random = seededRandom("warlock-cost/schedule"),
    ids = CHARACTERS.map((c) => c.id),
    schedule = [];
  const rows = Math.ceil(battles / 2);
  while (schedule.length < rows) {
    const sixteen = shuffle(ids, random);
    for (let half = 0; half < 2 && schedule.length < rows; half++) {
      const eight = sixteen.slice(half * 8, half * 8 + 8);
      schedule.push({
        a: eight.slice(0, 4),
        b: eight.slice(4),
        scene: SCENES[Math.floor(random() * SCENES.length)],
      });
    }
  }
  const chars = Object.fromEntries(
    ids.map((id) => [id, { wins: 0, games: 0, p1: 0, p2: 0 }]),
  );
  let rounds = 0,
    timeouts = 0,
    done = 0,
    p1Wins = 0,
    plague = 0,
    burst = 0,
    linked = 0;
  for (let i = 0; i < schedule.length && done < battles; i++)
    for (const reverse of [false, true]) {
      if (done++ >= battles) break;
      const row = schedule[i],
        p1 = reverse ? row.b : row.a,
        p2 = reverse ? row.a : row.b;
      const r = runInkBattle(p1, p2, row.scene, {
        random: seededRandom(`warlock-cost/${i}/${reverse}`),
        beforeBattle: ({ p1, p2 }) => modify([...p1, ...p2], variant),
      });
      rounds += r.rounds;
      timeouts += Number(r.timeout);
      p1Wins += Number(r.winner === 1);
      const winners = r.winner === 1 ? p1 : p2;
      for (const id of p1) {
        chars[id].games++;
        chars[id].p1++;
      }
      for (const id of p2) {
        chars[id].games++;
        chars[id].p2++;
      }
      for (const id of winners) chars[id].wins++;
      const wa = r.actions.filter((a) => a.charId === "warlock");
      plague += wa.filter((a) => a.skillName === "瘟疫").length;
      burst += wa.filter((a) => a.skillName === "腐化爆发").length;
      if (
        wa.some(
          (a, x) =>
            a.skillName === "腐化爆发" &&
            wa.slice(0, x).some((b) => b.skillName === "瘟疫"),
        )
      )
        linked++;
    }
  const table = Object.fromEntries(
    Object.entries(chars).map(([id, x]) => [
      id,
      {
        games: x.games,
        p1: x.p1,
        p2: x.p2,
        wins: x.wins,
        winPct: +((x.wins / x.games) * 100).toFixed(2),
      },
    ]),
  );
  const rates = Object.values(table).map((x) => x.winPct),
    samples = Object.values(table).map((x) => x.games);
  return {
    battles,
    p1WinPct: +((p1Wins / battles) * 100).toFixed(2),
    warlockWin: table.warlock.winPct,
    range: [Math.min(...rates), Math.max(...rates)],
    sampleRange: [Math.min(...samples), Math.max(...samples)],
    avgRounds: +(rounds / battles).toFixed(2),
    timeoutPct: +((timeouts / battles) * 100).toFixed(2),
    plague,
    burst,
    plagueThenBurstBattles: linked,
    characters: table,
  };
}

function expedition(variant) {
  const parties = {};
  let completed = 0,
    total = 0,
    rounds = 0,
    battleCount = 0,
    timeouts = 0;
  for (const party of PARTY_PRESETS) {
    let wins = 0;
    for (let i = 0; i < journeysPerParty; i++) {
      total++;
      const run = newExpedition({
        partyId: party.id,
        seed: `warlock-cost/${party.id}/${i}`,
      });
      takeRelic(run, ["flow", "heavy", "reserve"][i % 3]);
      while (run.phase === "route") {
        chooseRoute(run, routeOffers(run)[0].id);
        launchEncounter(run);
        const scene = SCENES.find((s) => s.id === run.activeRoute.sceneId);
        const result = runInkBattle(
          run.team.map((t) => t.charId),
          run.activeRoute.enemyIds,
          scene,
          {
            relics: run.relics,
            p1Noise: 12,
            p2Noise: 12,
            random: seededRandom(`${run.seed}/${run.battleIndex}/combat`),
            beforeBattle: ({ p1, p2 }) => {
              applyExpeditionBattle(run, p1, p2);
              modify([...p1, ...p2], variant);
            },
          },
        );
        rounds += result.rounds;
        battleCount++;
        timeouts += Number(result.timeout);
        resolveEncounter(run, result);
        if (run.phase === "complete") {
          wins++;
          completed++;
          break;
        }
        while (run.phase === "reward") {
          const offers = relicOffers(run);
          if (!offers.length) break;
          takeRelic(run, offers[0].id);
        }
        if (run.phase === "camp") chooseCamp(run, "rest");
      }
    }
    parties[party.id] = +((wins / journeysPerParty) * 100).toFixed(1);
  }
  return {
    runs: total,
    firstThree: +(
      PARTY_PRESETS.slice(0, 3).reduce((n, p) => n + parties[p.id], 0) / 3
    ).toFixed(1),
    allTen: +((completed / total) * 100).toFixed(1),
    parties,
    avgBattleRounds: +(rounds / battleCount).toFixed(2),
    timeoutPct: +((timeouts / battleCount) * 100).toFixed(2),
  };
}

const outputUrl = new URL("../docs/shared-ink-balance.json", import.meta.url);
let results = {};
try {
  results = JSON.parse(readFileSync(outputUrl, "utf8")).results || {};
} catch {}
for (const variant of variants) {
  console.error(`running ${variant.id}`);
  results[variant.id] = {
    versus: versus(variant),
    expedition: expedition(variant),
  };
}
const baseline = results.baseline,
  plague2 = results.plague2,
  herbal85 = results.plague2_herbal85;
const reason =
  baseline && plague2 && herbal85
    ? `Plague 2 raises warlock from ${baseline.versus.warlockWin}% to ${plague2.versus.warlockWin}% without a stat buff. Herbalist healing at 85% narrows the measured roster range from ${plague2.versus.range.join("–")} to ${herbal85.versus.range.join("–")} while changing all-preset expedition completion from ${plague2.expedition.allTen}% to ${herbal85.expedition.allTen}% in the ${journeysPerParty}-seed-per-preset comparison.`
    : "Run the baseline, plague2, and plague2_herbal85 variants together before making the final comparison.";
const report = {
  methodology: {
    rules: "shared ink, hard noise 0, deterministic combat",
    schedule:
      "A seeded permutation is split across each pair of 4v4 matchups, then every matchup is played in both directions. At 2000 battles every character appears in exactly 1000 games: 500 as p1 and 500 as p2.",
    battlesPerVariant: battles,
    journeysPerParty,
    expedition:
      "Each result records its own run count. Fixed seeds, normal route, healing camp, symmetric skill changes for player and enemies.",
  },
  candidates: {
    baseline: "old plague 3 / burst 3",
    plague2: "plague 2 only",
    burst2: "burst 2 only",
    both2: "plague and burst 2",
    plague2_groupheal15: "plague 2 plus 百草汤 18→15",
    plague2_herbal85:
      "plague 2 plus all herbalist active healing ×0.85 rounded",
    plague2_priestheal3: "plague 2 plus 治愈之光 2→3 ink",
  },
  decision: {
    landed: ["瘟疫 inkCost 3→2", "医仙主动治疗量 18/40/16→15/34/14"],
    reason,
    limits:
      "Character rates measure hard-noise-0 AI policy on a fixed schedule, not human mastery. The schedule observed a P1 advantage; its cause was not isolated by this experiment. Roster exposure is exactly balanced across p1/p2.",
  },
  results,
};
writeFileSync(outputUrl, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
