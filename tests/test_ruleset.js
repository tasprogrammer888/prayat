'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { buildRuleset, buildReminder, normLevel, LEVEL_RULES } = require('../hooks/ruleset');

test('normLevel keeps valid level', () => assert.strictEqual(normLevel('full'), 'full'));
test('normLevel falls back to moderate', () => assert.strictEqual(normLevel('bogus'), 'moderate'));

test('ruleset names the current level', () => assert.ok(buildRuleset('full').includes('level: full')));
test('ruleset includes the code legend', () => assert.ok(buildRuleset('lite').includes('โค้ดย่อ')));
test('ruleset includes safety (irreversible cmds)', () => assert.ok(buildRuleset('moderate').includes('rm -rf')));
test('ruleset mentions anti-drift', () => assert.ok(buildRuleset('moderate').includes('anti-drift')));

test('reminder is short-ish and names the level', () => {
  const r = buildReminder('lite');
  assert.ok(r.includes('level=lite'));
  assert.ok(r.length < 400, 'per-turn reminder should stay lean');
});

test('exactly three levels are defined', () =>
  assert.deepStrictEqual(Object.keys(LEVEL_RULES).sort(), ['full', 'lite', 'moderate']));
