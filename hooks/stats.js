#!/usr/bin/env node
// prayat stats — read the active Claude Code session log and print real token
// usage + estimated savings. No AI estimation: text numbers come from usage fields
// in the transcript JSONL; image numbers come from ~/.prayat/images.jsonl (written
// by scripts/optimize-image.py). Savings are reported for the current session, the
// current workspace (by cwd/project), and globally (--all).
//
// Run directly:    node hooks/stats.js
// Inside Claude:   /prayat-stats  (intercepted by prompt-router.js)
//
// Flags: --session-file <path> | --cwd <path> | --share | --all | --since <Nd|Nh>

const fs = require('fs');
const path = require('path');
const os = require('os');
const { getState } = require('./config');

// Approximate OUTPUT-token pricing, USD per million. Update when pricing changes.
const MODEL_OUTPUT_PRICE_PER_M = [
  ['claude-opus-4', 75.00],
  ['claude-sonnet-4', 15.00],
  ['claude-haiku-4', 5.00],
  ['claude-3-5-sonnet', 15.00],
  ['claude-3-5-haiku', 4.00],
  ['claude-3-opus', 75.00],
  ['claude-fable', 15.00],
];

const SEP = '-'.repeat(34);

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

// Normalize a workspace/project path so cwd from the hook (Node) and from
// optimize-image.py (Python) compare equal across slash style / case.
function normProject(p) {
  return String(p == null ? '' : p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function shortPath(p, max = 40) {
  if (!p) return '';
  return p.length > max ? '...' + p.slice(-max) : p;
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

function readLines(p) {
  try { return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean); }
  catch { return []; }
}

function appendHistory(historyPath, line) {
  try {
    fs.mkdirSync(path.dirname(historyPath), { recursive: true });
    fs.appendFileSync(historyPath, line + '\n');
  } catch {}
}

// Text savings, one record per stats run; keep only the latest per session.
function aggregateHistory(historyPath, { sinceMs = null, project = null } = {}) {
  const cutoff = sinceMs ? Date.now() - sinceMs : null;
  const wantProj = project != null ? normProject(project) : null;
  const latestPerSession = new Map();
  for (const line of readLines(historyPath)) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (!e || typeof e !== 'object') continue;
    if (cutoff !== null && (e.ts || 0) < cutoff) continue;
    if (wantProj !== null && normProject(e.project) !== wantProj) continue;
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

// Image savings, one record per optimize run (additive — no per-session dedup).
function aggregateImages(imagesPath, { sinceMs = null, project = null } = {}) {
  const cutoff = sinceMs ? Date.now() - sinceMs : null;
  const wantProj = project != null ? normProject(project) : null;
  let count = 0, savedTokens = 0;
  for (const line of readLines(imagesPath)) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (!e || typeof e !== 'object') continue;
    if (cutoff !== null && (e.ts || 0) < cutoff) continue;
    if (wantProj !== null && normProject(e.project) !== wantProj) continue;
    count++;
    savedTokens += e.saved_tokens || 0;
  }
  return { count, savedTokens };
}

function humanizeTokens(n) {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(Math.round(n));
}

function formatHistory({ sessions, estSavedTokens, estSavedUsd, images, since }) {
  const window = since ? ` (ย้อนหลัง ${since})` : '';
  const img = images || { count: 0, savedTokens: 0 };
  if (sessions === 0 && img.count === 0) {
    return `\nประหยัด Stats — สะสมทั้งหมด${window}\n${SEP}\nยังไม่มีข้อมูล — เปิดโหมดแล้วพิมพ์ "สถิติประหยัด" ใน session ใดก็ได้เพื่อเริ่มเก็บ\n${SEP}\n`;
  }
  const total = estSavedTokens + img.savedTokens;
  const usdLine = estSavedUsd > 0 ? `ประหยัด USD (ข้อความ):  ~${formatUsd(estSavedUsd)}\n` : '';
  return `\nประหยัด Stats — สะสมทั้งหมด${window}\n${SEP}\n` +
    `Sessions:              ${sessions.toLocaleString()}\n${SEP}\n` +
    `ประหยัดข้อความ:        ${estSavedTokens.toLocaleString()} tok\n` +
    `ประหยัดรูปภาพ:         ${img.savedTokens.toLocaleString()} tok (${img.count} รูป)\n` +
    `รวมทั้งหมด:            ${total.toLocaleString()} tok\n` +
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

function formatStats({ outputTokens, cacheReadTokens, turns, level, model, sessionPath, workspace, wsText, wsImg }) {
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
      usdLine = `ประหยัด USD (ข้อความ):  ~${formatUsd((estSaved / 1_000_000) * price)}\n`;
      footer = `ประมาณการจาก benchmarks/ (ค่ากลางต่อ task), ราคา output ของ ${model}. เลขจริงขึ้นกับงาน.`;
    } else {
      footer = 'ประมาณการจาก benchmarks/ (ค่ากลางต่อ task). เลขจริงขึ้นกับงาน.';
    }
    savings = `โทเค็นถ้าไม่ย่อ (ประมาณ): ${estNormal.toLocaleString()}\n` +
              `ประหยัดข้อความ:        ${estSaved.toLocaleString()} (~${Math.round(ratio * 100)}%)\n` +
              usdLine.replace(/\n$/, '');
  } else if (level) {
    savings = `ไม่มี benchmark สำหรับ level '${level}'`;
  } else {
    savings = 'โหมดยังไม่เปิดใน session นี้ (เปิด: "ประหยัด" หรือ /prayat)';
  }

  let wsBlock = '';
  if (wsText || wsImg) {
    const t = wsText || { estSavedTokens: 0, sessions: 0 };
    const im = wsImg || { savedTokens: 0, count: 0 };
    const total = t.estSavedTokens + im.savedTokens;
    wsBlock = `${SEP}\n` +
      `Workspace: ${shortPath(workspace)}\n` +
      `  ข้อความสะสม:  ${t.estSavedTokens.toLocaleString()} tok (${t.sessions} session)\n` +
      `  รูปภาพ:        ${im.savedTokens.toLocaleString()} tok (${im.count} รูป)\n` +
      `  รวม workspace: ${total.toLocaleString()} tok\n` +
      `${SEP}\n` +
      `รวมทุก workspace -> /prayat-stats --all\n`;
  }

  return `\nประหยัด Stats\n${SEP}\n` +
    (sessionPath ? `Session:  ${shortPath(sessionPath, 45)}\n` : '') +
    `Level:    ${level || '-'}\n` +
    `เทิร์น:    ${turns}\n${SEP}\n` +
    `ข้อความ (session นี้)\n` +
    `Output tokens:         ${outputTokens.toLocaleString()}\n` +
    `Cache-read tokens:     ${cacheReadTokens.toLocaleString()}\n` +
    `${savings}\n` +
    wsBlock +
    (footer ? footer + '\n' : '');
}

function main() {
  const args = process.argv.slice(2);
  const getArg = (flag) => {
    const i = args.indexOf(flag);
    return i !== -1 && args[i + 1] ? args[i + 1] : null;
  };
  const sessionFileArg = getArg('--session-file');
  const cwdArg = getArg('--cwd');
  const share = args.includes('--share');
  const all = args.includes('--all');
  const sinceArg = getArg('--since');

  const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const prayatDir = process.env.PRAYAT_HOME || path.join(os.homedir(), '.prayat');
  const historyPath = path.join(prayatDir, 'history.jsonl');
  const imagesPath = path.join(prayatDir, 'images.jsonl');
  const workspace = cwdArg || process.cwd();

  if (all || sinceArg) {
    const sinceMs = parseDuration(sinceArg);
    if (sinceArg && sinceMs === null) {
      process.stderr.write(`prayat: --since takes Nh or Nd (e.g. 7d, 24h), got: ${sinceArg}\n`);
      process.exit(2);
    }
    const textAgg = aggregateHistory(historyPath, { sinceMs });
    const imgAgg = aggregateImages(imagesPath, { sinceMs });
    process.stdout.write(formatHistory({ ...textAgg, images: imgAgg, since: sinceArg || null }));
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
      project: workspace,
      level: level || null,
      model: parsed.model || null,
      output_tokens: parsed.outputTokens,
      est_saved_tokens: estSavedTokens,
      est_saved_usd: estSavedUsd,
    }));
    const agg = aggregateHistory(historyPath, {});
    const img = aggregateImages(imagesPath, {});
    const suffixTok = agg.estSavedTokens + img.savedTokens;
    const suffix = suffixTok > 0 ? `⚡ ${humanizeTokens(suffixTok)}` : '';
    try {
      fs.mkdirSync(prayatDir, { recursive: true });
      fs.writeFileSync(path.join(prayatDir, 'statusline-suffix'), suffix);
    } catch {}
  }

  if (share) {
    process.stdout.write(formatShare({ ...parsed, level }) + '\n');
  } else {
    const wsText = aggregateHistory(historyPath, { project: workspace });
    const wsImg = aggregateImages(imagesPath, { project: workspace });
    process.stdout.write(formatStats({ ...parsed, level, sessionPath: sessionFile, workspace, wsText, wsImg }));
  }
}

if (require.main === module) main();

module.exports = {
  formatStats, formatShare, formatHistory, aggregateHistory, aggregateImages,
  parseDuration, deriveSavings, parseSession, priceForModel, formatUsd,
  loadCompression, humanizeTokens, normProject,
};
