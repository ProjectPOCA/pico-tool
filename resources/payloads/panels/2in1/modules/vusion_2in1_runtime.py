import os
import sys
import time
import framebuf

W = 248
H = 128
BW = (W + 7) // 8
BUF_LEN = BW * H

DEFAULT_LOG_PATH = "/state/vusion_2in1_runtime_log.txt"
DEFAULT_RUN_PATH = "/state/vusion_2in1_runtime_run_id.txt"

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
ARTICLE_COORDS = "Chuckwalla, CA\n624,270 acres\n32.00569\n-109.35672"
ARTICLE_LINES = (
    "Where does one go when the sands turn dry?",
    "Chuckwalla National Monument is named after",
    "the chuckwalla lizard native to this region.",
    "In this PAC you can browse species and sites",
    "for prayer walks, land stories, and care maps.",
)
ARTICLE_PAGE_LINES = 6
CAL_BLACK_BIN = "/images/pac/poca_calibration_2in1_black.bin"
CAL_RED_BIN = "/images/pac/poca_calibration_2in1_red.bin"
CAL_YELLOW_BIN = "/images/pac/poca_calibration_2in1_yellow.bin"

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

SETTINGS_ROWS = (
    ("switch_off", "Switch Off", "toggle"),
    ("date_picker", "Date Picker", "value"),
    ("storage", "Text Field", "value"),
    ("switch_on", "Switch On", "toggle"),
    ("calibrate", "Calibration", "action"),
)


