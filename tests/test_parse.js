'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseTrigger, stripCodeFences } = require('../hooks/parse');

test('enable via /prayat', () => assert.deepStrictEqual(parseTrigger('/prayat'), { enabled: true }));
test('enable via Thai keyword', () => assert.deepStrictEqual(parseTrigger('ประหยัด'), { enabled: true }));
test('level lite', () => assert.deepStrictEqual(parseTrigger('/prayat lite'), { enabled: true, level: 'lite' }));
test('level full', () => assert.deepStrictEqual(parseTrigger('/prayat full'), { enabled: true, level: 'full' }));
test('moderate alias', () => assert.deepStrictEqual(parseTrigger('/prayat mod'), { enabled: true, level: 'moderate' }));
test('disable /prayat stop', () => assert.deepStrictEqual(parseTrigger('/prayat stop'), { enabled: false }));
test('disable Thai หยุดประหยัด', () => assert.deepStrictEqual(parseTrigger('หยุดประหยัด'), { enabled: false }));
test('disable Thai เลิกประหยัด', () => assert.deepStrictEqual(parseTrigger('เลิกประหยัด'), { enabled: false }));

// Keyword level control (works even if /prayat slash never reaches the hook).
test('enable full via keyword', () => assert.deepStrictEqual(parseTrigger('ประหยัดเต็ม'), { enabled: true, level: 'full' }));
test('enable lite via keyword', () => assert.deepStrictEqual(parseTrigger('ประหยัดน้อย'), { enabled: true, level: 'lite' }));
test('enable moderate via keyword', () => assert.deepStrictEqual(parseTrigger('ประหยัดกลาง'), { enabled: true, level: 'moderate' }));
test('stats via Thai keyword', () => assert.strictEqual(parseTrigger('สถิติประหยัด').action, 'stats'));

test('stats command', () => assert.strictEqual(parseTrigger('/prayat-stats').action, 'stats'));
test('stats --share', () => assert.strictEqual(parseTrigger('/prayat-stats --share').share, true));
test('stats --since 7d', () => assert.strictEqual(parseTrigger('/prayat-stats --since 7d').since, '7d'));

// Whole-input-only guard: substrings in normal sentences must NOT toggle.
test('keyword inside a sentence does not trigger', () =>
  assert.strictEqual(parseTrigger('ช่วยสรุปให้หน่อยแบบประหยัดเวลา'), null));
test('keyword with trailing text does not trigger', () =>
  assert.strictEqual(parseTrigger('ประหยัด หน่อย'), null));
test('shorthand code is not a control trigger', () =>
  assert.strictEqual(parseTrigger('s: สรุปข่าวนี้'), null));
test('unknown subcommand is ignored', () =>
  assert.strictEqual(parseTrigger('/prayat wat'), null));

// Code fences are stripped before matching.
test('trigger inside code fence is ignored, real trigger after wins', () =>
  assert.deepStrictEqual(parseTrigger('```\n/prayat stop\n```\nประหยัด'), { enabled: true }));
test('stripCodeFences removes fenced content', () =>
  assert.strictEqual(stripCodeFences('a```secret```b').includes('secret'), false));
