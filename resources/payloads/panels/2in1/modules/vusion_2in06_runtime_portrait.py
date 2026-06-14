import time
import framebuf

W = 128
H = 248
BW = (W + 7) // 8
BUF_LEN = BW * H

CARD_TITLES = (
    "Curanderas",
    "Tlalli",
    "Amoxtli",
    "Tlato",
    "Cualli",
)
CARD_BODIES = (
    "Meet healers who still bridge realms in song and dance.",
    "Earth notes from this PAC: coordinates and biome watch.",
    "Stories and codex passages from community memory.",
    "Word path: choose glyphs and build sacred phrases.",
    "Health and safety resources for your local circle.",
)

ARTICLE_TITLE = "Chuckwalla National Monument"
ARTICLE_LINES = (
    "Where does one go when the sands turn dry?",
    "Chuckwalla National Monument is named after",
    "the chuckwalla lizard native to this region.",
    "In this PAC you can browse species and sites",
    "for prayer walks, land stories, and care maps.",
)

APPS = (
    {"id": "metztli", "title": "Metztli", "icon": "M", "target": "app"},
    {"id": "teo", "title": "Teo", "icon": "T", "target": "app"},
    {"id": "ollin", "title": "Ollin", "icon": "O", "target": "article", "card": 2},
    {"id": "tlalli", "title": "Tlalli", "icon": "L", "target": "article", "card": 0},
    {"id": "tlato", "title": "Tlato", "icon": "P", "target": "app"},
    {"id": "amoxtli", "title": "Amoxtli", "icon": "A", "target": "article", "card": 1},
    {"id": "cuilo", "title": "Cuilo", "icon": "C", "target": "app"},
    {"id": "cualli", "title": "Cualli", "icon": "H", "target": "app"},
    {"id": "settings", "title": "Settings", "icon": "S", "target": "settings"},
)


