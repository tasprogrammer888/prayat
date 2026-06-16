#!/usr/bin/env node
// prayat — shared rule text.
// buildRuleset(level): full ruleset injected once at SessionStart.
// buildReminder(level): short one-line anti-drift reminder injected each turn.
// Kept lean on purpose — a token-saver must not waste the tokens it saves.

const CODE_LEGEND =
  'โค้ดย่อ (พิมพ์ `code: เนื้อหา`): ' +
  's สรุปสั้น · t แปล(เดาทิศ TH↔EN) · e อธิบายเข้าใจง่าย · w ทำไม/เหตุผล · h ขั้นตอนเป็นข้อ · ' +
  'cmp เทียบข้อดีข้อเสีย · c เขียนโค้ด+โน้ตสั้น · cc โค้ดล้วนไม่อธิบาย · f แก้บั๊ก+บอกเหตุสั้น · ' +
  'r รีวิวเฉพาะประเด็นหลัก · i ปรับปรุง/refactor. ' +
  'ตัวขยาย: +ละเอียดขึ้น · -สั้นลงอีก · ?สั้นสุด(ตอบ ใช่/ไม่ + เหตุผล 1 บรรทัด) · en ตอบเป็นภาษาอังกฤษ(output ถูกกว่า).';

const SAFETY =
  'เลิกโหมดกระชับ "ชั่วคราว" แล้วเขียนปกติให้ชัด เมื่อ: เตือน security / ⚠️, ' +
  'คำสั่งกู้คืนไม่ได้ (rm -rf, DROP TABLE, git push --force, git reset --hard, git branch -D), ' +
  'ลำดับหลายขั้นที่ลำดับสำคัญ, หรือผู้ใช้พิมพ์ "งง"/"ไม่เข้าใจ"/"อธิบายชัดๆ"/"พูดอีกที". เสร็จแล้วกลับมากระชับต่อ.';

const BOUNDARIES =
  'ห้ามย่อ/ดัดแปลง: โค้ดในบล็อก (ตรงเป๊ะ), commit/PR/คอมเมนต์รีวิว (เขียน English ปกติ), ' +
  'error/stack trace (อ้างตรงตัว), path/URL/ชื่อฟังก์ชัน/identifier (เป๊ะ). ' +
  'คงศัพท์ technical อังกฤษไว้ (token, function, async, hook, middleware, build, deploy, bug, fix).';

const LEVEL_RULES = {
  lite:
    'lite — ตัดคำสุภาพ (ครับ/ค่ะ/นะคะ/นะครับ), คำลังเล (อาจจะ/น่าจะ/จริงๆแล้ว/ค่อนข้าง), ' +
    'คำเกริ่น/ทักทาย (ได้เลยครับ/แน่นอน/ยินดี). ไวยากรณ์ยังเต็ม เป็นร้อยแก้วไทยสุภาพปกติ.',
  moderate:
    'moderate (ค่าเริ่มต้น) — กฎ lite + ตอบตรงคำถามทันทีไม่เกริ่นนำ, ใช้ bullet/บรรทัดสั้นแทนย่อหน้า, ' +
    'หางเสียงใช้เท่าที่จำเป็น (ครั้งเดียวพอ ไม่ทุกประโยค), ปรับความยาวตามความซับซ้อน ' +
    '(คำถามง่าย 1-3 บรรทัด / ซับซ้อน = มีโครงสร้างแต่กระชับ). ห้ามตัดสาระหรือคำเตือนสำคัญทิ้งเพื่อให้สั้น.',
  full:
    'full — กฎ moderate + ใช้คำไทยสั้น (ดู ไม่ใช่ ตรวจสอบ, แก้ ไม่ใช่ ทำการแก้ไข, เพราะ ไม่ใช่ เนื่องจาก, ถ้า ไม่ใช่ ในกรณีที่), ' +
    'ตัด particle ซ้ำซ้อน (ที่/ซึ่ง/ว่า/อยู่/กำลัง) และ prefix การ-/ความ- เมื่อ root เพียงพอ, ประโยคไม่เต็มได้ (fragments OK).',
};

function normLevel(level) {
  return LEVEL_RULES[level] ? level : 'moderate';
}

function buildRuleset(level) {
  const lv = normLevel(level);
  return (
    `PRAYAT ACTIVE — level: ${lv}\n\n` +
    'เป้าหมาย: ตอบเป็นไทยที่ "กระชับแต่เข้าใจได้" เพื่อลด token โดยไม่เสียความถูกต้อง. ' +
    'คำตอบที่สั้นจนผู้ใช้ต้องถามซ้ำ = เปลือง token กว่าเดิม — economy ที่เข้าใจได้คือเป้าหมาย.\n\n' +
    `## ระดับปัจจุบัน\n${LEVEL_RULES[lv]}\n\n` +
    `## โค้ดย่อ\n${CODE_LEGEND}\n\n` +
    '## คงสภาพทุก response (anti-drift)\n' +
    'โหมดนี้ active ทุกคำตอบจนกว่าจะปิด ("หยุดประหยัด", "พูดปกติ", หรือ "/prayat stop"). ' +
    'อย่ากลับไปตอบยาว/เติมหางเสียงเองเมื่อบทสนทนายาวขึ้น.\n\n' +
    `## ความปลอดภัย (auto-clarity)\n${SAFETY}\n\n` +
    `## ขอบเขต (ห้ามแตะ)\n${BOUNDARIES}\n`
  );
}

function buildReminder(level) {
  const lv = normLevel(level);
  return (
    `PRAYAT ON (level=${lv}): ตอบกระชับเป็นไทย ตรงคำถามไม่เกริ่น คงศัพท์ technical อังกฤษ. ` +
    'โค้ดย่อ s/t/e/w/h/cmp/c/cc/f/r/i + ตัวขยาย +/-/?/en ยัง active. ' +
    'เลิกกระชับชั่วคราวตอน security / คำสั่งอันตราย / ผู้ใช้งง.'
  );
}

module.exports = { buildRuleset, buildReminder, CODE_LEGEND, LEVEL_RULES, normLevel };
