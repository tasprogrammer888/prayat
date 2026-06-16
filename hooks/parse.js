'use strict';
// prayat — pure trigger parsing (no side effects, unit-testable).
// Triggers match only when they are the ENTIRE trimmed prompt (after stripping
// code fences), so the same words inside a normal sentence never toggle the mode.
//
// IMPORTANT: plain Thai keywords are the reliable path — they always reach the
// UserPromptSubmit hook. Slash forms (/prayat...) are a convenience that only works
// if the CLI forwards unknown slash text to the hook.

function stripCodeFences(text) {
  return String(text == null ? '' : text)
    .replace(/```[\s\S]*?```/g, '')
    .replace(/```[\s\S]*$/, '');
}

function parseTrigger(prompt) {
  const trimmed = stripCodeFences(prompt).trim();

  // --- Stats: keyword OR /prayat-stats / /prayat stats (+ optional flags) ---
  if (
    trimmed === 'สถิติประหยัด' ||
    /^\/prayat(?::[\w-]+)?[\s-]?stats(?:\s+--\S+(?:\s+\w+)?)*$/i.test(trimmed)
  ) {
    const share = /--share/.test(trimmed) || /แชร์/.test(trimmed);
    const all = /--all/.test(trimmed) || /ทั้งหมด/.test(trimmed);
    const sinceM = /--since\s+(\w+)/.exec(trimmed);
    return { action: 'stats', share, all, since: sinceM ? sinceM[1] : null };
  }

  // --- Slash control: /prayat, /prayat lite|moderate|full|stop|off ---
  const slash = trimmed.match(/^\/prayat(?::[\w-]+)?(?:\s+(\w+))?$/i);
  if (slash) {
    const arg = (slash[1] || '').toLowerCase();
    if (arg === 'lite') return { enabled: true, level: 'lite' };
    if (arg === 'moderate' || arg === 'mod' || arg === 'med') return { enabled: true, level: 'moderate' };
    if (arg === 'full') return { enabled: true, level: 'full' };
    if (arg === 'stop' || arg === 'off') return { enabled: false };
    if (arg === '') return { enabled: true };
    return null; // unknown subcommand -> ignore
  }

  // --- Thai keyword triggers (whole input only) ---
  // Disable first so it wins over the "ประหยัด" substring rules below.
  const disableThai = new Set(['หยุดประหยัด', 'พูดปกติ', 'พูดยาว', 'เลิกประหยัด']);
  if (disableThai.has(trimmed)) return { enabled: false };

  // Enable + pick a level via keyword (covers the case where /prayat full can't reach the hook).
  const enableLevelThai = new Map([
    ['ประหยัดเต็ม', 'full'], ['ประหยัดมาก', 'full'], ['ประหยัดสุด', 'full'],
    ['ประหยัดกลาง', 'moderate'], ['ประหยัดปกติ', 'moderate'],
    ['ประหยัดน้อย', 'lite'], ['ประหยัดเบา', 'lite'],
  ]);
  if (enableLevelThai.has(trimmed)) return { enabled: true, level: enableLevelThai.get(trimmed) };

  // Plain enable (default level).
  const enableThai = new Set(['ประหยัด', 'ประหยัดโหมด', 'พูดสั้น', 'พูดสั้นๆ']);
  if (enableThai.has(trimmed)) return { enabled: true };

  return null;
}

module.exports = { parseTrigger, stripCodeFences };
