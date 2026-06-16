#!/usr/bin/env node
// prayat — shared state helper.
// State file: $PRAYAT_HOME/state.json (defaults to ~/.prayat/state.json).
// PRAYAT_HOME exists for test isolation.

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME_DIR = process.env.PRAYAT_HOME || path.join(os.homedir(), '.prayat');
const STATE_PATH = path.join(HOME_DIR, 'state.json');
const ERROR_LOG_PATH = path.join(HOME_DIR, 'error.log');

const DEFAULT_STATE = Object.freeze({
  enabled: false,
  level: 'moderate',
  version: 1,
});

const VALID_LEVELS = new Set(['lite', 'moderate', 'full']);

function logError(msg) {
  try {
    fs.mkdirSync(HOME_DIR, { recursive: true });
    fs.appendFileSync(ERROR_LOG_PATH, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (e) {
    // Logging is best-effort.
  }
}

function getState() {
  try {
    if (!fs.existsSync(STATE_PATH)) {
      return { ...DEFAULT_STATE };
    }
    const parsed = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_STATE.enabled,
      level: VALID_LEVELS.has(parsed.level) ? parsed.level : DEFAULT_STATE.level,
      version: typeof parsed.version === 'number' ? parsed.version : DEFAULT_STATE.version,
      lastChanged: parsed.lastChanged || undefined,
    };
  } catch (e) {
    logError(`getState: ${e.message}`);
    return { ...DEFAULT_STATE };
  }
}

function setState(patch) {
  try {
    fs.mkdirSync(HOME_DIR, { recursive: true });
    const current = getState();
    const merged = {
      ...current,
      ...patch,
      version: 1,
      lastChanged: new Date().toISOString(),
    };
    if (!VALID_LEVELS.has(merged.level)) {
      merged.level = DEFAULT_STATE.level;
    }
    const tmpPath = STATE_PATH + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(merged, null, 2));
    fs.renameSync(tmpPath, STATE_PATH);
    return merged;
  } catch (e) {
    logError(`setState: ${e.message}`);
    return null;
  }
}

module.exports = {
  HOME_DIR,
  STATE_PATH,
  ERROR_LOG_PATH,
  DEFAULT_STATE,
  VALID_LEVELS,
  getState,
  setState,
  logError,
};
