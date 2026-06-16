'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Isolate state under a temp dir BEFORE requiring config (HOME_DIR is read at load).
const TMP = path.join(os.tmpdir(), 'tts-test-config-' + process.pid);
process.env.PRAYAT_HOME = TMP;
const config = require('../hooks/config');

test.after(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {} });

test('default state when no file exists', () => {
  fs.rmSync(TMP, { recursive: true, force: true });
  const s = config.getState();
  assert.strictEqual(s.enabled, false);
  assert.strictEqual(s.level, 'moderate');
});

test('setState persists and round-trips', () => {
  config.setState({ enabled: true, level: 'full' });
  const s = config.getState();
  assert.strictEqual(s.enabled, true);
  assert.strictEqual(s.level, 'full');
});

test('invalid level falls back to moderate', () => {
  config.setState({ enabled: true, level: 'bogus' });
  assert.strictEqual(config.getState().level, 'moderate');
});

test('disable preserves level but flips enabled', () => {
  config.setState({ enabled: true, level: 'lite' });
  config.setState({ enabled: false });
  const s = config.getState();
  assert.strictEqual(s.enabled, false);
  assert.strictEqual(s.level, 'lite');
});

test('corrupt state file degrades to default', () => {
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(path.join(TMP, 'state.json'), '{ not valid json');
  const s = config.getState();
  assert.strictEqual(s.enabled, false);
  assert.strictEqual(s.level, 'moderate');
});
