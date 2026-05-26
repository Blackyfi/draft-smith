// Dev-only mock of Riot's Live Client Data API, for verifying the full FE↔Rust loop without
// launching League (PROJECT_SPEC §9, M4 verify bar). It serves the *same* captured `/allgamedata`
// fixture the Rust tests use, over HTTPS on 127.0.0.1:2999 with a freshly-minted self-signed cert
// — exactly the shape the production `LiveClient` expects (it accepts that self-signed cert, scoped
// to this origin). Run it, then `npm run tauri dev`, and watch the build re-rank live.
//
// It does NOT touch production code: the app talks to it precisely because :2999 is the real Live
// Client origin. It starts the board from a *fresh game* at ~0:15 — every player stripped to empty
// items, the scoreboard wiped to 0/0/0, the active player back at level 1 — so you see the true
// opening, from-scratch recommendation first (no builds, nobody "fed"). It then walks a scripted
// timeline that feeds the captured builds back in, ramps a couple of enemies' KDA up to "fed", and
// layers on extra purchases. Each step introduces a *new* threat signal the engine reacts to (→ a
// recommendation update and a build-shift toast). The game clock advances on every response, while
// the roster/items stay put between steps — which also exercises the poller's diff (clock drift
// must NOT trigger a recompute).
//
// Usage:  node scripts/mock-live-server.mjs   (or `npm run mock`)

import { createServer } from "node:https";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import selfsigned from "selfsigned";

const HOST = "127.0.0.1";
const PORT = 2999;
const STEP_INTERVAL_MS = 7000; // advance the purchase timeline every 7s (poller fires every 3s).

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(
  here,
  "..",
  "src-tauri",
  "src",
  "live_client",
  "fixtures",
  "allgamedata.json",
);

/** Deep-clones the captured fixture so each mutation step builds on the last without aliasing. */
const baseData = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
const state = structuredClone(baseData);

// ---------- Fresh-game reset --------------------------------------------------------
// The captured fixture is a *mid-game* snapshot: everyone already owns items, so the first
// recommendation the app would show is already "evolved." To demo a game from the opening whistle,
// stash each player's captured loadout, then strip the board bare and feed those items back in over
// the timeline. Now the app shows the from-scratch recommendation first, then re-ranks as the lobby
// fills in its builds.
const FRESH_START_GAMETIME = 15; // ~0:15 — minions haven't even met; truly the opening seconds.
const capturedLoadouts = state.allPlayers.map((p) => ({
  championName: p.championName,
  items: p.items,
}));
state.allPlayers.forEach((p) => {
  p.items = [];
  // Fresh game: nobody has farmed or fought yet, so the scoreboard starts clean. The captured
  // fixture is a mid-game snapshot already snowballed (Zed 4/2, Darius 3/1); without wiping it,
  // both would read as "Fed" from the opening whistle. KDA is ramped back up over the Act 2
  // timeline so you can watch the Fed pills (and the resulting build/focus shift) appear live.
  p.scores = { kills: 0, deaths: 0, assists: 0, creepScore: 0, wardScore: 0 };
});
state.gameData.gameTime = FRESH_START_GAMETIME;

const baseGameTime = state.gameData.gameTime;
const startedAt = Date.now();

// ---------- Skill-order progression --------------------------------------------------
// Reset activePlayer to level 1 / no ability points spent so the SkillStrip demo starts
// from the very beginning and visibly advances through levels. The fixture has the abilities
// object; we keep the displayNames from it and zero out the levels.
const fixtureAbilities = baseData.activePlayer.abilities;
state.activePlayer.level = 1;
state.activePlayer.abilities = {
  Passive: { ...fixtureAbilities.Passive },
  Q: { ...fixtureAbilities.Q, abilityLevel: 0 },
  W: { ...fixtureAbilities.W, abilityLevel: 0 },
  E: { ...fixtureAbilities.E, abilityLevel: 0 },
  R: { ...fixtureAbilities.R, abilityLevel: 0 },
};

/**
 * Scripted level-up sequence for a standard Q>W>E>R>Q>Q skill order.
 * Each entry is [level, slot] — when the player reaches `level`, put a point in `slot`.
 * R is taken at 6, 11, 16 (the three ult ranks); Q is maxed first, then W, then E.
 *
 *  Level | Slot
 *  ------|-----
 *    1   | Q
 *    2   | W
 *    3   | E
 *    4   | Q
 *    5   | Q
 *    6   | R
 *    7   | Q
 *    8   | W
 *    9   | Q  (Q max — 5 ranks)
 *   10   | W
 *   11   | R
 *   12   | W
 *   13   | W  (W max — 5 ranks)
 *   14   | E
 *   15   | E
 *   16   | R
 *   17   | E
 *   18   | E  (E max — 5 ranks)
 */
const LEVEL_SKILL_ORDER = [
  [1, "Q"], [2, "W"], [3, "E"], [4, "Q"], [5, "Q"],
  [6, "R"], [7, "Q"], [8, "W"], [9, "Q"], [10, "W"],
  [11, "R"], [12, "W"], [13, "W"], [14, "E"], [15, "E"],
  [16, "R"], [17, "E"], [18, "E"],
];

/** Level up the activePlayer by one and assign the scripted ability point. */
function levelUp() {
  const newLevel = state.activePlayer.level + 1;
  if (newLevel > 18) return;
  state.activePlayer.level = newLevel;
  const entry = LEVEL_SKILL_ORDER.find(([lvl]) => lvl === newLevel);
  if (entry) {
    const slot = entry[1];
    state.activePlayer.abilities[slot].abilityLevel += 1;
    console.log(
      `  Ahri leveled to ${newLevel} — +1 in ${slot} ` +
        `(now rank ${state.activePlayer.abilities[slot].abilityLevel})`,
    );
  }
}