class Runtime:
    """
    Runtime/backend bridge contract (protocol-by-convention):

    backend.init()
    backend.present(black_bytes, red_bytes[, yellow_bytes])
    backend.poll_buttons() -> {A,B,C,UP,DOWN,USER}
    backend.set_led(value)
    """

    def __init__(self, backend, cfg=None):
        cfg = cfg or {}
        self.backend = backend
        self.cfg = cfg
        self.log_path = cfg.get("log_path", DEFAULT_LOG_PATH)
        self.run_path = cfg.get("run_path", DEFAULT_RUN_PATH)
        self.build_tag = cfg.get("build_tag", "runtime_v1")

        self.button_poll_ms = int(cfg.get("button_poll_ms", 25))
        self.event_led_ack = bool(cfg.get("event_led_ack", True))
        self.log_event_timings = bool(cfg.get("log_event_timings", True))
        self.ui_palette = str(cfg.get("ui_palette", "bw")).lower()
        self.text_fix_per_char_mirror = bool(cfg.get("text_fix_per_char_mirror", True))
        self.science_glyph_byte_mirror = bool(cfg.get("science_glyph_byte_mirror", False))
        self.science_bmp_dir = cfg.get("science_bmp_dir", "/images/fonts/science_gothic/bmp/2.1")
        self.calibration_black_bin = cfg.get("calibration_black_bin", CAL_BLACK_BIN)
        self.calibration_red_bin = cfg.get("calibration_red_bin", CAL_RED_BIN)
        self.calibration_yellow_bin = cfg.get("calibration_yellow_bin", CAL_YELLOW_BIN)
        self.calibration_cache = None

        self.state = None
        self.prev_buttons = {"A": 0, "B": 0, "C": 0, "UP": 0, "DOWN": 0, "USER": 1}
        self.combo_latched = False
        self.glyph_cache = {}

    def accent_mode(self):
        if self.ui_palette == "bwr":
            return "red"
        if self.ui_palette == "bwy":
            return "yellow"
        if self.ui_palette == "bwry":
            return "red"
        return None

    def backend_supports_yellow(self):
        return bool(getattr(self.backend, "supports_yellow", False))

    def read_run_id(self):
        try:
            with open(self.run_path, "r") as f:
                return int((f.read() or "0").strip())
        except Exception:
            return 0

    def write_run_id(self, v):
        with open(self.run_path, "w") as f:
            f.write(str(v))

    def log(self, msg):
        try:
            with open(self.log_path, "a") as f:
                f.write("{} | {}\n".format(time.ticks_ms(), msg))
        except Exception:
            pass

    # --- drawing primitives ---
    def set_px(self, buf, x, y):
        if 0 <= x < W and 0 <= y < H:
            buf[(y * BW) + (x // 8)] |= 0x80 >> (x % 8)

    def clear_px(self, buf, x, y):
        if 0 <= x < W and 0 <= y < H:
            buf[(y * BW) + (x // 8)] &= ~(0x80 >> (x % 8))

    def fill_rect(self, buf, x0, y0, x1, y1):
        x0 = max(0, min(W, x0)); x1 = max(0, min(W, x1))
        y0 = max(0, min(H, y0)); y1 = max(0, min(H, y1))
        if x1 <= x0 or y1 <= y0:
            return
        b0 = x0 // 8; b1 = (x1 - 1) // 8
        for y in range(y0, y1):
            row = y * BW
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

    def clear_rect(self, buf, x0, y0, x1, y1):
        x0 = max(0, min(W, x0)); x1 = max(0, min(W, x1))
        y0 = max(0, min(H, y0)); y1 = max(0, min(H, y1))
        if x1 <= x0 or y1 <= y0:
            return
        b0 = x0 // 8; b1 = (x1 - 1) // 8
        for y in range(y0, y1):
            row = y * BW
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

    def rect_outline(self, buf, x0, y0, x1, y1, t=1):
        self.fill_rect(buf, x0, y0, x1, y0 + t)
        self.fill_rect(buf, x0, y1 - t, x1, y1)
        self.fill_rect(buf, x0, y0, x0 + t, y1)
        self.fill_rect(buf, x1 - t, y0, x1, y1)

    def fill_circle(self, buf, cx, cy, r):
        rr = r * r
        for y in range(cy - r, cy + r + 1):
            dy = y - cy
            for x in range(cx - r, cx + r + 1):
                if (x - cx) ** 2 + dy * dy <= rr:
                    self.set_px(buf, x, y)

    def ring(self, buf, cx, cy, ro, ri):
        ro2 = ro * ro; ri2 = ri * ri
        for y in range(cy - ro, cy + ro + 1):
            dy = y - cy
            for x in range(cx - ro, cx + ro + 1):
                d2 = (x - cx) ** 2 + dy * dy
                if ri2 <= d2 <= ro2:
                    self.set_px(buf, x, y)

    def line(self, buf, x0, y0, x1, y1):
        dx = abs(x1 - x0); sx = 1 if x0 < x1 else -1
        dy = -abs(y1 - y0); sy = 1 if y0 < y1 else -1
        err = dx + dy
        while True:
            self.set_px(buf, x0, y0)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy; x0 += sx
            if e2 <= dx:
                err += dx; y0 += sy

    def blit_text_bitmap(self, dest, src, sw, sh, dx, dy, scale, mode="set"):
        sbw = (sw + 7) // 8
        for sy in range(sh):
            for sx in range(sw):
                if self.text_fix_per_char_mirror:
                    ssx = (sx // 8) * 8 + (7 - (sx % 8))
                else:
                    ssx = sx
                if src[(sy * sbw) + (ssx // 8)] & (0x80 >> (ssx % 8)):
                    x0 = dx + sx * scale; y0 = dy + sy * scale
                    if mode == "clear":
                        self.clear_rect(dest, x0, y0, x0 + scale, y0 + scale)
                    else:
                        self.fill_rect(dest, x0, y0, x0 + scale, y0 + scale)

    def text(self, buf, x, y, s):
        tw = len(s) * 8
        if tw <= 0:
            return
        tbw = (tw + 7) // 8
        tbuf = bytearray(tbw * 8)
        framebuf.FrameBuffer(tbuf, tw, 8, framebuf.MONO_HMSB).text(s, 0, 0, 1)
        self.blit_text_bitmap(buf, tbuf, tw, 8, x, y, 1)

    def text_scaled(self, buf, x, y, s, scale):
        tw = len(s) * 8
        if tw <= 0:
            return
        tbw = (tw + 7) // 8
        tbuf = bytearray(tbw * 8)
        framebuf.FrameBuffer(tbuf, tw, 8, framebuf.MONO_HMSB).text(s, 0, 0, 1)
        self.blit_text_bitmap(buf, tbuf, tw, 8, x, y, max(1, scale))

    def text_white(self, buf, x, y, s):
        tw = len(s) * 8
        if tw <= 0:
            return
        tbw = (tw + 7) // 8
        tbuf = bytearray(tbw * 8)
        framebuf.FrameBuffer(tbuf, tw, 8, framebuf.MONO_HMSB).text(s, 0, 0, 1)
        self.blit_text_bitmap(buf, tbuf, tw, 8, x, y, 1, mode="clear")

    def text_scaled_white(self, buf, x, y, s, scale):
        tw = len(s) * 8
        if tw <= 0:
            return
        tbw = (tw + 7) // 8
        tbuf = bytearray(tbw * 8)
        framebuf.FrameBuffer(tbuf, tw, 8, framebuf.MONO_HMSB).text(s, 0, 0, 1)
        self.blit_text_bitmap(buf, tbuf, tw, 8, x, y, max(1, scale), mode="clear")

    # --- clock glyphs ---
    def _bmp_u16(self, d, o):
        return d[o] | (d[o + 1] << 8)

    def _bmp_u32(self, d, o):
        return d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)

    def _bmp_i32(self, d, o):
        v = self._bmp_u32(d, o)
        return v - 0x100000000 if v & 0x80000000 else v

    def load_science_glyph(self, token):
        if token in self.glyph_cache:
            return self.glyph_cache[token]
        path = "{}/sciencegothic_{}.bmp".format(self.science_bmp_dir, token)
        try:
            with open(path, "rb") as f:
                data = f.read()
        except Exception:
            return None

        if len(data) < 64 or data[0] != 0x42 or data[1] != 0x4D:
            return None
        pix_off = self._bmp_u32(data, 10)
        if self._bmp_u32(data, 14) < 40:
            return None

        w = self._bmp_i32(data, 18)
        h_raw = self._bmp_i32(data, 22)
        if self._bmp_u16(data, 26) != 1 or self._bmp_u16(data, 28) != 1 or w <= 0 or h_raw == 0:
            return None

        top_down = h_raw < 0
        h = -h_raw if top_down else h_raw
        src_row = ((w + 31) // 32) * 4
        dst_bw = (w + 7) // 8
        out = bytearray(dst_bw * h)

        for y in range(h):
            sy = y if top_down else (h - 1 - y)
            base = pix_off + sy * src_row
            if base + src_row > len(data):
                return None
            for x in range(w):
                if (data[base + (x // 8)] >> (7 - (x % 8))) & 1 == 0:
                    out[(y * dst_bw) + (x // 8)] |= 0x80 >> (x % 8)

        glyph = (w, h, bytes(out))
        self.glyph_cache[token] = glyph
        return glyph

    def blit_glyph(self, dest, glyph, x, y, mode="set"):
        gw, gh, gbuf = glyph
        gbw = (gw + 7) // 8
        for gy in range(gh):
            row = gy * gbw
            for gx in range(gw):
                if self.science_glyph_byte_mirror:
                    block = (gx // 8) * 8
                    ggx = block + (7 - (gx % 8)) if block + 7 < gw else gx
                else:
                    ggx = gx
                if gbuf[row + (ggx // 8)] & (0x80 >> (ggx % 8)):
                    if mode == "clear":
                        self.clear_px(dest, x + gx, y + gy)
                    else:
                        self.set_px(dest, x + gx, y + gy)

    def draw_science_clock_inline(self, buf, hh, mm):
        tokens = (hh[0], hh[1], "colon", mm[0], mm[1])
        glyphs = []
        for t in tokens:
            g = self.load_science_glyph(t)
            if g is None:
                return False
            glyphs.append(g)

        spacing = 5
        total_w = sum(g[0] for g in glyphs) + spacing * (len(glyphs) - 1)
        x = max(0, (W - total_w) // 2)
        y = 38

        for g in glyphs:
            self.blit_glyph(buf, g, x, y)
            x += g[0] + spacing
        return True

    # --- widgets/screens ---
    def draw_battery(self, buf, bars):
        bars = max(0, min(4, int(bars)))
        x = W - 18
        y = 3
        self.rect_outline(buf, x, y, x + 13, y + 8, 1)
        self.fill_rect(buf, x + 13, y + 2, x + 15, y + 6)
        for i in range(bars):
            self.fill_rect(buf, x + 1 + i * 2, y + 1, x + 3 + i * 2, y + 7)

    def draw_icon_circle(self, buf, cx, cy, r, selected, label):
        if selected:
            self.fill_circle(buf, cx, cy, r)
            self.text_scaled_white(buf, cx - 8, cy - 8, label, 2)
        else:
            self.ring(buf, cx, cy, r, max(1, r - 2))
            self.text_scaled(buf, cx - 8, cy - 8, label, 2)

    def draw_lock(self, black, red, state):
        hh = "{:02d}".format(time.localtime()[3])
        mm = "{:02d}".format(time.localtime()[4])
        if not self.draw_science_clock_inline(black, hh, mm):
            self.text_scaled(black, 70, 38, "{}:{}".format(hh, mm), 3)
        self.text(black, 62, 96, "PRESS B TO UNLOCK")

    def draw_drawer(self, black, red, state):
        page_size = 3
        page_start = (state["app_index"] // page_size) * page_size
        xs = (34, 124, 214)
        r = 24
        for i in range(page_size):
            idx = page_start + i
            if idx >= len(APPS):
                continue
            self.draw_icon_circle(black, xs[i], 48, r, idx == state["app_index"], APPS[idx]["icon"])

        page_count = (len(APPS) + page_size - 1) // page_size
        active_page = state["app_index"] // page_size
        px0 = max(0, (W // 2) - ((page_count * 10) // 2))
        for i in range(page_count):
            cx = px0 + i * 10
            if i == active_page:
                self.fill_circle(black, cx, 112, 3)
            else:
                self.ring(black, cx, 112, 3, 2)

    def draw_dash(self, black, red, state):
        accent = self.accent_mode()
        if accent == "red":
            self.fill_rect(red, 0, 0, W, H)
            self.clear_rect(red, 8, 8, W - 8, H - 8)

        title = CARD_TITLES[state["card"]].upper()
        body = CARD_BODIES[state["card"]].upper()

        self.fill_rect(black, 8, 16, 70, 76)
        self.text_scaled_white(black, 20, 36, "O", 2)

        self.text_scaled(black, 86, 28, title[:8], 2)
        self.text(black, 86, 56, body[:23])
        self.text(black, 86, 68, body[23:46])
        self.text(black, 8, 108, "A BACK")
        self.text(black, 174, 108, "B OPEN")

        self.line(black, 4, 6, 8, 2)
        self.line(black, 8, 2, 12, 6)
        self.line(black, 4, H - 8, 8, H - 4)
        self.line(black, 8, H - 4, 12, H - 8)

    def build_article_pages(self):
        lines = [ARTICLE_TITLE.upper()] + list(ARTICLE_LINES)
        out = [{"kind": "cover"}]
        start = 0
        while start < len(lines):
            out.append({"kind": "text", "lines": lines[start:start + ARTICLE_PAGE_LINES]})
            start += ARTICLE_PAGE_LINES
        return out

    def draw_article(self, black, red, state):
        pages = self.build_article_pages()
        page_idx = max(0, min(len(pages) - 1, state["article_page"]))
        page = pages[page_idx]

        if page["kind"] == "cover":
            self.fill_rect(black, 0, 0, W, H)
            self.text_scaled_white(black, 88, 38, "LOC", 2)
            self.text_white(black, 8, 90, ARTICLE_TITLE.upper()[:30])
        else:
            self.text_scaled(black, 8, 8, "TLALLI", 2)
            y = 32
            for ln in page["lines"]:
                self.text(black, 8, y, ln.upper()[:30])
                y += 14

        self.text(black, W - 46, 2, "{} / {}".format(page_idx + 1, len(pages)))
        self.text(black, W - 10, H - 10, "V")

    def load_calibration_masks(self):
        if self.calibration_cache is not None:
            return self.calibration_cache
        try:
            with open(self.calibration_black_bin, "rb") as f:
                black = f.read()
            with open(self.calibration_red_bin, "rb") as f:
                red = f.read()
            yellow = None
            try:
                with open(self.calibration_yellow_bin, "rb") as f:
                    yellow = f.read()
            except Exception:
                yellow = None
            if len(black) != BUF_LEN or len(red) != BUF_LEN or (yellow is not None and len(yellow) != BUF_LEN):
                self.log("CAL asset bad size black={} red={} yellow={}".format(
                    len(black), len(red), -1 if yellow is None else len(yellow)
                ))
                return None
            self.calibration_cache = (black, red, yellow)
            return self.calibration_cache
        except Exception as e:
            self.log("CAL asset load fail {}".format(e))
            return None

    def draw_calibration_fallback(self, black, red, yellow):
        self.text_scaled(black, 8, 8, "CAL", 2)
        self.rect_outline(black, 8, 28, 88, 116, 2)
        self.line(black, 8, 28, 88, 116)
        self.line(black, 88, 28, 8, 116)
        self.fill_rect(black, 104, 24, 136, 56)
        accent = self.accent_mode()
        if accent == "red":
            self.fill_rect(red, 144, 24, 176, 56)
        elif accent == "yellow" and yellow is not None:
            self.fill_rect(yellow, 144, 24, 176, 56)
        self.text(black, 8, 120, "A BACK")

    def draw_settings(self, black, red, state):
        self.text_scaled(black, 8, 8, "SET", 2)
        y0 = 34
        step = 16
        for i, (key, label, _rtype) in enumerate(SETTINGS_ROWS):
            y = y0 + i * step
            if i == state["settings_focus"]:
                self.fill_rect(black, 0, y - 2, W, y + 10)
                self.text_white(black, 8, y, label.upper()[:20])
            else:
                self.text(black, 8, y, label.upper()[:20])

            if key == "switch_off":
                self.text(black, 190, y, "ON" if state["settings"]["switch_off"] else "OFF")
            elif key == "date_picker":
                self.text(black, 156, y, state["settings"]["date_picker"])
            elif key == "storage":
                self.text(black, 188, y, state["settings"]["storage"])
            elif key == "switch_on":
                self.text(black, 190, y, "ON" if state["settings"]["switch_on"] else "OFF")
            elif key == "calibrate":
                self.text(black, 198, y, "[>]")

    def draw_app_stub(self, black, red, state):
        app = APPS[state["app_index"]]
        self.text_scaled(black, 8, 20, app["title"].upper()[:10], 2)
        self.text(black, 8, 56, "VIEW NOT BUILT YET")
        self.text(black, 8, 74, "A BACK  C DASH")

    def build_layers(self, state):
        black = bytearray(BUF_LEN)
        red = bytearray(BUF_LEN)
        yellow = bytearray(BUF_LEN) if (
            self.ui_palette in ("bwy", "bwry") and self.backend_supports_yellow()
        ) else None

        screen = state["screen"]
        if screen == "lock":
            self.draw_lock(black, red, state)
        elif screen == "drawer":
            self.draw_drawer(black, red, state)
        elif screen == "dash":
            self.draw_dash(black, red, state)
        elif screen == "article":
            self.draw_article(black, red, state)
        elif screen == "calibration":
            masks = self.load_calibration_masks()
            if masks is not None:
                black = bytearray(masks[0])
                red = bytearray(masks[1])
                if yellow is not None and masks[2] is not None:
                    yellow = bytearray(masks[2])
                else:
                    yellow = None
            else:
                self.draw_calibration_fallback(black, red, yellow)
        elif screen == "settings":
            self.draw_settings(black, red, state)
        else:
            self.draw_app_stub(black, red, state)

        if screen != "calibration":
            self.draw_battery(black, state["battery_bars"])
        if yellow is not None and self.accent_mode() == "yellow":
            yellow[:] = red
            red = bytearray(BUF_LEN)
        elif self.accent_mode() is None:
            red = bytearray(BUF_LEN)
            yellow = None

        for i in range(BUF_LEN):
            red[i] &= ~black[i]
            if yellow is not None:
                yellow[i] &= ~black[i]
                yellow[i] &= ~red[i]

        return bytes(black), bytes(red), None if yellow is None else bytes(yellow)

    # --- state machine ---
    def snapshot(self, state):
        return (
            state["screen"],
            state["card"],
            state["article_page"],
            state["app_index"],
            state["settings_focus"],
        )

    def restore(self, state, snap):
        state["screen"], state["card"], state["article_page"], state["app_index"], state["settings_focus"] = snap

    def clone_state(self, state):
        return {
            "screen": state["screen"],
            "card": state["card"],
            "article_page": state["article_page"],
            "app_index": state["app_index"],
            "settings_focus": state["settings_focus"],
            "battery_bars": state["battery_bars"],
            "recent": list(state["recent"]),
            "nav": list(state["nav"]),
            "await_b_release": state.get("await_b_release", False),
            "input_wait_release": state.get("input_wait_release", False),
            "input_block_until": state.get("input_block_until", 0),
            "settings": dict(state["settings"]),
        }

    def push_nav(self, state):
        state["nav"].append(self.snapshot(state))
        if len(state["nav"]) > 40:
            state["nav"] = state["nav"][-40:]

    def update_recent(self, state, idx):
        if idx in state["recent"]:
            state["recent"].remove(idx)
        state["recent"].insert(0, idx)
        state["recent"] = state["recent"][:3]

    def open_app(self, state, idx, push=True):
        idx = int(idx) % len(APPS)
        app = APPS[idx]
        if push:
            self.push_nav(state)
        state["app_index"] = idx
        target = app.get("target", "app")
        if target == "article":
            state["card"] = int(app.get("card", 0)) % len(CARD_TITLES)
            state["article_page"] = 0
            state["screen"] = "article"
        elif target == "settings":
            state["screen"] = "settings"
        else:
            state["screen"] = "app"
        self.update_recent(state, idx)

    def on_back(self, state):
        if state["screen"] == "article" and state["article_page"] > 0:
            state["article_page"] -= 1
            return
        if state["nav"]:
            self.restore(state, state["nav"].pop())
            return
        if state["screen"] != "lock":
            state["screen"] = "drawer"

    def on_primary(self, state):
        if state["screen"] == "lock":
            self.push_nav(state)
            state["screen"] = "drawer"
            state["await_b_release"] = True
            return
        if state["screen"] == "drawer":
            if state.get("await_b_release", False):
                return
            self.open_app(state, state["app_index"])
            return
        if state["screen"] == "settings":
            key, _label, rtype = SETTINGS_ROWS[state["settings_focus"]]
            if rtype == "toggle":
                state["settings"][key] = not state["settings"][key]
            elif key == "date_picker":
                values = ("00/00/0000", "01/01/2026", "02/14/2026")
                cur = state["settings"].get(key, values[0])
                state["settings"][key] = values[(values.index(cur) + 1) % len(values)] if cur in values else values[0]
            elif key == "calibrate":
                self.push_nav(state)
                state["screen"] = "calibration"

    def on_nav(self, state, direction):
        screen = state["screen"]
        if screen == "article":
            max_page = len(self.build_article_pages()) - 1
            state["article_page"] = max(0, min(max_page, state["article_page"] + direction))
        elif screen == "drawer":
            state["app_index"] = (state["app_index"] + direction) % len(APPS)
        elif screen == "dash":
            state["card"] = (state["card"] + direction) % len(CARD_TITLES)
        elif screen == "settings":
            state["settings_focus"] = max(0, min(len(SETTINGS_ROWS) - 1, state["settings_focus"] + direction))

    def apply_event(self, state, event):
        if event == "AC":
            state["screen"] = "drawer"
            return True
        if event in ("USER", "U"):
            state["screen"] = "lock"
            return True
        if event == "C":
            self.push_nav(state)
            state["screen"] = "dash"
            return True
        if event == "A":
            self.on_back(state)
            return True
        if event == "B":
            self.on_primary(state)
            return True
        if event == "UP":
            self.on_nav(state, -1)
            return True
        if event == "DOWN":
            self.on_nav(state, 1)
            return True
        return False

    def _decode_event(self, now):
        event = None
        if now["A"] == 1 and now["C"] == 1:
            if (self.prev_buttons["A"] == 0 or self.prev_buttons["C"] == 0) and not self.combo_latched:
                event = "AC"
                self.combo_latched = True
        else:
            self.combo_latched = False
            if now["A"] == 1 and self.prev_buttons["A"] == 0:
                event = "A"
            elif now["B"] == 1 and self.prev_buttons["B"] == 0:
                event = "B"
            elif now["C"] == 1 and self.prev_buttons["C"] == 0:
                event = "C"
            elif now["UP"] == 1 and self.prev_buttons["UP"] == 0:
                event = "UP"
            elif now["DOWN"] == 1 and self.prev_buttons["DOWN"] == 0:
                event = "DOWN"
            elif now["USER"] == 0 and self.prev_buttons["USER"] == 1:
                event = "USER"
        self.prev_buttons = now
        return event

    def _any_pressed(self, now):
        return (
            now["A"] == 1 or now["B"] == 1 or now["C"] == 1
            or now["UP"] == 1 or now["DOWN"] == 1 or now["USER"] == 0
        )

    def initial_state(self):
        return {
            "screen": "lock",
            "card": 0,
            "article_page": 0,
            "app_index": 0,
            "settings_focus": 0,
            "battery_bars": 3,
            "recent": [0, 1, 2],
            "nav": [],
            "await_b_release": False,
            "input_wait_release": True,
            "input_block_until": time.ticks_add(time.ticks_ms(), 300),
            "settings": {
                "switch_off": False,
                "date_picker": "00/00/0000",
                "storage": "128GB",
                "switch_on": True,
                "calibrate": "[>]",
            },
        }

    def run(self):
        run = self.read_run_id() + 1
        self.write_run_id(run)
        self.log("=== 2IN1 RUNTIME RUN {} START ===".format(run))
        self.log("BUILD {}".format(self.build_tag))
        self.log("FW {}".format(os.uname().version))

        self.backend.init()
        self.state = self.initial_state()

        black, red, yellow = self.build_layers(self.state)
        self.backend.set_led(1)
        if yellow is not None:
            self.backend.present(black, red, yellow)
        else:
            self.backend.present(black, red)
        self.backend.set_led(0)
        self.log("BOOT screen={}".format(self.state["screen"]))

        while True:
            now = self.backend.poll_buttons()

            if self.state.get("input_wait_release", False):
                self.prev_buttons = now
                now_ms = time.ticks_ms()
                if self._any_pressed(now):
                    time.sleep_ms(self.button_poll_ms)
                    continue
                if time.ticks_diff(now_ms, self.state.get("input_block_until", now_ms)) < 0:
                    time.sleep_ms(self.button_poll_ms)
                    continue
                self.state["input_wait_release"] = False

            if self.state.get("await_b_release", False) and now["B"] == 0:
                self.state["await_b_release"] = False

            ev = self._decode_event(now)
            if ev is not None:
                if self.event_led_ack:
                    self.backend.set_led(1)
                t0 = time.ticks_ms()
                candidate = self.clone_state(self.state)
                if self.apply_event(candidate, ev):
                    t1 = time.ticks_ms()
                    black, red, yellow = self.build_layers(candidate)
                    t2 = time.ticks_ms()
                    if yellow is not None:
                        self.backend.present(black, red, yellow)
                    else:
                        self.backend.present(black, red)
                    t3 = time.ticks_ms()

                    self.state = candidate
                    self.state["input_wait_release"] = True
                    self.state["input_block_until"] = time.ticks_add(time.ticks_ms(), 250)
                    if self.log_event_timings:
                        self.log(
                            "EVENT {} screen={} app={} card={} page={} | apply={} build={} frame={}ms".format(
                                ev,
                                self.state["screen"],
                                self.state["app_index"],
                                self.state["card"],
                                self.state["article_page"],
                                time.ticks_diff(t1, t0),
                                time.ticks_diff(t2, t1),
                                time.ticks_diff(t3, t2),
                            )
                        )
                    else:
                        self.log(
                            "EVENT {} screen={} app={} card={} page={}".format(
                                ev,
                                self.state["screen"],
                                self.state["app_index"],
                                self.state["card"],
                                self.state["article_page"],
                            )
                        )
                if self.event_led_ack:
                    self.backend.set_led(0)

            time.sleep_ms(self.button_poll_ms)


def run_runtime(backend, cfg=None):
    rt = Runtime(backend, cfg or {})
    try:
        rt.run()
    except Exception as e:
        rt.log("FATAL {}".format(repr(e)))
        try:
            with open(rt.log_path, "a") as f:
                sys.print_exception(e, f)
        except Exception:
            pass
        raise
