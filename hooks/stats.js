#!/usr/bin/env node
// prayat stats — read the active Claude Code session log and print
// real token usage + estimated savings. No AI estimation: numbers come straight
// from usage fields in the transcript JSONL.
//
// Run directly:    node hooks/stats.js
// Inside Claude:   /prayat-stats  (intercepted by prompt-router.js)
//
// Flags: --session-file <path> | --share | --all | --since <Nd|Nh>

const fs = require('fs');
const path = require('path');
const os = require('os');
const { getState } = require('./config');

// Approximate OUTPUT-token pricing, USD per million. Update when pricing changes.
// Prefix match: the first entry whose prefix the model id starts with wins.
const MODEL_OUTPUT_PRICE_PER_M = [
  ['claude-opus-4', 75.00],
  ['claude-sonnet-4', 15.00],
  ['claude-haiku-4', 5.00],
  ['claude-3-5-sonnet', 15.00],
  ['claude-3-5-haiku', 4.00],
  ['claude-3-opus', 75.00],
  ['claude-fable', 15.00],
];

function loadCompression() {
  const benchmarkDir = process.env.PRAYAT_BENCHMARK_DIR || path.join(__dirname, '..', 'benchmarks');
  try {
    const data = JSON.parse(fs.readFileSync(path.join(benchmarkDir, 'compression.json'), 'utf8'));
    return data.compression || {};
  } catch {
    return {};
  }
}

function priceForModel(model) {
  if (!model) return null;
  for (const [prefix, price] of MODEL_OUTPUT_PRICE_PER_M) {
    if (model.startsWith(prefix)) return price;
  }
  return null;
}

