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
// Run the game clock faster than wall-time. The gank evaluator gates the *first*-gank alert on a
// real game-time threshold (an early ganker needs game_time ≥ 150s / 2:30); at 1× you'd wait over
// two minutes for it, by which point the jungler has already ramped past level 6 and the two
// windows (first-gank, then level-6 ult) coalesce into a single alert. Compressing the clock makes
// game-time milestones arrive while levels are still low, so you SEE both alerts fire in order,
// seconds apart. Clock-only (no items/level/roster change) — so it still exercises the poller's
// "drift between steps must not recompute" diff.
const CLOCK_SCALE = 6;

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
  // Captured (mid-game) level is the cap each player ramps back up to over the timeline.
  level: p.level,
}));
state.allPlayers.forEach((p) => {
  p.items = [];
  // Fresh game: nobody has farmed or fought yet, so the scoreboard starts clean. The captured
  // fixture is a mid-game snapshot already snowballed (Zed 4/2, Darius 3/1); without wiping it,
  // both would read as "Fed" from the opening whistle. KDA is ramped back up over the Act 2
  // timeline so you can watch the Fed pills (and the resulting build/focus shift) appear live.
  p.scores = { kills: 0, deaths: 0, assists: 0, creepScore: 0, wardScore: 0 };
  // Likewise reset EVERY player's level to 1. The captured fixture has enemies at level 6–9; left
  // untouched they'd read as already-spiked from the opening whistle — the enemy jungler (Vi, lvl 8)
  // would trip the level-6 "ult online" gank alert at 0:15 while our own champ is still level 2.
  // Levels ramp back toward each captured cap over the timeline (see rampLevels), so the gank alert
  // fires when the jungler actually crosses 6, mid-demo.
  p.level = 1;
});
state.gameData.gameTime = FRESH_START_GAMETIME;
// Mark this as the DraftSmith dev mock so the match recorder never writes it to the user's real
// match history. The mock replays a real CLASSIC payload over the actual Live Client origin, so a
// sentinel gameMode is the only thing that distinguishes it (mirrors MOCK_GAME_MODE in Rust).
// Coaching is mode-agnostic, so this doesn't affect the demo; the mode isn't shown in-game.
state.gameData.gameMode = "DRAFTSMITHMOCK";

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
 * Scripted skill order for a standard Q>W>E>R>Q>Q champion.
 * Each entry is [level, slot] — the point earned **at** `level` goes into `slot`.
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

/**
 * Advance the demo's skill progression by one tick.
 *
 * A real player *reaches* a level with the point still UNSPENT — the coach shows "level up now" for
 * that level's ability — and only then spends it. We model exactly that: spend the **current**
 * level's scripted point, then advance. So precisely one point is always pending and the SkillStrip
 * shows a live, correct "level up now".
 *
 * (The previous version spent the point for the level it had just *advanced into*, which never
 * applied level 1's Q at all — the active player starts at level 1. That orphaned point desynced the
 * coach: the engine kept recommending Q to "unlock" while the board already showed W/E as taken.)
 */
function levelUp() {
  const cur = state.activePlayer.level;
  if (cur > 18) return;
  const entry = LEVEL_SKILL_ORDER.find(([lvl]) => lvl === cur);
  if (entry) {
    const slot = entry[1];
    state.activePlayer.abilities[slot].abilityLevel += 1;
    console.log(
      `  Ahri spends level ${cur}'s point on ${slot} ` +
        `(now rank ${state.activePlayer.abilities[slot].abilityLevel})`,
    );
  }
  if (cur < 18) state.activePlayer.level = cur + 1;
}

/**
 * Ramp every player's level up by one per tick toward its captured cap.
 *
 * This runs on the STEP_INTERVAL_MS cadence (not every poll), so levels stay constant *between*
 * timeline steps — preserving the property the mock exists to demo: a clock-only change between
 * steps must NOT trigger a recompute (the poller's diff signature includes level, so bumping it
 * every poll would defeat that). The active player's own level is driven separately by `levelUp`;
 * here we keep its `allPlayers` mirror in sync and advance the enemies alongside it, so the enemy
 * jungler crosses level 6 mid-demo and the gank alert fires at a realistic moment.
 */
