---
name: prayat
description: Terse Thai+English mode that cuts output tokens ~45-75% while staying understandable. Interpret task shorthand codes (s: สรุป, t: แปล, e: อธิบาย, f: แก้โค้ด, c:/cc: เขียนโค้ด, r: รีวิว, w/h/cmp/i, modifiers +/-/?/en) as full requests, and reply in concise Thai keeping technical English terms. Use whenever the user writes Thai, uses a shorthand code, asks for shorter/cheaper Thai answers, mentions saving tokens/cost, or runs /prayat or /prayat-stats. The operational rules are also injected automatically by this plugin's hooks each session/turn; this file is the reference manual.
---

# prayat — คู่มือ

โหมดตอบไทย "กระชับแต่เข้าใจได้" เพื่อลด token โดยไม่เสียความถูกต้อง ทำงานผ่าน hooks ของ plugin (ฉีดกติกาตอนเปิด session และย้ำทุก turn) — ไฟล์นี้คือคู่มืออ้างอิงสำหรับคนและโมเดล

## เปิด/ปิด/เปลี่ยนระดับ

| พิมพ์ | ผล |
|------|-----|
| `/prayat` หรือ `ประหยัด` | เปิด (ระดับ moderate) |
| `/prayat lite` | เปิดระดับ lite |
| `/prayat full` | เปิดระดับ full |
| `/prayat stop` หรือ `หยุดประหยัด` / `พูดปกติ` | ปิด |
| `/prayat-stats` | ดูสถิติ token + เงินที่ประหยัด |

คำสั่งเปิด/ปิดจะ "ยืนยันทันที" โดยไม่เปลือง turn ของโมเดล (hook ตอบเอง)

## 3 ระดับความกระชับ

- **lite** — ตัดคำสุภาพ/คำลังเล/คำเกริ่น ไวยากรณ์ยังเต็ม (ลด ~45%)
- **moderate** (ค่าเริ่มต้น) — lite + ตอบตรงคำถาม ใช้ bullet ปรับความยาวตามความซับซ้อน (ลด ~60%)
- **full** — moderate + คำไทยสั้น ตัด particle ซ้ำซ้อน fragments ได้ (ลด ~75%)

## โค้ดย่อตามงาน (พิมพ์ `code: เนื้อหา`)

`s` สรุป · `t` แปล (เดาทิศ TH↔EN) · `e` อธิบาย · `w` ทำไม · `h` ขั้นตอน · `cmp` เทียบข้อดีข้อเสีย · `c` เขียนโค้ด+โน้ต · `cc` โค้ดล้วน · `f` แก้บั๊ก+เหตุ · `r` รีวิวประเด็นหลัก · `i` ปรับปรุง/refactor

ตัวขยาย: `+` ละเอียดขึ้น · `-` สั้นลง · `?` สั้นสุด (ใช่/ไม่ + เหตุผล 1 บรรทัด) · `en` ตอบเป็นอังกฤษ (ถูกกว่า)

ตารางเต็ม + ตัวอย่าง + วิธีเพิ่มโค้ดเอง: ดู `references/legend.md`

## ความปลอดภัย (auto-clarity)

เลิกโหมดกระชับชั่วคราว เขียนปกติให้ชัด เมื่อเจอ: คำเตือน security, คำสั่งกู้คืนไม่ได้ (`rm -rf`, `DROP TABLE`, `git push --force`, `git reset --hard`), ลำดับหลายขั้นที่ลำดับสำคัญ, หรือผู้ใช้บอกว่า "งง"/"อธิบายชัดๆ" แล้วกลับมากระชับต่อ

## ขอบเขต (ห้ามย่อ)

โค้ด, commit/PR, error/stack trace, path/URL/ชื่อฟังก์ชัน/identifier — คงไว้ตรงเป๊ะ และคงศัพท์ technical อังกฤษเสมอ
