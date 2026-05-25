// Dev-only mock of Riot's Live Client Data API, for verifying the full FE↔Rust loop without
// launching League (PROJECT_SPEC §9, M4 verify bar). It serves the *same* captured `/allgamedata`
// fixture the Rust tests use, over HTTPS on 127.0.0.1:2999 with a freshly-minted self-signed cert
// — exactly the shape the production `LiveClient` expects (it accepts that self-signed cert, scoped
// to this origin). Run it, then `npm run tauri dev`, and watch the build re-rank live.
//
// It does NOT touch production code: the app talks to it precisely because :2999 is the real Live
// Client origin. To demo a live re-rank, it walks an enemy through a scripted purchase timeline,
// each step introducing a *new* threat signal the engine reacts to (→ a recommendation update and
// a build-shift toast). The game clock advances on every response, while the roster/items stay put
// between steps — which also exercises the poller's diff (clock drift must NOT trigger a recompute).
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
const baseGameTime = state.gameData.gameTime;
const startedAt = Date.now();

/** Appends an item to an enemy (by champion name) unless they already own it. */
function buy(championName, itemID, displayName) {
  const player = state.allPlayers.find((p) => p.championName === championName);
  if (!player) return;
  if (player.items.some((i) => i.itemID === itemID)) return;
  const slot = player.items.length;
  player.items.push({ itemID, count: 1, slot, displayName });
  console.log(`  ${championName} bought ${displayName} (${itemID})`);
}

// Scripted enemy purchases. Each step adds a signal the enemy team wasn't projecting yet, so the
// Ahri recommendation shifts (more penetration / antiheal / stasis) and a toast fires.
const TIMELINE = [
  () => buy("Darius", 3053, "Sterak's Gage"), //   → health-stacking (frontline bulk)
  () => buy("Vi", 3065, "Spirit Visage"), //        → mr-stacking + has-sustain
  () => buy("Kaisa", 3072, "Bloodthirster"), //     → has-sustain (healing across the team)
  () => buy("Leona", 3068, "Sunfire Aegis"), //     → health + armor stacking
  () => buy("Zed", 3814, "Edge of Night"), //       → reinforces lethality (and a spellshield)
];

let step = 0;
const timer = setInterval(() => {
  if (step >= TIMELINE.length) {
    clearInterval(timer);
    console.log("Timeline complete — holding final state (clock still ticking).");
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
    `Walking the enemy purchase timeline every ${STEP_INTERVAL_MS / 1000}s. ` +
      "Start the app with `npm run tauri dev`. Ctrl+C to stop.",
  );
});