function rampLevels() {
  state.allPlayers.forEach((p, i) => {
    const cap = capturedLoadouts[i].level;
    if (p.level < cap) p.level += 1;
  });
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

// ---------- Game-event feed (Part A: match recording) --------------------------------
// `/allgamedata` carries an `events.Events[]` feed (kills, objectives, GameEnd). The recorder reads
// it to build the match's event timeline and final result. The fixture seeds a couple of early
// events; we append more as the demo escalates, then a terminal GameEnd when the timeline completes.
state.events ??= { Events: [] };
state.events.Events ??= [];
let nextEventId =
  Math.max(0, ...state.events.Events.map((e) => e.EventID ?? 0)) + 1;
let gameEnded = false;

function addEvent(name, extra = {}) {
  const ev = {
    EventID: nextEventId++,
    EventName: name,
    EventTime: Math.round(state.gameData.gameTime),
    ...extra,
  };
  state.events.Events.push(ev);
  console.log(`  event: ${name}${extra.KillerName ? ` (${extra.KillerName})` : ""}`);
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
    addEvent("FirstBlood", { Recipient: "Zed" });
    addEvent("ChampionKill", { KillerName: "Zed", VictimName: "Ahri", Assisters: [] });
  },
  // Darius wins a lane trade (1/0) and starts stacking bulk. Zed also grabs MR boots into the AP
  // mid matchup — Mercury's Treads (+20 MR) — so the player (Ahri, AP) should see Zed's magic resist
  // rise in the enemy threat panel's durability estimate (the exact MR read-out from the bug report).
  () => {
    buy("Darius", 3053, "Sterak's Gage"); //          → health-stacking (frontline bulk)
    buy("Zed", 3111, "Mercury's Treads"); //          → +20 MR on the enemy mid (vs Ahri's magic dmg)
    score("Darius", { kills: 1 });
    addEvent("ChampionKill", { KillerName: "Darius", VictimName: "Leona", Assisters: [] });
  },
  // Zed snowballs to 3/0 → crosses the fed threshold (Fed pill + focus shift + toast).
  () => {
    buy("Vi", 3065, "Spirit Visage"); //              → mr-stacking + has-sustain
    score("Zed", { kills: 1 });
    addEvent("DragonKill", { KillerName: "Vi", DragonType: "Fire", Stolen: "False", Assisters: [] });
  },
  // Darius reaches 3/1 → also fed; team healing grows.
  () => {
    buy("Kaisa", 3072, "Bloodthirster"); //           → has-sustain (healing across the team)
    score("Darius", { kills: 2, deaths: 1 });
    addEvent("ChampionKill", { KillerName: "Ahri", VictimName: "Zed", Assisters: ["Kaisa"] });
  },
  () => {
    buy("Leona", 3068, "Sunfire Aegis"); //           → health + armor stacking
    addEvent("BaronKill", { KillerName: "Vi", Stolen: "False", Assisters: [] });
  },
];

const TIMELINE = [...baseBuildSteps, ...escalationSteps];

let step = 0;
const timer = setInterval(() => {
  // Always advance skill progression on each tick (one pending point spent, then level up).
  levelUp();
  // Ramp every roster level toward its captured cap on the same cadence (enemy jungler too).
  rampLevels();

  if (step >= TIMELINE.length) {
    // Purchases done and the player has hit 18: end the game. Emit GameEnd, hold briefly so the
    // poller captures it, then close the server so the next poll gets connection-refused — the real
    // "game over" signal League sends. The poller's no-game branch then flushes the recorded match
    // to disk (Part A), which should appear in Match History.
    if (state.activePlayer.level >= 18 && !gameEnded) {
      gameEnded = true;
      addEvent("GameEnd", { Result: "Win" });
      console.log(
        "\nTimeline complete — GameEnd emitted. Closing the server in 6s to end the game so the " +
          "match record flushes; it should then show up in Match History.",
      );
      setTimeout(() => {
        clearInterval(timer);
        server.close(() =>
          console.log("Server closed — the app should now see no-game and save the match."),
        );
      }, 6000);
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
    // Advance the clock to "now" (scaled) so the header time moves and the diff sees clock-only
    // drift. CLOCK_SCALE compresses the timeline so the first-gank time gate is reached while the
    // jungler is still below level 6 (see CLOCK_SCALE docs) — both gank alerts then fire in order.
    state.gameData.gameTime =
      baseGameTime + ((Date.now() - startedAt) / 1000) * CLOCK_SCALE;
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
