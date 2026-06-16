#!/usr/bin/env node
// prayat — SessionStart hook.
// Reads state; if enabled, writes the full ruleset to stdout.
// Stdout becomes additionalContext for the session. Always exits 0 (never blocks start).

try {
  const { getState } = require('./config');
  const { buildRuleset } = require('./ruleset');
  const state = getState();
  if (!state.enabled) {
    process.exit(0);
  }
  process.stdout.write(buildRuleset(state.level));
  process.exit(0);
} catch (e) {
  // Never block session start.
  process.exit(0);
}
