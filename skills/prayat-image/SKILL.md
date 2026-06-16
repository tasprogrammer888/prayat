---
name: prayat-image
description: Reduce the token cost of images/screenshots sent to Claude. Vision tokens depend ONLY on pixel dimensions (~width*height/750) — not file size, format, or color — so the fix is to downscale or crop before sending. Use this whenever the user wants to send an image cheaply, attach a screenshot, lower image/vision token cost, or asks why an image is expensive. Run scripts/optimize-image.py to downscale to a token budget and report the savings.
---

# prayat-image — ลด token ของภาพ

token ของภาพ ≈ (กว้าง × สูง พิกเซล) ÷ 750 — ขึ้นกับ **ขนาดพิกเซล** เท่านั้น ไม่ใช่ขนาดไฟล์/ฟอร์แมต/สี

## ลดได้จริง
- **ย่อขนาด** (downscale) — ตัวหลัก
- **crop** เฉพาะส่วนที่สนใจ
- ภาพที่เป็น **ข้อความ/โค้ด/ตาราง → ส่งเป็น text แทน** (ถูกกว่ามาก + แม่นกว่า)

## ไม่ช่วย (เข้าใจผิดบ่อย)
บีบ JPEG/ลด quality, เปลี่ยน format, grayscale → ไม่ลด token (นับจากพิกเซล)

## ใช้สคริปต์ (ต้องมี Pillow: `pip install pillow`)

```bash
python scripts/optimize-image.py <ภาพ>                 # ย่อให้พอดี optimal cap
python scripts/optimize-image.py <ภาพ> --max-tokens 500 # คุม budget token
python scripts/optimize-image.py <ภาพ> --max-dim 768    # คุมด้านยาวสุด
python scripts/optimize-image.py <ภาพ> --report         # แค่ประเมิน ไม่ย่อ
```
ผลลัพธ์เซฟเป็น `<ชื่อ>.opt.<นามสกุล>` พร้อมรายงาน token ก่อน/หลัง

## เมื่อผู้ใช้ขอส่งภาพให้ Claude แบบประหยัด
1. ถ้าเป็น screenshot ของข้อความ/โค้ด → แนะนำให้ paste เป็น text แทน
2. ถ้าต้องเป็นภาพจริง → รันสคริปต์ย่อก่อนแนบ (เริ่มที่ `--max-tokens 800` สำหรับงานทั่วไป, น้อยกว่านั้นถ้าแค่ดูภาพรวม)
