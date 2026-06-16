# prayat (ประหยัด)

โหมดตอบไทย **กระชับแต่เข้าใจได้** สำหรับ Claude Code — ลด output token **~40–80%** โดยยังถูกต้องทาง technical
มี **โค้ดย่อตามงาน** (s:/f:/cc:...), **3 ระดับ** (lite/moderate/full), **token stats** จริงจาก session log, และโหมด **`en` ตอบอังกฤษ**

## ติดตั้ง

**ผ่าน marketplace (คำสั่งเดียว):**
```
/plugin marketplace add tasprogrammer888/prayat
/plugin install prayat@prayat
```

**หรือทดสอบในเครื่อง:**
```bash
git clone https://github.com/tasprogrammer888/prayat
claude --plugin-dir ./prayat
```
ต้องมี **Node.js ≥ 18** · แก้ไฟล์แล้วพิมพ์ `/reload-plugins` เพื่อโหลดใหม่

## ใช้งาน

เปิดโหมดครั้งเดียว (จำข้ามเซสชัน) แล้วสั่งงานปกติ — คำตอบจะกระชับให้เอง

```
ประหยัด           # เปิดโหมด (moderate)
ประหยัดเต็ม       # ระดับ full (บีบสุด)
ประหยัดน้อย       # ระดับ lite (เบา)
สถิติประหยัด      # ดู token + เงินที่ประหยัด
หยุดประหยัด       # ปิด
```

> ใช้ **คีย์เวิร์ดไทย** เป็นหลัก — วิ่งเข้า hook ชัวร์ทุกเครื่อง ส่วนสแลช `/prayat`, `/prayat-stats` เป็นทางเลือกที่ใช้ได้เมื่อ CLI ส่งข้อความสแลชเข้า hook

### โค้ดย่อตามงาน (พิมพ์ `code: เนื้อหา`)

| โค้ด | ผล | โค้ด | ผล |
|------|-----|------|-----|
| `s:` | สรุป | `f:` | แก้บั๊ก + เหตุ |
| `t:` | แปล (เดาทิศ) | `r:` | รีวิวประเด็นหลัก |
| `e:` | อธิบายสั้น | `c:` | เขียนโค้ด + โน้ต |
| `w:` | ทำไม | `cc:` | โค้ดล้วน |
| `h:` | ขั้นตอน | `i:` | ปรับปรุง/refactor |
| `cmp:` | เปรียบเทียบ | | |

ตัวขยาย: `+` ละเอียดขึ้น · `-` สั้นลง · `?` สั้นสุด · `en` ตอบอังกฤษ
ตารางเต็ม + ตัวอย่าง: [skills/prayat/references/legend.md](skills/prayat/references/legend.md)

## ประหยัดได้เท่าไร (วัดจริง)

| ระดับ | ลดเฉลี่ย | งานสรุป/แก้โค้ด |
|------|---------|------------------|
| lite | ~39% | สูงกว่า |
| moderate | ~41% | 67–80% |
| full | ~61% | 70–80%+ |

ขึ้นกับชนิดงาน — สรุป/แก้โค้ดบีบได้เยอะ, อธิบายยาวบีบได้น้อยกว่า

## โครงสร้าง

```
prayat/
├── .claude-plugin/
│   ├── plugin.json          # manifest
│   └── marketplace.json     # ให้ติดตั้งผ่าน marketplace ได้
├── hooks/
│   ├── hooks.json           # ลงทะเบียน SessionStart + UserPromptSubmit
│   ├── config.js            # state (~/.prayat/state.json)
│   ├── parse.js             # ตีความ trigger (มี unit test)
│   ├── ruleset.js           # ข้อความกติกา (ระดับ/โค้ด/safety/ขอบเขต)
│   ├── session-start.js     # ฉีด ruleset เต็มตอนเปิด session (ถ้าโหมดเปิด)
│   ├── prompt-router.js     # toggle/stats + ย้ำทุก turn (anti-drift)
│   └── stats.js             # อ่าน token จาก transcript JSONL จริง
├── benchmarks/compression.json
├── skills/prayat/           # คู่มือ + legend (model-invokable)
└── tests/                   # node --test (44 เคส)
```

## กลไก

- **SessionStart hook** → ถ้าโหมดเปิด ฉีด ruleset เต็มเข้า context (ครั้งเดียว, ถูก cache)
- **UserPromptSubmit hook** → ตรวจคำสั่ง/คีย์เวิร์ด, อัปเดต state, และย้ำกติกาสั้นๆ ทุก turn กัน "drift" กลับไปตอบยาว
- **ยืนยัน/แสดงสถิติ** ส่งผ่าน `additionalContext` ให้โมเดลพิมพ์ออกมา → เห็นชัดทุก CLI/proxy
- **stats** อ่าน `usage.output_tokens` + `cache_read_input_tokens` จาก transcript `.jsonl` ของเซสชันโดยตรง (ไม่ได้ให้ AI เดา)

## คุณสมบัติเด่น

- **โค้ดย่อตามงาน** — `s:` สรุป · `f:` แก้บั๊ก · `cc:` โค้ดล้วน · `t:` แปล ฯลฯ (ลดทั้งฝั่ง input)
- **3 ระดับ** — lite / moderate / full ปรับความกระชับได้
- **token stats จริง** — อ่านจาก session log โดยตรง ไม่ใช่ AI เดา + ประเมินเงินที่ประหยัด
- **`en`** — สลับตอบอังกฤษเพื่อประหยัดเพิ่ม
- **anti-drift** — ย้ำกติกาทุก turn ไม่กลับไปตอบยาว
- **safety auto-clarity** — เลิกกระชับชั่วคราวตอนคำสั่งอันตราย / security warning

## ทดสอบ

```bash
npm test   # หรือ: node --test tests/test_*.js
```

## License

MIT