// Level up every STEP_INTERVAL_MS (same cadence as purchases) to keep the demo snappy.
// We interleave the level-up loop with the purchase timeline so both progress together.

// ---------- Appends an item to an enemy (by champion name) unless they already own it. ----
function buy(championName, itemID, displayName) {
  const player = state.allPlayers.find((p) => p.championName === championName);
  if (!player) return;
  if (player.items.some((i) => i.itemID === itemID)) return;
  const slot = player.items.length;
  player.items.push({ itemID, count: 1, slot, displayName });
  console.log(`  ${championName} bought ${displayName} (${itemID})`);
}

// ---------- Bumps a champion's scoreline by the given deltas (drives the "Fed" signal). ----
// NOTE: the poller's diff signature is built from items/level/abilities — not KDA — so a scoreline
// change alone won't trigger a recompute. Each call here is paired with an item purchase in the same
// timeline step so the engine re-reads the (now snowballed) scores and the Fed pill updates live.
function score(championName, { kills = 0, deaths = 0, assists = 0 } = {}) {
  const player = state.allPlayers.find((p) => p.championName === championName);
  if (!player) return;
  player.scores.kills += kills;
  player.scores.deaths += deaths;
  player.scores.assists += assists;
  const s = player.scores;
  console.log(`  ${championName} scoreline → ${s.kills}/${s.deaths}/${s.assists}`);
}

// The demo runs in two acts. Act 1 ("lane → mid game") feeds each player's captured fixture loadout
// back in, one item-slot at a time across the whole lobby, so first items land before second items —
// roughly how a real game paces out. Act 2 ("escalation") then layers on extra purchases, each adding
// a *new* enemy threat signal the engine reacts to (→ a recommendation update and a build-shift toast).

// Act 1 — replay the captured builds from empty.
const maxSlots = Math.max(...capturedLoadouts.map((p) => p.items.length));
const baseBuildSteps = [];
for (let slot = 0; slot < maxSlots; slot += 1) {
  for (const { championName, items } of capturedLoadouts) {
    const item = items[slot];
    if (item) {
      baseBuildSteps.push(() => buy(championName, item.itemID, item.displayName));
    }
  }
}

// Act 2 — escalation. Extra enemy purchases each add a signal the team wasn't projecting yet, and a
// couple of steps also ramp Zed's and Darius's KDA so they cross the engine's "fed" threshold
// (`kills >= 6 || (kills >= 3 && K/D >= 2.0)`) mid-demo. So the Ahri recommendation shifts (more
// penetration / antiheal / stasis), the Fed pills light up, and a build-shift toast fires.
const escalationSteps = [
  // Zed gets first blood and an early pickup (2/0) — threatening, but not yet "fed" (needs 3 kills).
  () => {
    buy("Zed", 3814, "Edge of Night"); //            → reinforces lethality (and a spellshield)
    score("Zed", { kills: 2, assists: 1 });
  },
  // Darius wins a lane trade (1/0) and starts stacking bulk.
  () => {
    buy("Darius", 3053, "Sterak's Gage"); //          → health-stacking (frontline bulk)
    score("Darius", { kills: 1 });
  },
  // Zed snowballs to 3/0 → crosses the fed threshold (Fed pill + focus shift + toast).
  () => {
    buy("Vi", 3065, "Spirit Visage"); //              → mr-stacking + has-sustain
    score("Zed", { kills: 1 });
  },
  // Darius reaches 3/1 → also fed; team healing grows.
  () => {
    buy("Kaisa", 3072, "Bloodthirster"); //           → has-sustain (healing across the team)
    score("Darius", { kills: 2, deaths: 1 });
  },
  () => buy("Leona", 3068, "Sunfire Aegis"), //       → health + armor stacking
];

const TIMELINE = [...baseBuildSteps, ...escalationSteps];

let step = 0;
const timer = setInterval(() => {
  // Always try to level up on each tick (levels 2–18 progress over 17 ticks).
  levelUp();

  if (step >= TIMELINE.length) {
    // No more purchases; keep the timer alive so levels continue ticking.
    if (state.activePlayer.level >= 18) {
      clearInterval(timer);
      console.log("Timeline complete — holding final state (clock still ticking).");
    }
    return;
  }
  console.log(`\nStep ${step + 1}/${TIMELINE.length}:`);
  TIMELINE[step]();
  step += 1;
}, STEP_INTERVAL_MS);

// `selfsigned.generate` is async in this version; await it before standing up the server.
const pems = await selfsigned.generate([{ name: "commonName", value: HOST }], {
  keySize: 2048,
  days: 1,
  algorithm: "sha256",
});

const server = createServer(
  { key: pems.private, cert: pems.cert },
  (req, res) => {
    // The poller only calls /allgamedata; answer that and 404 anything else.
    const path = (req.url ?? "").split("?")[0];
    if (path !== "/liveclientdata/allgamedata") {
      res.writeHead(404).end();
      return;
    }
    // Advance the clock to "now" so the header time moves and the diff sees clock-only drift.
    state.gameData.gameTime = baseGameTime + (Date.now() - startedAt) / 1000;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(state));
  },
);

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is in use — is League running, or another mock already up? ` +
        "Close it and retry.",
    );
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(
    `Mock Live Client serving the Ahri fixture at https://${HOST}:${PORT}/liveclientdata/allgamedata`,
  );
  console.log(
    `Starting from a brand-new game at 0:15 (empty builds, clean 0/0/0 scoreboard, level 1) and ` +
      `walking the timeline every ${STEP_INTERVAL_MS / 1000}s — builds fill in, then Zed & Darius ` +
      `snowball to "fed". Start the app with \`npm run tauri dev\`. Ctrl+C to stop.`,
  );
});
