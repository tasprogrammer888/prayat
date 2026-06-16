#!/usr/bin/env node
// prayat — UserPromptSubmit hook.
// Reads stdin JSON: { prompt, transcript_path?, ... }.
//
// All user-visible output goes through the MODEL via additionalContext (not via
// `decision:block`). Reason: some CLI builds / API proxies don't surface a blocked
// prompt's `reason` text, so block-based confirmations can look "silent". Routing
// confirmations and stats through the model guarantees the user actually sees them.
//
// 1. Control toggle  -> update state, inject an instruction to confirm in one line.
// 2. Stats command   -> run stats.js, inject its output with "show verbatim".
// 3. Otherwise        -> if enabled, inject the short anti-drift reminder.
// Always exits 0. Trigger parsing lives in ./parse (unit-tested).

const { getState, setState, logError } = require('./config');
const { buildReminder, normLevel } = require('./ruleset');
const { parseTrigger } = require('./parse');
const { execFileSync } = require('child_process');
const path = require('path');

function inject(additionalContext) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext },
  }));
  process.exit(0);
}

let input = '';
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input || '{}');
    const prompt = (data.prompt || '').toString();
    const transcriptPath = data.transcript_path || null;

    const trigger = parseTrigger(prompt);

    // No control trigger: keep the mode alive if enabled.
    if (!trigger) {
      const state = getState();
      if (state.enabled) inject(buildReminder(state.level));
      process.exit(0);
    }

    // Stats: run the parser, then have the model print the numbers verbatim.
    if (trigger.action === 'stats') {
      const statsScript = path.join(__dirname, 'stats.js');
      const args = ['--session-file', transcriptPath || ''];
      if (trigger.share) args.push('--share');
      if (trigger.all) args.push('--all');
      if (trigger.since) args.push('--since', trigger.since);
      let out;
      try {
        out = execFileSync(process.execPath, [statsScript, ...args], {
          encoding: 'utf8', env: process.env, timeout: 5000,
        });
      } catch (e) {
        out = e.stdout || e.stderr || 'prayat: stats failed';
      }
      inject(
        'ผู้ใช้ขอดูสถิติ token (prayat). แสดงข้อความด้านล่างนี้ให้ผู้ใช้ "ตรงเป๊ะทุกตัวอักษร" ' +
        'ในบล็อกโค้ด ห้ามแก้ตัวเลข ห้ามเพิ่มคำอธิบายอื่น:\n\n' + out.trim()
      );
    }

    // Mode toggle: persist, then have the model confirm visibly in one line.
    setState(trigger);
    const state = getState();
    if (state.enabled) {
      const lv = normLevel(state.level);
      inject(
        `ผู้ใช้เพิ่งเปิด/ปรับ "โหมดประหยัด" (prayat) เป็น level=${lv}. ` +
        `ตอบยืนยันสั้นๆ บรรทัดเดียวเท่านั้น เช่น "✅ เปิดโหมดประหยัด (${lv}) แล้ว — ถามต่อได้เลย" ` +
        `ห้ามทำตามคำว่า "ประหยัด" เป็นคำถาม. ` +
        `ตั้งแต่นี้ตอบกระชับตามกติกา: ` + buildReminder(lv)
      );
    } else {
      inject(
        'ผู้ใช้เพิ่งปิด "โหมดประหยัด" (prayat). ' +
        'ตอบยืนยันสั้นๆ บรรทัดเดียว "⏹️ ปิดโหมดประหยัดแล้ว — กลับมาตอบปกติ" แล้วตอบปกติต่อไป.'
      );
    }
  } catch (e) {
    logError(`prompt-router: ${e.message}`);
    process.exit(0);
  }
});