function formatUsd(amount) {
  if (amount >= 1) return `$${amount.toFixed(2)}`;
  if (amount >= 0.01) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(4)}`;
}

function findRecentSession(claudeDir) {
  const projectsDir = path.join(claudeDir, 'projects');
  let best = null;
  const stack = [projectsDir];
  while (stack.length) {
    const p = stack.pop();
    let st;
    try { st = fs.statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      try { for (const child of fs.readdirSync(p)) stack.push(path.join(p, child)); } catch {}
    } else if (p.endsWith('.jsonl') && (!best || st.mtimeMs > best.mtime)) {
      best = { file: p, mtime: st.mtimeMs };
    }
  }
  return best ? best.file : null;
}

function parseSession(filePath) {
  let raw;
  try { raw = fs.readFileSync(filePath, 'utf8'); }
  catch { return { outputTokens: 0, cacheReadTokens: 0, turns: 0, model: null }; }

  let outputTokens = 0, cacheReadTokens = 0, turns = 0, model = null;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry.type !== 'assistant' || !entry.message) continue;
    const usage = entry.message.usage;
    if (!usage) continue;
    outputTokens += usage.output_tokens || 0;
    cacheReadTokens += usage.cache_read_input_tokens || 0;
    turns++;
    if (!model && entry.message.model) model = entry.message.model;
  }
  return { outputTokens, cacheReadTokens, turns, model };
}

function deriveSavings({ outputTokens, level, model }) {
  const ratio = loadCompression()[level];
  if (ratio == null) return { estSavedTokens: 0, estSavedUsd: 0 };
  const price = priceForModel(model);
  const estNormal = Math.round(outputTokens / (1 - ratio));
  const estSavedTokens = estNormal - outputTokens;
  const estSavedUsd = price != null ? (estSavedTokens / 1_000_000) * price : 0;
  return { estSavedTokens, estSavedUsd };
}

function parseDuration(spec) {
  if (!spec) return null;
  const m = /^(\d+)([dh])$/.exec(spec.trim());
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return m[2] === 'd' ? n * 86_400_000 : n * 3_600_000;
}

function readHistory(historyPath) {
  try { return fs.readFileSync(historyPath, 'utf8').split('\n').filter(Boolean); }
  catch { return []; }
}

function appendHistory(historyPath, line) {
  try {
    fs.mkdirSync(path.dirname(historyPath), { recursive: true });
    fs.appendFileSync(historyPath, line + '\n');
  } catch {}
}

function aggregateHistory(historyPath, sinceMs) {
  const cutoff = sinceMs ? Date.now() - sinceMs : null;
  const latestPerSession = new Map();
  for (const line of readHistory(historyPath)) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (!e || typeof e !== 'object') continue;
    if (cutoff !== null && (e.ts || 0) < cutoff) continue;
    const id = e.session_id || '_';
    const prev = latestPerSession.get(id);
    if (!prev || (e.ts || 0) >= (prev.ts || 0)) latestPerSession.set(id, e);
  }
  let outputTokens = 0, estSavedTokens = 0, estSavedUsd = 0;
  for (const e of latestPerSession.values()) {
    outputTokens += e.output_tokens || 0;
    estSavedTokens += e.est_saved_tokens || 0;
    estSavedUsd += e.est_saved_usd || 0;
  }
  return { sessions: latestPerSession.size, outputTokens, estSavedTokens, estSavedUsd };
}

function humanizeTokens(n) {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(Math.round(n));
}

const SEP = '──────────────────────────────────';

function formatHistory({ sessions, outputTokens, estSavedTokens, estSavedUsd, since }) {
  const window = since ? ` (ย้อนหลัง ${since})` : '';
  if (sessions === 0) {
    return `\nประหยัด Stats — สะสม${window}\n${SEP}\nยังไม่มีข้อมูล — รัน /prayat-stats ใน session ใดก็ได้เพื่อเริ่มเก็บ\n${SEP}\n`;
  }
  const usdLine = estSavedUsd > 0 ? `ประหยัด (USD):        ~${formatUsd(estSavedUsd)}\n` : '';
  return `\nประหยัด Stats — สะสม${window}\n${SEP}\n` +
    `Sessions:              ${sessions.toLocaleString()}\n${SEP}\n` +
    `Output tokens:         ${outputTokens.toLocaleString()}\n` +
    `ประหยัดโทเค็น (ประมาณ): ${estSavedTokens.toLocaleString()}\n` +
    usdLine + SEP + '\n';
}

function formatShare({ outputTokens, turns, level, model }) {
  if (turns === 0) return '⚡ prayat พร้อม แต่ยังไม่มีเทิร์น';
  const ratio = loadCompression()[level];
  const price = priceForModel(model);
  if (ratio != null) {
    const estSaved = Math.round(outputTokens / (1 - ratio)) - outputTokens;
    const usd = price != null ? ` (~${formatUsd((estSaved / 1_000_000) * price)})` : '';
    return `⚡ ประหยัด ~${estSaved.toLocaleString()} output tokens${usd} จาก ${turns} เทิร์นใน session นี้ — prayat`;
  }
  return `⚡ ${turns} เทิร์น, ${outputTokens.toLocaleString()} output tokens ใน session นี้ — prayat`;
}

function formatStats({ outputTokens, cacheReadTokens, turns, level, model, sessionPath }) {
  const shortPath = sessionPath && sessionPath.length > 45 ? '...' + sessionPath.slice(-45) : (sessionPath || '');
  if (turns === 0) {
    return `\nประหยัด Stats\n${SEP}\nยังไม่มีบทสนทนา — แสดงสถิติหลังได้ response แรก\n${SEP}\n`;
  }
  const ratio = loadCompression()[level];
  const price = priceForModel(model);

  let savings, footer = '';
  if (ratio != null) {
    const estNormal = Math.round(outputTokens / (1 - ratio));
    const estSaved = estNormal - outputTokens;
    let usdLine = '';
    if (price != null) {
      usdLine = `ประหยัด (USD):        ~${formatUsd((estSaved / 1_000_000) * price)}\n`;
      footer = `ประมาณการจาก benchmarks/ (ค่ากลางต่อ task), ราคา output ของ ${model}. เลขจริงขึ้นกับงาน.`;
    } else {
      footer = 'ประมาณการจาก benchmarks/ (ค่ากลางต่อ task). เลขจริงขึ้นกับงาน.';
    }
    savings = `โทเค็นถ้าไม่ย่อ (ประมาณ): ${estNormal.toLocaleString()}\n` +
              `ประหยัดโทเค็น:        ${estSaved.toLocaleString()} (~${Math.round(ratio * 100)}%)\n` +
              usdLine.replace(/\n$/, '');
  } else if (level) {
    savings = `ไม่มี benchmark สำหรับ level '${level}'`;
  } else {
    savings = 'โหมดยังไม่เปิดใน session นี้ (เปิด: "ประหยัด" หรือ /prayat)';
  }

  return `\nประหยัด Stats\n${SEP}\n` +
    (shortPath ? `Session:  ${shortPath}\n` : '') +
    `Level:    ${level || '-'}\n` +
    `เทิร์น:    ${turns}\n${SEP}\n` +
    `Output tokens:         ${outputTokens.toLocaleString()}\n` +
    `Cache-read tokens:     ${cacheReadTokens.toLocaleString()}\n${SEP}\n` +
    `${savings}\n` +
    (footer ? footer + '\n' : '');
}

function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--session-file');
  const sessionFileArg = i !== -1 && args[i + 1] ? args[i + 1] : null;
  const share = args.includes('--share');
  const all = args.includes('--all');
  const sinceIdx = args.indexOf('--since');
  const sinceArg = sinceIdx !== -1 ? args[sinceIdx + 1] : null;

  const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const ttsDir = process.env.PRAYAT_HOME || path.join(os.homedir(), '.prayat');
  const historyPath = path.join(ttsDir, 'history.jsonl');

  if (all || sinceArg) {
    const sinceMs = parseDuration(sinceArg);
    if (sinceArg && sinceMs === null) {
      process.stderr.write(`prayat: --since takes Nh or Nd (e.g. 7d, 24h), got: ${sinceArg}\n`);
      process.exit(2);
    }
    process.stdout.write(formatHistory({ ...aggregateHistory(historyPath, sinceMs), since: sinceArg || null }));
    return;
  }

  const sessionFile = sessionFileArg || findRecentSession(claudeDir);
  if (!sessionFile) {
    process.stderr.write('prayat: no Claude Code session found.\n');
    process.exit(1);
  }

  const parsed = parseSession(sessionFile);
  const state = getState();
  const level = state.enabled ? state.level : null;

  if (parsed.turns > 0) {
    const { estSavedTokens, estSavedUsd } = deriveSavings({ ...parsed, level });
    appendHistory(historyPath, JSON.stringify({
      ts: Date.now(),
      session_id: path.basename(sessionFile, '.jsonl'),
      level: level || null,
      model: parsed.model || null,
      output_tokens: parsed.outputTokens,
      est_saved_tokens: estSavedTokens,
      est_saved_usd: estSavedUsd,
    }));
    const agg = aggregateHistory(historyPath, null);
    const suffix = agg.estSavedTokens > 0 ? `⚡ ${humanizeTokens(agg.estSavedTokens)}` : '';
    try {
      fs.mkdirSync(ttsDir, { recursive: true });
      fs.writeFileSync(path.join(ttsDir, 'statusline-suffix'), suffix);
    } catch {}
  }

  if (share) {
    process.stdout.write(formatShare({ ...parsed, level }) + '\n');
  } else {
    process.stdout.write(formatStats({ ...parsed, level, sessionPath: sessionFile }));
  }
}

if (require.main === module) main();

module.exports = {
  formatStats, formatShare, formatHistory, aggregateHistory, parseDuration,
  deriveSavings, parseSession, priceForModel, formatUsd, loadCompression, humanizeTokens,
};
