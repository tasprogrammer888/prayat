'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = path.join(os.tmpdir(), 'tts-test-stats-' + process.pid);
process.env.PRAYAT_HOME = TMP;
const stats = require('../hooks/stats');

test.after(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {} });

test('priceForModel matches opus 4.x via prefix', () =>
  assert.strictEqual(stats.priceForModel('claude-opus-4-8'), 75));
test('priceForModel matches sonnet 4.x', () =>
  assert.strictEqual(stats.priceForModel('claude-sonnet-4-6'), 15));
test('priceForModel unknown -> null', () =>
  assert.strictEqual(stats.priceForModel('gpt-4o'), null));

test('formatUsd tiers', () => {
  assert.strictEqual(stats.formatUsd(2.5), '$2.50');
  assert.strictEqual(stats.formatUsd(0.05), '$0.050');
  assert.strictEqual(stats.formatUsd(0.0005), '$0.0005');
});

test('parseDuration', () => {
  assert.strictEqual(stats.parseDuration('7d'), 7 * 86_400_000);
  assert.strictEqual(stats.parseDuration('2h'), 2 * 3_600_000);
  assert.strictEqual(stats.parseDuration('bogus'), null);
});

test('humanizeTokens', () => {
  assert.strictEqual(stats.humanizeTokens(1500), '1.5k');
  assert.strictEqual(stats.humanizeTokens(2_000_000), '2.0M');
  assert.strictEqual(stats.humanizeTokens(0), '0');
});

test('parseSession sums assistant usage and skips junk', () => {
  fs.mkdirSync(TMP, { recursive: true });
  const f = path.join(TMP, 's.jsonl');
  fs.writeFileSync(f, [
    JSON.stringify({ type: 'user', message: {} }),
    JSON.stringify({ type: 'assistant', message: { model: 'claude-opus-4-8', usage: { output_tokens: 100, cache_read_input_tokens: 5 } } }),
    JSON.stringify({ type: 'assistant', message: { model: 'claude-opus-4-8', usage: { output_tokens: 50, cache_read_input_tokens: 3 } } }),
    'not json at all',
    JSON.stringify({ type: 'assistant', message: { /* no usage */ } }),
  ].join('\n'));
  const r = stats.parseSession(f);
  assert.strictEqual(r.outputTokens, 150);
  assert.strictEqual(r.cacheReadTokens, 8);
  assert.strictEqual(r.turns, 2);
  assert.strictEqual(r.model, 'claude-opus-4-8');
});

test('deriveSavings yields positive saving when level ratio known', () => {
  const r = stats.deriveSavings({ outputTokens: 1000, level: 'moderate', model: 'claude-opus-4-8' });
  assert.ok(r.estSavedTokens > 0, 'expected positive token saving');
  assert.ok(r.estSavedUsd > 0, 'expected positive usd saving');
});

test('deriveSavings is zero when level unknown/null', () => {
  const r = stats.deriveSavings({ outputTokens: 1000, level: null, model: 'claude-opus-4-8' });
  assert.strictEqual(r.estSavedTokens, 0);
  assert.strictEqual(r.estSavedUsd, 0);
});

test('compression.json defines all three levels', () => {
  const c = stats.loadCompression();
  for (const lv of ['lite', 'moderate', 'full']) {
    assert.ok(typeof c[lv] === 'number' && c[lv] > 0 && c[lv] < 1, `ratio for ${lv} should be 0..1`);
  }
});

test('normProject normalizes slash style and case', () => {
  assert.strictEqual(stats.normProject('D:\\AA\\Proj\\'), 'd:/aa/proj');
  assert.strictEqual(stats.normProject('/d/AA/Proj'), '/d/aa/proj');
  assert.strictEqual(stats.normProject(null), '');
});

test('aggregateImages sums and filters by project (normalized)', () => {
  fs.mkdirSync(TMP, { recursive: true });
  const f = path.join(TMP, 'images.jsonl');
  fs.writeFileSync(f, [
    JSON.stringify({ ts: 1000, project: 'D:/proj/a', saved_tokens: 100 }),
    JSON.stringify({ ts: 2000, project: 'D:\\proj\\a', saved_tokens: 50 }), // same proj after norm
    JSON.stringify({ ts: 3000, project: 'D:/proj/b', saved_tokens: 30 }),
    'junk line',
  ].join('\n'));
  const all = stats.aggregateImages(f, {});
  assert.strictEqual(all.count, 3);
  assert.strictEqual(all.savedTokens, 180);
  const a = stats.aggregateImages(f, { project: 'd:/proj/a' });
  assert.strictEqual(a.count, 2);
  assert.strictEqual(a.savedTokens, 150);
});

test('aggregateHistory filters by project', () => {
  fs.mkdirSync(TMP, { recursive: true });
  const f = path.join(TMP, 'history2.jsonl');
  fs.writeFileSync(f, [
    JSON.stringify({ ts: 1, session_id: 's1', project: 'D:/proj/a', est_saved_tokens: 200, output_tokens: 100 }),
    JSON.stringify({ ts: 2, session_id: 's2', project: 'D:/proj/b', est_saved_tokens: 70, output_tokens: 50 }),
  ].join('\n'));
  const a = stats.aggregateHistory(f, { project: 'D:\\proj\\a' });
  assert.strictEqual(a.sessions, 1);
  assert.strictEqual(a.estSavedTokens, 200);
});

test('aggregateImages respects --since cutoff', () => {
  fs.mkdirSync(TMP, { recursive: true });
  const f = path.join(TMP, 'images2.jsonl');
  fs.writeFileSync(f, [
    JSON.stringify({ ts: 1, project: 'p', saved_tokens: 999 }),       // ancient
    JSON.stringify({ ts: Date.now(), project: 'p', saved_tokens: 5 }), // now
  ].join('\n'));
  const recent = stats.aggregateImages(f, { sinceMs: 60_000 });
  assert.strictEqual(recent.savedTokens, 5);
});