def run_runtime_portrait(backend, cfg, base_runtime_cls):
    rt = base_runtime_cls(backend, cfg)

    rt.w = W
    rt.h = H
    rt.bw = BW
    rt.buf_len = BUF_LEN

    # Override drawing primitives that depended on global landscape constants.
    def set_px(buf, x, y):
        if 0 <= x < rt.w and 0 <= y < rt.h:
            buf[(y * rt.bw) + (x // 8)] |= 0x80 >> (x % 8)

    def clear_px(buf, x, y):
        if 0 <= x < rt.w and 0 <= y < rt.h:
            buf[(y * rt.bw) + (x // 8)] &= ~(0x80 >> (x % 8))

    def fill_rect(buf, x0, y0, x1, y1):
        x0 = max(0, min(rt.w, x0)); x1 = max(0, min(rt.w, x1))
        y0 = max(0, min(rt.h, y0)); y1 = max(0, min(rt.h, y1))
        if x1 <= x0 or y1 <= y0:
            return
        b0 = x0 // 8; b1 = (x1 - 1) // 8
        for y in range(y0, y1):
            row = y * rt.bw
            if b0 == b1:
                for x in range(x0, x1):
                    buf[row + (x // 8)] |= 0x80 >> (x % 8)
                continue
            for x in range(x0, (b0 + 1) * 8):
                buf[row + b0] |= 0x80 >> (x % 8)
            for bi in range(b0 + 1, b1):
                buf[row + bi] = 0xFF
            for x in range(b1 * 8, x1):
                buf[row + b1] |= 0x80 >> (x % 8)

    def clear_rect(buf, x0, y0, x1, y1):
        x0 = max(0, min(rt.w, x0)); x1 = max(0, min(rt.w, x1))
        y0 = max(0, min(rt.h, y0)); y1 = max(0, min(rt.h, y1))
        if x1 <= x0 or y1 <= y0:
            return
        b0 = x0 // 8; b1 = (x1 - 1) // 8
        for y in range(y0, y1):
            row = y * rt.bw
            if b0 == b1:
                for x in range(x0, x1):
                    buf[row + (x // 8)] &= ~(0x80 >> (x % 8))
                continue
            for x in range(x0, (b0 + 1) * 8):
                buf[row + b0] &= ~(0x80 >> (x % 8))
            for bi in range(b0 + 1, b1):
                buf[row + bi] = 0x00
            for x in range(b1 * 8, x1):
                buf[row + b1] &= ~(0x80 >> (x % 8))

    def rect_outline(buf, x0, y0, x1, y1, t=1):
        fill_rect(buf, x0, y0, x1, y0 + t)
        fill_rect(buf, x0, y1 - t, x1, y1)
        fill_rect(buf, x0, y0, x0 + t, y1)
        fill_rect(buf, x1 - t, y0, x1, y1)

    def line(buf, x0, y0, x1, y1):
        dx = abs(x1 - x0); sx = 1 if x0 < x1 else -1
        dy = -abs(y1 - y0); sy = 1 if y0 < y1 else -1
        err = dx + dy
        while True:
            set_px(buf, x0, y0)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy; x0 += sx
            if e2 <= dx:
                err += dx; y0 += sy

    def blit_text_bitmap(dest, src, sw, sh, dx, dy, scale, mode="set"):
        sbw = (sw + 7) // 8
        for sy in range(sh):
            for sx in range(sw):
                ssx = (sx // 8) * 8 + (7 - (sx % 8)) if rt.text_fix_per_char_mirror else sx
                if src[(sy * sbw) + (ssx // 8)] & (0x80 >> (ssx % 8)):
                    x0 = dx + sx * scale; y0 = dy + sy * scale
                    if mode == "clear":
                        clear_rect(dest, x0, y0, x0 + scale, y0 + scale)
                    else:
                        fill_rect(dest, x0, y0, x0 + scale, y0 + scale)

    def blit_text_bitmap_rot90(dest, src, sw, sh, dx, dy, scale, mode="set"):
        # Portrait keeps labels upright for now; no custom rotated transform path.
        blit_text_bitmap(dest, src, sw, sh, dx, dy, scale, mode=mode)

    def text(buf, x, y, s):
        tw = len(s) * 8
        if tw <= 0:
            return
        tbw = (tw + 7) // 8
        tbuf = bytearray(tbw * 8)
        framebuf.FrameBuffer(tbuf, tw, 8, framebuf.MONO_HMSB).text(s, 0, 0, 1)
        blit_text_bitmap(buf, tbuf, tw, 8, x, y, 1)

    def text_scaled(buf, x, y, s, scale):
        tw = len(s) * 8
        if tw <= 0:
            return
        tbw = (tw + 7) // 8
        tbuf = bytearray(tbw * 8)
        framebuf.FrameBuffer(tbuf, tw, 8, framebuf.MONO_HMSB).text(s, 0, 0, 1)
        blit_text_bitmap(buf, tbuf, tw, 8, x, y, max(1, scale))

    def text_scaled_rot90(buf, x, y, s, scale):
        # Portrait keeps labels upright for now; no custom rotated transform path.
        text_scaled(buf, x, y, s, scale)

    def text_white(buf, x, y, s):
        tw = len(s) * 8
        if tw <= 0:
            return
        tbw = (tw + 7) // 8
        tbuf = bytearray(tbw * 8)
        framebuf.FrameBuffer(tbuf, tw, 8, framebuf.MONO_HMSB).text(s, 0, 0, 1)
        blit_text_bitmap(buf, tbuf, tw, 8, x, y, 1, mode="clear")

    def draw_wrapped_text(buf, text_in, x, y, max_w, max_lines, line_h=10):
        words = text_in.upper().split(" ")
        line_txt = ""
        lines = 0
        for wtxt in words:
            cand = wtxt if line_txt == "" else line_txt + " " + wtxt
            if len(cand) * 8 <= max_w:
                line_txt = cand
            else:
                if line_txt:
                    text(buf, x, y + lines * line_h, line_txt)
                    lines += 1
                    if lines >= max_lines:
                        return
                line_txt = wtxt
        if line_txt and lines < max_lines:
            text(buf, x, y + lines * line_h, line_txt)

    def blit_glyph_rot90(dest, glyph, x, y):
        # Portrait keeps clock glyphs upright for now; rely on base blit path.
        rt.blit_glyph(dest, glyph, x, y)

    def draw_science_clock_portrait(buf, hh, mm):
        tokens = (hh[0], hh[1], mm[0], mm[1])
        glyphs = []
        for t in tokens:
            g = rt.load_science_glyph(t)
            if g is None:
                return False
            glyphs.append(g)

        # 2x2 grid, glyphs rendered upright (no custom rotation transform).
        rot_ws = [g[0] for g in glyphs]
        rot_hs = [g[1] for g in glyphs]
        cw = max(rot_ws)
        ch = max(rot_hs)
        gap_x = 2
        gap_y = 6
        total_w = cw * 2 + gap_x
        total_h = ch * 2 + gap_y
        sx = max(0, (rt.w - total_w) // 2)
        sy = max(0, (rt.h - total_h) // 2 - 12)

        positions = (
            (sx, sy),
            (sx + cw + gap_x, sy),
            (sx, sy + ch + gap_y),
            (sx + cw + gap_x, sy + ch + gap_y),
        )
        for g, (gx, gy) in zip(glyphs, positions):
            blit_glyph_rot90(buf, g, gx, gy)
        return True

    def draw_battery(buf, bars):
        bars = max(0, min(4, int(bars)))
        x = rt.w - 18
        y = 3
        rect_outline(buf, x, y, x + 13, y + 8, 1)
        fill_rect(buf, x + 13, y + 2, x + 15, y + 6)
        for i in range(bars):
            fill_rect(buf, x + 1 + i * 2, y + 1, x + 3 + i * 2, y + 7)

    def draw_icon_circle(buf, cx, cy, r, selected, label):
        if selected:
            rt.fill_circle(buf, cx, cy, r)
            text_scaled_rot90(buf, cx - 8, cy - 8, label, 2)
        else:
            rt.ring(buf, cx, cy, r, max(1, r - 2))
            text_scaled_rot90(buf, cx - 8, cy - 8, label, 2)

    def draw_lock(black, red, state):
        hh = "{:02d}".format(time.localtime()[3])
        mm = "{:02d}".format(time.localtime()[4])
        if not draw_science_clock_portrait(black, hh, mm):
            text_scaled(black, 18, 72, "{}{}".format(hh, mm), 3)

    def draw_drawer(black, red, state):
        page_size = 3
        page_start = (state["app_index"] // page_size) * page_size

        # Preserve baseline placement from prior 2.06 layout, represented in portrait.
        cx = 48
        ys = (34, 124, 214)
        r = 24
        for i in range(page_size):
            idx = page_start + i
            if idx >= len(APPS):
                continue
            draw_icon_circle(black, cx, ys[i], r, idx == state["app_index"], APPS[idx]["icon"])

        # Pager kept in equivalent position cluster.
        page_count = (len(APPS) + page_size - 1) // page_size
        active_page = state["app_index"] // page_size
        py0 = max(0, (rt.h // 2) - ((page_count * 10) // 2))
        px = 16
        for i in range(page_count):
            cy = py0 + i * 10
            if i == active_page:
                rt.fill_circle(black, px, cy, 3)
            else:
                rt.ring(black, px, cy, 3, 2)

    def draw_dash(black, red, state):
        title = CARD_TITLES[state["card"]].upper()
        body = CARD_BODIES[state["card"]]

        fill_rect(black, 10, 14, rt.w - 10, 74)
        text_white(black, 18, 26, title[:12])
        draw_wrapped_text(black, body, 12, 84, rt.w - 24, 4, 11)

        # Correctly oriented nav arrows for portrait.
        line(black, rt.w // 2 - 4, 4, rt.w // 2, 0)
        line(black, rt.w // 2 + 4, 4, rt.w // 2, 0)
        line(black, rt.w // 2 - 4, rt.h - 4, rt.w // 2, rt.h)
        line(black, rt.w // 2 + 4, rt.h - 4, rt.w // 2, rt.h)

    def build_article_pages():
        lines = [ARTICLE_TITLE.upper()] + list(ARTICLE_LINES)
        out = [{"kind": "cover"}]
        start = 0
        per_page = 12
        while start < len(lines):
            out.append({"kind": "text", "lines": lines[start:start + per_page]})
            start += per_page
        return out

    def draw_article(black, red, state):
        pages = build_article_pages()
        page_idx = max(0, min(len(pages) - 1, state["article_page"]))
        page = pages[page_idx]

        if page["kind"] == "cover":
            fill_rect(black, 0, 0, rt.w, rt.h)
            text_white(black, 16, 84, "LOC")
            draw_wrapped_text(black, ARTICLE_TITLE, 10, 118, rt.w - 20, 4, 10)
        else:
            text(black, 8, 8, "TLALLI")
            y = 24
            for ln in page["lines"]:
                draw_wrapped_text(black, ln, 8, y, rt.w - 16, 2, 10)
                y += 20
                if y > rt.h - 20:
                    break
        text(black, rt.w - 44, 2, "{}/{}".format(page_idx + 1, len(pages)))
        text(black, rt.w - 8, rt.h - 10, "V")

    def draw_settings(black, red, state):
        text(black, 8, 8, "SETTINGS")
        y0 = 26
        step = 18
        rows = (
            ("switch_off", "Switch Off"),
            ("date_picker", "Date Picker"),
            ("storage", "Storage"),
            ("switch_on", "Switch On"),
            ("calibrate", "Calibrate"),
        )
        for i, (key, label) in enumerate(rows):
            y = y0 + i * step
            if i == state["settings_focus"]:
                fill_rect(black, 0, y - 2, rt.w, y + 10)
                text_white(black, 8, y, label)
            else:
                text(black, 8, y, label)

            if key == "switch_off":
                text(black, 76, y, "ON" if state["settings"]["switch_off"] else "OFF")
            elif key == "date_picker":
                text(black, 48, y, state["settings"]["date_picker"])
            elif key == "storage":
                text(black, 76, y, state["settings"]["storage"])
            elif key == "switch_on":
                text(black, 76, y, "ON" if state["settings"]["switch_on"] else "OFF")
            elif key == "calibrate":
                text(black, 84, y, "[>]")

    def draw_app_stub(black, red, state):
        app = APPS[state["app_index"]]
        text(black, 8, 24, app["title"].upper())
        draw_wrapped_text(black, "VIEW NOT BUILT YET", 8, 48, rt.w - 16, 3, 10)

    def build_layers(state):
        black = bytearray(rt.buf_len)
        red = bytearray(rt.buf_len)
        yellow = bytearray(rt.buf_len) if rt.ui_palette in ("bwy", "bwry") else None

        screen = state["screen"]
        if screen == "lock":
            draw_lock(black, red, state)
        elif screen == "drawer":
            draw_drawer(black, red, state)
        elif screen == "dash":
            draw_dash(black, red, state)
        elif screen == "article":
            draw_article(black, red, state)
        elif screen == "calibration":
            masks = rt.load_calibration_masks()
            if masks is not None:
                black = bytearray(masks[0])
                red = bytearray(masks[1])
                yellow = bytearray(masks[2]) if masks[2] is not None else yellow
            else:
                rt.draw_calibration_fallback(black, red, yellow)
        elif screen == "settings":
            draw_settings(black, red, state)
        else:
            draw_app_stub(black, red, state)

        if screen != "calibration":
            draw_battery(black, state["battery_bars"])
        if yellow is not None and rt.accent_mode() == "yellow":
            yellow[:] = red
            red = bytearray(rt.buf_len)
        elif rt.accent_mode() is None:
            red = bytearray(rt.buf_len)
            yellow = None
        for i in range(rt.buf_len):
            red[i] &= ~black[i]
            if yellow is not None:
                yellow[i] &= ~black[i]
                yellow[i] &= ~red[i]
        return bytes(black), bytes(red), None if yellow is None else bytes(yellow)

    rt.set_px = set_px
    rt.clear_px = clear_px
    rt.fill_rect = fill_rect
    rt.clear_rect = clear_rect
    rt.rect_outline = rect_outline
    rt.line = line
    rt.blit_text_bitmap = blit_text_bitmap
    rt.text = text
    rt.text_scaled = text_scaled
    rt.text_white = text_white
    rt.draw_lock = draw_lock
    rt.draw_drawer = draw_drawer
    rt.draw_dash = draw_dash
    rt.draw_article = draw_article
    rt.draw_settings = draw_settings
    rt.draw_app_stub = draw_app_stub
    rt.build_layers = build_layers

    try:
        rt.run()
    except Exception as e:
        rt.log("FATAL {}".format(repr(e)))
        try:
            import sys
            with open(rt.log_path, "a") as f:
                sys.print_exception(e, f)
        except Exception:
            pass
        raise
