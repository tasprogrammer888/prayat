#!/usr/bin/env python3
"""prayat - image token optimizer.

Vision token cost in Claude is ~ (width_px * height_px) / 750, and depends ONLY
on pixel dimensions - NOT on file size, format, or color. So the way to spend
fewer tokens on an image is to send fewer pixels: downscale (and/or crop).

This tool downscales an image to a token budget (or max dimension) while keeping
the aspect ratio, and reports the before/after token estimate.

Usage:
  python optimize-image.py IMAGE [--out PATH] [--max-tokens N] [--max-dim PX]
                                 [--scale F] [--report] [--selftest]

Examples:
  python optimize-image.py shot.png                 # fit to Claude's optimal cap
  python optimize-image.py shot.png --max-tokens 500
  python optimize-image.py chart.jpg --max-dim 768
  python optimize-image.py shot.png --report        # just estimate, don't resize

Needs Pillow:  pip install pillow
"""
import argparse
import math
import os
import sys

# Force UTF-8 output so Thai prints correctly when captured by tooling or shown in
# modern terminals (Windows consoles otherwise default to cp874 and would garble/crash).
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# Claude vision: tokens ~= pixels / 750. Optimal cap ~1.15 MP / long edge 1568px
# (bigger images are auto-downscaled server-side, so this is the practical max).
PIXELS_PER_TOKEN = 750
CAP_TOKENS = 1600
CAP_LONG_EDGE = 1568


def est_tokens(w, h):
    return round((w * h) / PIXELS_PER_TOKEN)


def target_dims(w, h, max_tokens=None, max_dim=None, scale=None):
    """Return (new_w, new_h) honoring the given constraint(s), keeping aspect ratio.
    With no constraint, fit to Claude's optimal cap. Never upscales."""
    if scale is not None:
        f = scale
    else:
        mt = max_tokens if max_tokens is not None else CAP_TOKENS
        md = max_dim if max_dim is not None else CAP_LONG_EDGE
        f_tokens = math.sqrt((mt * PIXELS_PER_TOKEN) / (w * h)) if (w * h) > 0 else 1.0
        f_dim = md / max(w, h) if max(w, h) > 0 else 1.0
        f = min(f_tokens, f_dim, 1.0)  # never upscale
    nw = max(1, round(w * f))
    nh = max(1, round(h * f))
    return nw, nh


def _fmt_size(n):
    if n >= 1024 * 1024:
        return f"{n/1024/1024:.1f}MB"
    if n >= 1024:
        return f"{n/1024:.0f}KB"
    return f"{n}B"


def optimize(path, out=None, max_tokens=None, max_dim=None, scale=None, report_only=False):
    from PIL import Image

    if not os.path.isfile(path):
        sys.stderr.write(f"prayat: file not found: {path}\n")
        return 1

    with Image.open(path) as im:
        w, h = im.size
        before_tok = est_tokens(w, h)
        before_bytes = os.path.getsize(path)

        nw, nh = target_dims(w, h, max_tokens, max_dim, scale)
        after_tok = est_tokens(nw, nh)
        saved_pct = round((1 - after_tok / before_tok) * 100) if before_tok else 0

        sep = "----------------------------------"
        print(f"\nprayat - image tokens\n{sep}")
        print(f"ไฟล์:    {os.path.basename(path)}  ({_fmt_size(before_bytes)})")
        print(f"เดิม:    {w}x{h}px  ~ {before_tok:,} tokens")

        if report_only:
            print(f"{sep}\n(โหมด --report: ไม่ได้ย่อไฟล์)")
            if (nw, nh) != (w, h):
                print(f"แนะนำ:   ย่อเป็น {nw}x{nh}px ~ {after_tok:,} tokens (ประหยัด ~{saved_pct}%)")
            print(sep)
            return 0

        if (nw, nh) == (w, h):
            print(f"{sep}\nภาพพอดีอยู่แล้ว (<= optimal) - ไม่ต้องย่อ\n{sep}")
            return 0

        if out is None:
            base, ext = os.path.splitext(path)
            out = f"{base}.opt{ext or '.png'}"

        resized = im.resize((nw, nh), Image.LANCZOS)
        out_ext = os.path.splitext(out)[1].lower()
        if out_ext in (".jpg", ".jpeg") and resized.mode in ("RGBA", "P", "LA"):
            resized = resized.convert("RGB")
        save_kwargs = {"quality": 85} if out_ext in (".jpg", ".jpeg", ".webp") else {}
        resized.save(out, **save_kwargs)
        after_bytes = os.path.getsize(out)

        print(f"ใหม่:    {nw}x{nh}px  ~ {after_tok:,} tokens  ({_fmt_size(after_bytes)})")
        print(f"{sep}")
        print(f"ประหยัด: ~{before_tok - after_tok:,} tokens (~{saved_pct}%)")
        print(f"บันทึก:  {out}\n{sep}")
        return 0


def selftest():
    assert est_tokens(750, 750) == 750, est_tokens(750, 750)
    assert est_tokens(1568, 1568) == round(1568 * 1568 / 750)
    # default cap: a big image gets pulled down to <= CAP_LONG_EDGE on the long edge
    nw, nh = target_dims(4000, 3000)
    assert max(nw, nh) <= CAP_LONG_EDGE, (nw, nh)
    assert nw / nh == 4000 / 3000 or abs(nw / nh - 4000 / 3000) < 0.01
    # max-tokens budget respected
    nw, nh = target_dims(2000, 2000, max_tokens=500)
    assert est_tokens(nw, nh) <= 500, est_tokens(nw, nh)
    # never upscales a small image
    assert target_dims(100, 100) == (100, 100)
    assert target_dims(100, 100, max_dim=999) == (100, 100)
    # max-dim respected
    nw, nh = target_dims(3000, 1500, max_dim=768)
    assert max(nw, nh) == 768, (nw, nh)
    # scale
    assert target_dims(1000, 800, scale=0.5) == (500, 400)
    print("optimize-image selftest: all passed OK")
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(description="prayat image token optimizer")
    p.add_argument("image", nargs="?", help="path to the image")
    p.add_argument("--out", help="output path (default: <name>.opt.<ext>)")
    p.add_argument("--max-tokens", type=int, help="downscale so est tokens <= N")
    p.add_argument("--max-dim", type=int, help="long edge <= N px")
    p.add_argument("--scale", type=float, help="scale factor, e.g. 0.5")
    p.add_argument("--report", action="store_true", help="estimate only, do not resize")
    p.add_argument("--selftest", action="store_true", help="run internal checks")
    a = p.parse_args(argv)

    if a.selftest:
        return selftest()
    if not a.image:
        p.error("image path required (or use --selftest)")
    return optimize(a.image, a.out, a.max_tokens, a.max_dim, a.scale, a.report)


if __name__ == "__main__":
    raise SystemExit(main())
