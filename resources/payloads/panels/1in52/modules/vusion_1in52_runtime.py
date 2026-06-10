import os
import sys
import time
import framebuf

W = 200
H = 200
BW = (W + 7) // 8
BUF_LEN = BW * H

PIN_BTN_A = 12
PIN_BTN_B = 13
PIN_BTN_C = 14
PIN_BTN_UP = 15
PIN_BTN_DOWN = 11
PIN_BTN_USER = 23

BUTTON_POLL_MS = 25
EVENT_LED_ACK = True
LOG_EVENT_TIMINGS = True
TEXT_FIX_PER_CHAR_MIRROR = True
SCIENCE_GLYPH_BYTE_MIRROR = False

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
ARTICLE_PAGE_LINES = 5

APPS = (
    {"id": "metztli", "title": "Metztli", "icon": "M", "target": "app"},
    {"id": "teo", "title": "Teo", "icon": "T", "target": "teo_photo"},
    {"id": "ollin", "title": "Ollin", "icon": "O", "target": "article", "card": 2},
    {"id": "tlalli", "title": "Tlalli", "icon": "L", "target": "article", "card": 1},
    {"id": "tlato", "title": "Tlato", "icon": "P", "target": "app"},
    {"id": "amoxtli", "title": "Amoxtli", "icon": "A", "target": "article", "card": 0},
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

GLYPH_CACHE = {}
TEO_IMAGE_CACHE = None
_LOG_BUF = []
LOG_PATH = "/state/vusion_1in52_runtime_log.txt"
RUN_PATH = "/state/vusion_1in52_runtime_run_id.txt"
BUILD_TAG = "runtime_1in52_v1"
SCIENCE_BMP_DIR = "/images/fonts/science_gothic/bmp/2.1"
TEO_BLACK_BIN = "/images/pac/teo_blood_moon_1in5_black.bin"
TEO_RED_BIN = "/images/pac/teo_blood_moon_1in5_red.bin"
TEO_YELLOW_BIN = "/images/pac/teo_blood_moon_1in5_yellow.bin"


def configure(cfg):
    global LOG_PATH, RUN_PATH, BUILD_TAG, SCIENCE_BMP_DIR, TEO_BLACK_BIN, TEO_RED_BIN, TEO_YELLOW_BIN
    global SCIENCE_GLYPH_BYTE_MIRROR
    LOG_PATH = cfg.get("log_path", LOG_PATH)
    RUN_PATH = cfg.get("run_path", RUN_PATH)
    BUILD_TAG = cfg.get("build_tag", BUILD_TAG)
    SCIENCE_BMP_DIR = cfg.get("science_bmp_dir", SCIENCE_BMP_DIR)
    TEO_BLACK_BIN = cfg.get("teo_black_bin", TEO_BLACK_BIN)
    TEO_RED_BIN = cfg.get("teo_red_bin", TEO_RED_BIN)
    TEO_YELLOW_BIN = cfg.get("teo_yellow_bin", TEO_YELLOW_BIN)
    SCIENCE_GLYPH_BYTE_MIRROR = bool(cfg.get("science_glyph_byte_mirror", False))


def log(msg):
    _LOG_BUF.append("{} | {}".format(time.ticks_ms(), msg))


def flush_log():
    try:
        with open(LOG_PATH, "a") as f:
            for line in _LOG_BUF:
                f.write(line + "\n")
        _LOG_BUF.clear()
    except Exception:
        pass


def read_run_id():
    try:
        with open(RUN_PATH, "r") as f:
            return int((f.read() or "0").strip())
    except Exception:
        return 0


def write_run_id(v):
    with open(RUN_PATH, "w") as f:
        f.write(str(v))


class Buttons:
    def __init__(self, backend):
        self.backend = backend
        self.prev = {"A": 0, "B": 0, "C": 0, "UP": 0, "DOWN": 0, "USER": 1}
        self.combo_latched = False

    def _read_now(self):
        return self.backend.poll_buttons()

    def any_pressed(self):
        now = self._read_now()
        return (now["A"] == 1 or now["B"] == 1 or now["C"] == 1 or now["UP"] == 1 or now["DOWN"] == 1 or now["USER"] == 0)

    def sync_prev(self):
        self.prev = self._read_now()
        if not (self.prev["A"] == 1 and self.prev["C"] == 1):
            self.combo_latched = False

    def read_event(self):
        now = self._read_now()
        event = None
        if now["A"] == 1 and now["C"] == 1:
            if (self.prev["A"] == 0 or self.prev["C"] == 0) and not self.combo_latched:
                event = "AC"
                self.combo_latched = True
        else:
            self.combo_latched = False
            if now["A"] == 1 and self.prev["A"] == 0:
                event = "A"
            elif now["B"] == 1 and self.prev["B"] == 0:
                event = "B"
            elif now["C"] == 1 and self.prev["C"] == 0:
                event = "C"
            elif now["UP"] == 1 and self.prev["UP"] == 0:
                event = "UP"
            elif now["DOWN"] == 1 and self.prev["DOWN"] == 0:
                event = "DOWN"
            elif now["USER"] == 0 and self.prev["USER"] == 1:
                event = "USER"
        self.prev = now
        return event


def set_px(buf, x, y):
    if x < 0 or x >= W or y < 0 or y >= H:
        return
    i = (y * BW) + (x // 8)
    buf[i] |= 0x80 >> (x % 8)


def clear_px(buf, x, y):
    if x < 0 or x >= W or y < 0 or y >= H:
        return
    i = (y * BW) + (x // 8)
    buf[i] &= ~(0x80 >> (x % 8))


def fill_rect(buf, x0, y0, x1, y1):
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


def clear_rect(buf, x0, y0, x1, y1):
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


def fill_circle(buf, cx, cy, r):
    rr = r * r
    for y in range(cy - r, cy + r + 1):
        dy = y - cy
        for x in range(cx - r, cx + r + 1):
            dx = x - cx
            if dx * dx + dy * dy <= rr:
                set_px(buf, x, y)


def ring(buf, cx, cy, ro, ri):
    ro2 = ro * ro; ri2 = ri * ri
    for y in range(cy - ro, cy + ro + 1):
        dy = y - cy
        for x in range(cx - ro, cx + ro + 1):
            dx = x - cx
            d2 = dx * dx + dy * dy
            if ri2 <= d2 <= ro2:
                set_px(buf, x, y)


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
            if TEXT_FIX_PER_CHAR_MIRROR:
                char = sx // 8
                in_char = sx % 8
                ssx = (char * 8) + (7 - in_char)
            else:
                ssx = sx
            i = (sy * sbw) + (ssx // 8)
            if src[i] & (0x80 >> (ssx % 8)):
                x0 = dx + (sx * scale); y0 = dy + (sy * scale)
                x1 = dx + ((sx + 1) * scale); y1 = dy + ((sy + 1) * scale)
                if mode == "clear":
                    clear_rect(dest, x0, y0, x1, y1)
                else:
                    fill_rect(dest, x0, y0, x1, y1)


def text(buf, x, y, s):
    tw = len(s) * 8
    if tw <= 0: return
    th = 8; tbw = (tw + 7) // 8
    tbuf = bytearray(tbw * th)
    tfb = framebuf.FrameBuffer(tbuf, tw, th, framebuf.MONO_HMSB)
    tfb.text(s, 0, 0, 1)
    blit_text_bitmap(buf, tbuf, tw, th, x, y, 1, mode="set")


def text_scaled(buf, x, y, s, scale):
    if scale <= 1:
        text(buf, x, y, s); return
    tw = len(s) * 8
    if tw <= 0: return
    th = 8; tbw = (tw + 7) // 8
    tbuf = bytearray(tbw * th)
    tfb = framebuf.FrameBuffer(tbuf, tw, th, framebuf.MONO_HMSB)
    tfb.text(s, 0, 0, 1)
    blit_text_bitmap(buf, tbuf, tw, th, x, y, scale, mode="set")


def text_white(buf, x, y, s):
    tw = len(s) * 8
    if tw <= 0: return
    th = 8; tbw = (tw + 7) // 8
    tbuf = bytearray(tbw * th)
    tfb = framebuf.FrameBuffer(tbuf, tw, th, framebuf.MONO_HMSB)
    tfb.text(s, 0, 0, 1)
    blit_text_bitmap(buf, tbuf, tw, th, x, y, 1, mode="clear")


def text_scaled_white(buf, x, y, s, scale):
    if scale <= 1:
        text_white(buf, x, y, s); return
    tw = len(s) * 8
    if tw <= 0: return
    th = 8; tbw = (tw + 7) // 8
    tbuf = bytearray(tbw * th)
    tfb = framebuf.FrameBuffer(tbuf, tw, th, framebuf.MONO_HMSB)
    tfb.text(s, 0, 0, 1)
    blit_text_bitmap(buf, tbuf, tw, th, x, y, scale, mode="clear")


def _bmp_u16(data, off): return data[off] | (data[off + 1] << 8)
def _bmp_u32(data, off): return data[off] | (data[off+1]<<8) | (data[off+2]<<16) | (data[off+3]<<24)

def _bmp_i32(data, off):
    v = _bmp_u32(data, off)
    return v - 0x100000000 if v & 0x80000000 else v


def load_science_glyph(token):
    if token in GLYPH_CACHE:
        return GLYPH_CACHE[token]
    path = "{}/sciencegothic_{}.bmp".format(SCIENCE_BMP_DIR, token)
    try:
        with open(path, "rb") as f:
            data = f.read()
    except Exception:
        return None
    if len(data) < 64 or data[0] != 0x42 or data[1] != 0x4D:
        return None
    pix_off = _bmp_u32(data, 10); dib = _bmp_u32(data, 14)
    if dib < 40:
        return None
    w = _bmp_i32(data, 18); h_raw = _bmp_i32(data, 22)
    planes = _bmp_u16(data, 26); bpp = _bmp_u16(data, 28)
    if planes != 1 or bpp != 1 or w <= 0 or h_raw == 0:
        return None
    top_down = h_raw < 0
    h = -h_raw if top_down else h_raw
    src_row = ((w + 31) // 32) * 4
    dst_bw = (w + 7) // 8
    out = bytearray(dst_bw * h)
    for y in range(h):
        sy = y if top_down else (h - 1 - y)
        base = pix_off + (sy * src_row)
        if base + src_row > len(data):
            return None
        for x in range(w):
            b = data[base + (x // 8)]
            bit = (b >> (7 - (x % 8))) & 0x01
            if bit == 0:
                i = (y * dst_bw) + (x // 8)
                out[i] |= 0x80 >> (x % 8)
    glyph = (w, h, bytes(out))
    GLYPH_CACHE[token] = glyph
    return glyph


def blit_glyph(dest, glyph, x, y, mode="set"):
    gw, gh, gbuf = glyph; gbw = (gw + 7) // 8
    for gy in range(gh):
        row = gy * gbw
        for gx in range(gw):
            if SCIENCE_GLYPH_BYTE_MIRROR:
                block = (gx // 8) * 8
                ggx = block + (7 - (gx % 8)) if block + 7 < gw else gx
            else:
                ggx = gx
            if gbuf[row + (ggx // 8)] & (0x80 >> (ggx % 8)):
                if mode == "clear":
                    clear_px(dest, x + gx, y + gy)
                else:
                    set_px(dest, x + gx, y + gy)


def wrap_text(s, max_chars):
    words = s.split(" "); lines = []; cur = ""
    for w in words:
        if not cur:
            cur = w
        elif len(cur) + 1 + len(w) <= max_chars:
            cur = cur + " " + w
        else:
            lines.append(cur); cur = w
    if cur:
        lines.append(cur)
    return lines


def draw_text_block(buf, x, y, max_chars, text_value, scale, max_lines, line_gap=2, white=False):
    lines = wrap_text(text_value, max_chars)
    y0 = y; drawn = 0
    for ln in lines:
        if drawn >= max_lines:
            break
        if white:
            text_scaled_white(buf, x, y0, ln, scale)
        else:
            text_scaled(buf, x, y0, ln, scale)
        y0 += (8 * scale) + line_gap
        drawn += 1


def draw_science_clock_2x2(buf, hh, mm):
    tokens = (hh[0], hh[1], mm[0], mm[1])
    glyphs = []
    for t in tokens:
        g = load_science_glyph(t)
        if g is None:
            return False
        glyphs.append(g)
    cell_w = max(g[0] for g in glyphs); cell_h = max(g[1] for g in glyphs)
    col_gap = 8; row_gap = 8
    grid_w = (2 * cell_w) + col_gap; grid_h = (2 * cell_h) + row_gap
    x0 = max(0, (W - grid_w) // 2); y0 = max(12, (H - grid_h) // 2)
    pos = (
        (x0, y0),
        (x0 + cell_w + col_gap, y0),
        (x0, y0 + cell_h + row_gap),
        (x0 + cell_w + col_gap, y0 + cell_h + row_gap),
    )
    for g, (px, py) in zip(glyphs, pos):
        xoff = max(0, (cell_w - g[0]) // 2)
        yoff = max(0, (cell_h - g[1]) // 2)
        blit_glyph(buf, g, px + xoff, py + yoff)
    return True


def draw_battery(buf, bars):
    bars = max(0, min(4, int(bars)))
    x = W - 18; y = 3
    fill_rect(buf, x, y, x + 13, y + 1)
    fill_rect(buf, x, y + 7, x + 13, y + 8)
    fill_rect(buf, x, y, x + 1, y + 8)
    fill_rect(buf, x + 12, y, x + 13, y + 8)
    fill_rect(buf, x + 13, y + 2, x + 15, y + 6)
    if bars >= 1: fill_rect(buf, x + 1, y + 1, x + 3, y + 7)
    if bars >= 2: fill_rect(buf, x + 3, y + 1, x + 5, y + 7)
    if bars >= 3: fill_rect(buf, x + 5, y + 1, x + 7, y + 7)
    if bars >= 4: fill_rect(buf, x + 7, y + 1, x + 9, y + 7)


def draw_icon_circle(buf, cx, cy, r, label):
    fill_circle(buf, cx, cy, r)
    text_scaled_white(buf, cx - 8, cy - 8, label, 2)


def draw_lock(black, state):
    hh = "{:02d}".format(time.localtime()[3])
    mm = "{:02d}".format(time.localtime()[4])
    if not draw_science_clock_2x2(black, hh, mm):
        text_scaled(black, 40, 62, hh, 4)
        text_scaled(black, 40, 108, mm, 4)


def draw_drawer(black, state):
    idx = state["app_index"]
    label = APPS[idx]["icon"]
    draw_icon_circle(black, 120, 100, 44, label)
    count = len(APPS); spacing = 18
    x = 32; y0 = max(14, (H - ((count - 1) * spacing)) // 2)
    for i in range(count):
        cy = y0 + (i * spacing)
        if i == idx:
            fill_circle(black, x, cy, 4)
        else:
            ring(black, x, cy, 4, 3)


def _article_pages():
    lines = [ARTICLE_TITLE.upper()] + [ln.upper() for ln in ARTICLE_LINES]
    pages = []; i = 0
    while i < len(lines):
        pages.append(lines[i : i + ARTICLE_PAGE_LINES])
        i += ARTICLE_PAGE_LINES
    return pages


def draw_article(black, state):
    fill_rect(black, 0, 0, W, H)
    line(black, 96, 16, 100, 10); line(black, 100, 10, 104, 16)
    line(black, 96, H - 16, 100, H - 10); line(black, 100, H - 10, 104, H - 16)
    pages = _article_pages()
    page_idx = max(0, min(len(pages) - 1, state["article_page"]))
    page = pages[page_idx]
    y = 40
    for i, ln in enumerate(page):
        max_chars = 14
        if i == 0:
            draw_text_block(black, 24, y, max_chars, ln, 2, 2, line_gap=4, white=True)
            y += 56
        else:
            draw_text_block(black, 24, y, max_chars, ln, 1, 2, line_gap=3, white=True)
            y += 24


def draw_dash(black, red, state):
    fill_rect(red, 0, 0, W, H)
    title = CARD_TITLES[state["card"]].upper()
    body = CARD_BODIES[state["card"]].upper()
    draw_text_block(red, 20, 44, 14, title, 2, 2, line_gap=3, white=True)
    draw_text_block(red, 20, 110, 16, body, 1, 3, line_gap=3, white=True)


def draw_settings(black, state):
    text_scaled(black, 12, 12, "SET", 2)
    y0 = 44; step = 20
    for i, row in enumerate(SETTINGS_ROWS):
        key, label, _rtype = row
        y = y0 + (i * step)
        if i == state["settings_focus"]:
            fill_rect(black, 0, y - 2, W, y + 12)
            text_white(black, 10, y, label.upper()[:16])
        else:
            text(black, 10, y, label.upper()[:16])
        if key == "switch_off":
            text(black, 152, y, "ON" if state["settings"][key] else "OFF")
        elif key == "date_picker":
            text(black, 132, y, state["settings"][key])
        elif key == "storage":
            text(black, 152, y, state["settings"][key])
        elif key == "switch_on":
            text(black, 152, y, "ON" if state["settings"][key] else "OFF")
        elif key == "calibrate":
            text(black, 152, y, "[>]")


def load_teo_photo_masks():
    global TEO_IMAGE_CACHE
    if TEO_IMAGE_CACHE is not None:
        return TEO_IMAGE_CACHE
    try:
        with open(TEO_BLACK_BIN, "rb") as f:
            black = f.read()
        with open(TEO_RED_BIN, "rb") as f:
            red = f.read()
        yellow = None
        try:
            with open(TEO_YELLOW_BIN, "rb") as f:
                yellow = f.read()
        except Exception:
            yellow = None
        if len(black) != BUF_LEN or len(red) != BUF_LEN or (yellow is not None and len(yellow) != BUF_LEN):
            log("TEO asset bad size black={} red={} yellow={}".format(
                len(black), len(red), -1 if yellow is None else len(yellow)
            ))
            return None
        TEO_IMAGE_CACHE = (black, red, yellow)
        return TEO_IMAGE_CACHE
    except Exception as e:
        log("TEO asset load fail {}".format(e))
        return None


def draw_app_stub(black, state):
    app = APPS[state["app_index"]]
    text_scaled(black, 18, 56, app["title"].upper()[:10], 2)
    text(black, 20, 108, "VIEW NOT BUILT YET")


def draw_calibration_fallback(black):
    text_scaled(black, 16, 18, "CAL", 2)
    rect_outline(black, 18, 44, 182, 172, 2)
    line(black, 18, 44, 182, 172)
    line(black, 182, 44, 18, 172)
    text(black, 20, 180, "A BACK")


def build_layers(state):
    black = bytearray(BUF_LEN)
    red = bytearray(BUF_LEN)
    yellow = None
    screen = state["screen"]
    if screen == "lock":
        draw_lock(black, state)
    elif screen == "drawer":
        draw_drawer(black, state)
    elif screen == "dash":
        draw_dash(black, red, state)
    elif screen == "article":
        draw_article(black, state)
    elif screen == "teo_photo":
        masks = load_teo_photo_masks()
        if masks is not None:
            black = bytearray(masks[0]); red = bytearray(masks[1])
            if masks[2] is not None:
                yellow = bytearray(masks[2])
        else:
            draw_text_block(black, 20, 90, 16, "TEO IMAGE MISSING", 2, 2, line_gap=3)
    elif screen == "calibration":
        masks = load_teo_photo_masks()
        if masks is not None:
            black = bytearray(masks[0]); red = bytearray(masks[1])
            if masks[2] is not None:
                yellow = bytearray(masks[2])
        else:
            draw_calibration_fallback(black)
    elif screen == "settings":
        draw_settings(black, state)
    else:
        draw_app_stub(black, state)
    if screen not in ("teo_photo", "calibration"):
        draw_battery(black, state["battery_bars"])
    for i in range(BUF_LEN):
        red[i] &= ~black[i]
        if yellow is not None:
            yellow[i] &= ~black[i]
            yellow[i] &= ~red[i]
    return black, red, yellow


def snapshot(state):
    return (state["screen"], state["card"], state["article_page"], state["app_index"], state["settings_focus"])


def restore(state, snap):
    state["screen"] = snap[0]; state["card"] = snap[1]
    state["article_page"] = snap[2]; state["app_index"] = snap[3]
    state["settings_focus"] = snap[4]


def clone_state(state):
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


def push_nav(state):
    state["nav"].append(snapshot(state))
    if len(state["nav"]) > 40:
        state["nav"] = state["nav"][-40:]


def go_home(state):
    state["screen"] = "drawer"; state["article_page"] = 0


def go_lock(state):
    state["screen"] = "lock"; state["article_page"] = 0


def go_dash(state):
    push_nav(state); state["screen"] = "dash"


def update_recent(state, app_index):
    if app_index in state["recent"]:
        state["recent"].remove(app_index)
    state["recent"].insert(0, app_index)
    state["recent"] = state["recent"][:3]


def open_app(state, app_index, push=True):
    idx = int(app_index) % len(APPS)
    app = APPS[idx]
    if push:
        push_nav(state)
    state["app_index"] = idx
    target = app.get("target", "app")
    if target == "article":
        state["card"] = int(app.get("card", 0)) % len(CARD_TITLES)
        state["article_page"] = 0
        state["screen"] = "article"
    elif target == "teo_photo":
        state["screen"] = "teo_photo"
    elif target == "settings":
        state["screen"] = "settings"
    else:
        state["screen"] = "app"
    update_recent(state, idx)


def on_back(state):
    if state["screen"] == "article" and state["article_page"] > 0:
        state["article_page"] -= 1; return
    if state["nav"]:
        restore(state, state["nav"].pop()); return
    if state["screen"] != "lock":
        go_home(state)


def on_primary(state):
    if state["screen"] == "lock":
        push_nav(state); go_home(state)
        state["await_b_release"] = True; return
    if state["screen"] == "drawer":
        if state.get("await_b_release", False):
            return
        open_app(state, state["app_index"], push=True); return
    if state["screen"] == "settings":
        key, _label, rtype = SETTINGS_ROWS[state["settings_focus"]]
        if rtype == "toggle":
            state["settings"][key] = not state["settings"][key]
        elif key == "date_picker":
            values = ("00/00/0000", "01/01/2026", "02/14/2026")
            cur = state["settings"][key]
            try:
                i = values.index(cur)
            except ValueError:
                i = 0
            state["settings"][key] = values[(i + 1) % len(values)]
        elif key == "calibrate":
            push_nav(state); state["screen"] = "calibration"


def on_nav(state, direction):
    screen = state["screen"]
    if screen == "article":
        max_page = len(_article_pages()) - 1
        state["article_page"] = max(0, min(max_page, state["article_page"] + direction)); return
    if screen == "drawer":
        state["app_index"] = (state["app_index"] + direction) % len(APPS); return
    if screen == "dash":
        state["card"] = (state["card"] + direction) % len(CARD_TITLES); return
    if screen == "settings":
        max_idx = len(SETTINGS_ROWS) - 1
        state["settings_focus"] = max(0, min(max_idx, state["settings_focus"] + direction)); return


def _state_fingerprint(state):
    s = state["settings"]
    return (
        state["screen"], state["card"], state["article_page"],
        state["app_index"], state["settings_focus"],
        s["switch_off"], s["date_picker"], s["storage"], s["switch_on"],
    )


def apply_event(state, ev):
    before = _state_fingerprint(state)
    if ev == "AC":
        go_home(state)
    elif ev in ("USER", "U"):
        go_lock(state)
    elif ev == "C":
        go_dash(state)
    elif ev == "A":
        on_back(state)
    elif ev == "B":
        on_primary(state)
    elif ev == "UP":
        on_nav(state, -1)
    elif ev == "DOWN":
        on_nav(state, 1)
    return _state_fingerprint(state) != before


def run_runtime(backend, cfg=None):
    try:
        configure(cfg or {})
        run = read_run_id() + 1
        write_run_id(run)
        log("=== 1IN52 RUNTIME RUN {} START ===".format(run))
        log("BUILD {}".format(BUILD_TAG))
        log("FW {}".format(os.uname().version))
        log("GEOM {}x{} bw={} len={}".format(W, H, BW, BUF_LEN))
        flush_log()

        backend.init()
        buttons = Buttons(backend)
        state = {
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

        black, red, yellow = build_layers(state)
        backend.present(black, red, yellow)
        log("RENDER screen={} app={} card={} page={}".format(state["screen"], state["app_index"], state["card"], state["article_page"]))
        flush_log()

        while True:
            if state.get("input_wait_release", False):
                buttons.sync_prev()
                now_ms = time.ticks_ms()
                if buttons.any_pressed():
                    time.sleep_ms(BUTTON_POLL_MS); continue
                if time.ticks_diff(now_ms, state.get("input_block_until", now_ms)) < 0:
                    time.sleep_ms(BUTTON_POLL_MS); continue
                state["input_wait_release"] = False

            if state.get("await_b_release", False):
                now = backend.poll_buttons()
                if now["B"] == 0:
                    state["await_b_release"] = False

            ev = buttons.read_event()
            if ev is not None:
                if EVENT_LED_ACK:
                    backend.set_led(1)
                t0 = time.ticks_ms()
                candidate = clone_state(state)
                if apply_event(candidate, ev):
                    t1 = time.ticks_ms()
                    black, red, yellow = build_layers(candidate)
                    t2 = time.ticks_ms()
                    backend.present(black, red, yellow)
                    t3 = time.ticks_ms()
                    state = candidate
                    state["input_wait_release"] = True
                    state["input_block_until"] = time.ticks_add(time.ticks_ms(), 250)
                    if LOG_EVENT_TIMINGS:
                        log("EVENT {} -> screen={} app={} card={} page={} | ms apply={} build={} frame={}".format(
                            ev, state["screen"], state["app_index"], state["card"], state["article_page"],
                            time.ticks_diff(t1, t0), time.ticks_diff(t2, t1), time.ticks_diff(t3, t2)))
                    else:
                        log("EVENT {} -> screen={} app={} card={} page={}".format(ev, state["screen"], state["app_index"], state["card"], state["article_page"]))
                    flush_log()
                if EVENT_LED_ACK:
                    backend.set_led(0)
            time.sleep_ms(BUTTON_POLL_MS)
    except Exception as e:
        log("FATAL {}".format(repr(e)))
        flush_log()
        try:
            with open(LOG_PATH, "a") as f:
                sys.print_exception(e, f)
        except Exception:
            pass
