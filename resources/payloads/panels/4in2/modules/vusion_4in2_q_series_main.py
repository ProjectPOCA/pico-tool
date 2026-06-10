import os
import sys
import time
import gc
import machine
import framebuf

LOG_PATH = "/state/vusion_4in2_q_series_main_log.txt"
RUN_PATH = "/state/vusion_4in2_q_series_main_run_id.txt"

PIN_CS = 17
PIN_SCK = 18
PIN_MOSI = 19
PIN_DC = 20
PIN_RST = 21
PIN_BUSY = 26

PIN_BTN_A = 12
PIN_BTN_B = 13
PIN_BTN_C = 14
PIN_BTN_UP = 15
PIN_BTN_DOWN = 11
PIN_BTN_USER = 23

SPI_ID = 0
SPI_BAUD = 2_000_000
SPI_POLARITY = 0
SPI_PHASE = 0

W = 400
H = 300
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
DRAWER_APPS = (
    "metztli",
    "teo",
    "ollin",
    "tlalli",
    "tlato",
    "amoxtli",
    "cuilo",
    "cualli",
    "settings",
)
DRAWER_LABELS = (
    "M",  # Metztli
    "E",  # Teo
    "O",  # Ollin
    "L",  # Tlalli
    "T",  # Tlato
    "A",  # Amoxtli
    "C",  # Cuilo
    "H",  # Cualli (Health)
    "S",  # Settings
)

ARTICLE_TITLE = "Chuckwalla National Monument"
ARTICLE_COORDS = "Chuckwalla, CA\\n624,270 acres\\n32.00569\\n-109.35672"
ARTICLE_LINES = (
    "Where does one go when the sands turn dry?",
    "Chuckwalla National Monument is named after",
    "the chuckwalla lizard native to this region.",
    "In this PAC you can browse species and sites",
    "for prayer walks, land stories, and care maps.",
)
ARTICLE_PAGE_LINES = 4

PREFLIGHT_BOOT = False
REFRESH_SETTLE_MS = 300
BUTTON_POLL_MS = 25
BUSY_TIMEOUT_MS = 2000
REFRESH_TIMEOUT_MS = 60000
REFRESH_CMD_GUARD_MS = 12
EVENT_LED_ACK = True
LOG_BUTTON_EDGE = False
LOG_EVENT_TIMINGS = True
TEXT_FIX_PER_CHAR_MIRROR = True
SCIENCE_BMP_DIR_4IN2 = "/images/fonts/science_gothic/bmp/4.2"
TEO_BLACK_BIN = "/images/pac/teo_blood_moon_4in2_black.bin"
TEO_RED_BIN = "/images/pac/teo_blood_moon_4in2_red.bin"


def read_run_id():
    try:
        with open(RUN_PATH, "r") as f:
            return int((f.read() or "0").strip())
    except Exception:
        return 0


def write_run_id(v):
    with open(RUN_PATH, "w") as f:
        f.write(str(v))


def log(msg):
    try:
        with open(LOG_PATH, "a") as f:
            f.write("{} | {}\n".format(time.ticks_ms(), msg))
    except Exception:
        pass


GLYPH_CACHE = {}
TEO_IMAGE_CACHE = None
CURRENT_STATE = {"drawer_idx": 0}


class EPD:
    def __init__(self):
        self.cs = machine.Pin(PIN_CS, machine.Pin.OUT, value=1)
        self.dc = machine.Pin(PIN_DC, machine.Pin.OUT, value=1)
        self.rst = machine.Pin(PIN_RST, machine.Pin.OUT, value=1)
        self.busy = machine.Pin(PIN_BUSY, machine.Pin.IN, machine.Pin.PULL_UP)
        self.led = machine.Pin(25, machine.Pin.OUT, value=0)
        self.spi = machine.SPI(
            SPI_ID,
            baudrate=SPI_BAUD,
            polarity=SPI_POLARITY,
            phase=SPI_PHASE,
            sck=machine.Pin(PIN_SCK),
            mosi=machine.Pin(PIN_MOSI),
        )
        self.otp = None

    def cmd(self, reg, data=None):
        self.cs.value(0)
        self.dc.value(0)
        self.spi.write(bytes((reg,)))
        self.cs.value(1)
        if data is not None and len(data):
            self.dc.value(1)
            self.cs.value(0)
            self.spi.write(data)
            self.cs.value(1)

    def reset(self):
        self.rst.value(1)
        time.sleep_ms(10)
        self.rst.value(0)
        time.sleep_ms(20)
        self.rst.value(1)
        time.sleep_ms(10)
        self.wait_busy_high("reset", timeout_ms=1000)

    def wait_busy_high(self, tag, timeout_ms=BUSY_TIMEOUT_MS):
        # Q-series: busy=0, idle=1 (observed on smaller QS panels)
        t0 = time.ticks_ms()
        while self.busy.value() == 0:
            if time.ticks_diff(time.ticks_ms(), t0) > timeout_ms:
                log("{} timeout busy={}".format(tag, self.busy.value()))
                return False
            time.sleep_ms(10)
        return True

    def blink(self, n, on=75, off=75):
        for _ in range(n):
            self.led.value(1)
            time.sleep_ms(on)
            self.led.value(0)
            time.sleep_ms(off)

    def _begin_3wire(self):
        self.spi.deinit()
        self._3sck = machine.Pin(PIN_SCK, machine.Pin.OUT, value=0)
        self._3data = machine.Pin(PIN_MOSI, machine.Pin.OUT, value=0)

    def _end_3wire(self):
        self.spi = machine.SPI(
            SPI_ID,
            baudrate=SPI_BAUD,
            polarity=SPI_POLARITY,
            phase=SPI_PHASE,
            sck=machine.Pin(PIN_SCK),
            mosi=machine.Pin(PIN_MOSI),
        )

    def _spi3_write_byte(self, value):
        self._3data.init(machine.Pin.OUT, value=0)
        for i in range(8):
            self._3data.value((value >> (7 - i)) & 1)
            time.sleep_us(2)
            self._3sck.value(1)
            time.sleep_us(2)
            self._3sck.value(0)
            time.sleep_us(2)

    def _spi3_read_byte(self):
        value = 0
        self._3data.init(machine.Pin.IN, machine.Pin.PULL_UP)
        for i in range(8):
            self._3sck.value(1)
            time.sleep_us(2)
            value |= (self._3data.value() & 1) << (7 - i)
            self._3sck.value(0)
            time.sleep_us(2)
        return value

    def _spi3_cmd(self, reg):
        self.dc.value(0)
        self.cs.value(0)
        self._spi3_write_byte(reg)
        self.cs.value(1)

    def _spi3_data_byte(self, val):
        self.dc.value(1)
        self.cs.value(0)
        self._spi3_write_byte(val)
        self.cs.value(1)

    def _spi3_read_one(self):
        self.dc.value(1)
        self.cs.value(0)
        val = self._spi3_read_byte()
        self.cs.value(1)
        return val

    def read_otp(self):
        self._begin_3wire()
        try:
            self._3sck.init(machine.Pin.OUT, value=0)
            self._3data.init(machine.Pin.OUT, value=0)
            self.dc.value(1)
            self.cs.value(1)
            for addr_lo in (0x00, 0x70):
                self._spi3_cmd(0xA2)
                self._spi3_data_byte(0x00)
                self._spi3_data_byte(0x15)
                self._spi3_data_byte(addr_lo)
                self._spi3_cmd(0xA0)
                self._spi3_cmd(0x92)
                time.sleep_ms(5)
                _dummy = self._spi3_read_one()
                first = self._spi3_read_one()
                log("otp addr_lo=0x{:02X} dummy=0x{:02X} first=0x{:02X}".format(addr_lo, _dummy, first))
                if first == 0xA5:
                    data = bytearray(112)
                    data[0] = first
                    for i in range(1, 112):
                        data[i] = self._spi3_read_one()
                    return bytes(data)
            return None
        finally:
            self._end_3wire()


class Buttons:
    def __init__(self):
        self.a = machine.Pin(PIN_BTN_A, machine.Pin.IN, machine.Pin.PULL_DOWN)
        self.b = machine.Pin(PIN_BTN_B, machine.Pin.IN, machine.Pin.PULL_DOWN)
        self.c = machine.Pin(PIN_BTN_C, machine.Pin.IN, machine.Pin.PULL_DOWN)
        self.up = machine.Pin(PIN_BTN_UP, machine.Pin.IN, machine.Pin.PULL_DOWN)
        self.down = machine.Pin(PIN_BTN_DOWN, machine.Pin.IN, machine.Pin.PULL_DOWN)
        self.user = machine.Pin(PIN_BTN_USER, machine.Pin.IN, machine.Pin.PULL_UP)

        self.prev = {
            "A": 0,
            "B": 0,
            "C": 0,
            "UP": 0,
            "DOWN": 0,
            "USER": 1,
        }

    def read_event(self):
        now = {
            "A": self.a.value(),
            "B": self.b.value(),
            "C": self.c.value(),
            "UP": self.up.value(),
            "DOWN": self.down.value(),
            "USER": self.user.value(),
        }

        event = None
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


def init_qs0a3(epd):
    epd.reset()
    log("INIT qs0a3 reset done busy={}".format(epd.busy.value()))
    otp = epd.read_otp()
    if otp is None:
        log("INIT OTP_FAIL")
    else:
        epd.otp = otp
        log("INIT OTP ok PSR={} TRES={}".format(
            "".join("{:02X}".format(b) for b in otp[17:19]),
            "".join("{:02X}".format(b) for b in otp[19:23]),
        ))


def refresh(epd):
    epd.cmd(0x12, bytes((0x00,)))
    time.sleep_ms(REFRESH_CMD_GUARD_MS)
    epd.wait_busy_high("refresh_12", timeout_ms=REFRESH_TIMEOUT_MS)


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


def get_px(buf, x, y):
    if x < 0 or x >= W or y < 0 or y >= H:
        return 0
    i = (y * BW) + (x // 8)
    return 1 if (buf[i] & (0x80 >> (x % 8))) else 0


def fill_rect(buf, x0, y0, x1, y1):
    x0 = max(0, min(W, x0))
    x1 = max(0, min(W, x1))
    y0 = max(0, min(H, y0))
    y1 = max(0, min(H, y1))
    if x1 <= x0 or y1 <= y0:
        return
    b0 = x0 // 8
    b1 = (x1 - 1) // 8
    for y in range(y0, y1):
        row = y * BW
        if b0 == b1:
            for x in range(x0, x1):
                idx = row + (x // 8)
                buf[idx] |= 0x80 >> (x % 8)
            continue
        # Left partial byte.
        x_left_end = (b0 + 1) * 8
        for x in range(x0, x_left_end):
            idx = row + b0
            buf[idx] |= 0x80 >> (x % 8)
        # Full interior bytes.
        for bi in range(b0 + 1, b1):
            buf[row + bi] = 0xFF
        # Right partial byte.
        x_right_start = b1 * 8
        for x in range(x_right_start, x1):
            idx = row + b1
            buf[idx] |= 0x80 >> (x % 8)


def clear_rect(buf, x0, y0, x1, y1):
    x0 = max(0, min(W, x0))
    x1 = max(0, min(W, x1))
    y0 = max(0, min(H, y0))
    y1 = max(0, min(H, y1))
    if x1 <= x0 or y1 <= y0:
        return
    b0 = x0 // 8
    b1 = (x1 - 1) // 8
    for y in range(y0, y1):
        row = y * BW
        if b0 == b1:
            for x in range(x0, x1):
                idx = row + (x // 8)
                buf[idx] &= ~(0x80 >> (x % 8))
            continue
        # Left partial byte.
        x_left_end = (b0 + 1) * 8
        for x in range(x0, x_left_end):
            idx = row + b0
            buf[idx] &= ~(0x80 >> (x % 8))
        # Full interior bytes.
        for bi in range(b0 + 1, b1):
            buf[row + bi] = 0x00
        # Right partial byte.
        x_right_start = b1 * 8
        for x in range(x_right_start, x1):
            idx = row + b1
            buf[idx] &= ~(0x80 >> (x % 8))


def _rounded_keep(x, y, x0, y0, x1, y1, r, top, bottom):
    if r <= 0:
        return True
    rr = (r - 1) * (r - 1)
    # Top-left corner.
    if top and x < (x0 + r) and y < (y0 + r):
        dx = x - (x0 + r - 1)
        dy = y - (y0 + r - 1)
        return (dx * dx + dy * dy) <= rr
    # Top-right corner.
    if top and x >= (x1 - r) and y < (y0 + r):
        dx = x - (x1 - r)
        dy = y - (y0 + r - 1)
        return (dx * dx + dy * dy) <= rr
    # Bottom-left corner.
    if bottom and x < (x0 + r) and y >= (y1 - r):
        dx = x - (x0 + r - 1)
        dy = y - (y1 - r)
        return (dx * dx + dy * dy) <= rr
    # Bottom-right corner.
    if bottom and x >= (x1 - r) and y >= (y1 - r):
        dx = x - (x1 - r)
        dy = y - (y1 - r)
        return (dx * dx + dy * dy) <= rr
    return True


def _corner_inset_table(r):
    if r <= 1:
        return [0] * max(0, r)
    rr = (r - 1) * (r - 1)
    out = []
    for i in range(r):
        dy = (r - 1) - i
        dx = r - 1
        while (dx * dx + dy * dy) > rr and dx > 0:
            dx -= 1
        out.append((r - 1) - dx)
    return out


def fill_rounded_rect(buf, x0, y0, x1, y1, r, top=True, bottom=True):
    x0 = max(0, min(W, x0))
    x1 = max(0, min(W, x1))
    y0 = max(0, min(H, y0))
    y1 = max(0, min(H, y1))
    if x1 <= x0 or y1 <= y0:
        return
    r = max(0, min(r, (x1 - x0) // 2, (y1 - y0) // 2))
    if r <= 0:
        fill_rect(buf, x0, y0, x1, y1)
        return

    top_cut = r if top else 0
    bot_cut = r if bottom else 0
    inset = _corner_inset_table(r)

    # Middle slab.
    y_mid0 = y0 + top_cut
    y_mid1 = y1 - bot_cut
    if y_mid1 > y_mid0:
        fill_rect(buf, x0, y_mid0, x1, y_mid1)

    # Top rounded rows.
    if top:
        for i in range(r):
            y = y0 + i
            off = inset[i]
            fill_rect(buf, x0 + off, y, x1 - off, y + 1)

    # Bottom rounded rows.
    if bottom:
        for i in range(r):
            y = y1 - r + i
            off = inset[r - 1 - i]
            fill_rect(buf, x0 + off, y, x1 - off, y + 1)


def clear_rounded_rect(buf, x0, y0, x1, y1, r, top=True, bottom=True):
    x0 = max(0, min(W, x0))
    x1 = max(0, min(W, x1))
    y0 = max(0, min(H, y0))
    y1 = max(0, min(H, y1))
    if x1 <= x0 or y1 <= y0:
        return
    r = max(0, min(r, (x1 - x0) // 2, (y1 - y0) // 2))
    if r <= 0:
        clear_rect(buf, x0, y0, x1, y1)
        return

    top_cut = r if top else 0
    bot_cut = r if bottom else 0
    inset = _corner_inset_table(r)

    # Middle slab.
    y_mid0 = y0 + top_cut
    y_mid1 = y1 - bot_cut
    if y_mid1 > y_mid0:
        clear_rect(buf, x0, y_mid0, x1, y_mid1)

    # Top rounded rows.
    if top:
        for i in range(r):
            y = y0 + i
            off = inset[i]
            clear_rect(buf, x0 + off, y, x1 - off, y + 1)

    # Bottom rounded rows.
    if bottom:
        for i in range(r):
            y = y1 - r + i
            off = inset[r - 1 - i]
            clear_rect(buf, x0 + off, y, x1 - off, y + 1)


def rect_outline(buf, x0, y0, x1, y1, t=1):
    fill_rect(buf, x0, y0, x1, y0 + t)
    fill_rect(buf, x0, y1 - t, x1, y1)
    fill_rect(buf, x0, y0, x0 + t, y1)
    fill_rect(buf, x1 - t, y0, x1, y1)


def fill_circle(buf, cx, cy, r):
    rr = r * r
    for y in range(cy - r, cy + r + 1):
        dy = y - cy
        for x in range(cx - r, cx + r + 1):
            dx = x - cx
            if dx * dx + dy * dy <= rr:
                set_px(buf, x, y)


def ring(buf, cx, cy, ro, ri):
    ro2 = ro * ro
    ri2 = ri * ri
    for y in range(cy - ro, cy + ro + 1):
        dy = y - cy
        for x in range(cx - ro, cx + ro + 1):
            dx = x - cx
            d2 = dx * dx + dy * dy
            if ri2 <= d2 <= ro2:
                set_px(buf, x, y)


def text(buf, x, y, s):
    tw = len(s) * 8
    th = 8
    if tw <= 0:
        return
    tbw = (tw + 7) // 8
    tbuf = bytearray(tbw * th)
    tfb = framebuf.FrameBuffer(tbuf, tw, th, framebuf.MONO_HMSB)
    tfb.text(s, 0, 0, 1)
    blit_text_bitmap(buf, tbuf, tw, th, x, y, 1, mode="set")


def text_scaled(buf, x, y, s, scale):
    if scale <= 1:
        text(buf, x, y, s)
        return

    tw = len(s) * 8
    th = 8
    tbw = (tw + 7) // 8
    tbuf = bytearray(tbw * th)
    tfb = framebuf.FrameBuffer(tbuf, tw, th, framebuf.MONO_HMSB)
    tfb.text(s, 0, 0, 1)
    blit_text_bitmap(buf, tbuf, tw, th, x, y, scale, mode="set")


def text_white(buf, x, y, s):
    tw = len(s) * 8
    th = 8
    if tw <= 0:
        return
    tbw = (tw + 7) // 8
    tbuf = bytearray(tbw * th)
    tfb = framebuf.FrameBuffer(tbuf, tw, th, framebuf.MONO_HMSB)
    tfb.text(s, 0, 0, 1)
    blit_text_bitmap(buf, tbuf, tw, th, x, y, 1, mode="clear")


def text_scaled_white(buf, x, y, s, scale):
    if scale <= 1:
        text_white(buf, x, y, s)
        return
    tw = len(s) * 8
    th = 8
    tbw = (tw + 7) // 8
    tbuf = bytearray(tbw * th)
    tfb = framebuf.FrameBuffer(tbuf, tw, th, framebuf.MONO_HMSB)
    tfb.text(s, 0, 0, 1)
    blit_text_bitmap(buf, tbuf, tw, th, x, y, scale, mode="clear")


def chars_fit(width_px, scale=1):
    px = max(1, 8 * max(1, scale))
    return max(1, width_px // px)


def wrap_words(s, max_chars, max_lines):
    words = s.split(" ")
    out = []
    line = ""
    for w in words:
        if not w:
            continue
        candidate = w if line == "" else (line + " " + w)
        if len(candidate) <= max_chars:
            line = candidate
            continue
        if line:
            out.append(line)
            if len(out) >= max_lines:
                return out
        # Hard split very long token.
        if len(w) > max_chars:
            out.append(w[:max_chars])
            if len(out) >= max_lines:
                return out
            line = w[max_chars:]
        else:
            line = w
    if line and len(out) < max_lines:
        out.append(line)
    return out


def draw_text_block(buf, x, y, width_px, text_value, scale, max_lines, line_gap=2):
    max_chars = chars_fit(width_px, scale)
    lines = wrap_words(text_value, max_chars, max_lines)
    lh = (8 * max(1, scale)) + line_gap
    yy = y
    for ln in lines:
        if scale > 1:
            text_scaled(buf, x, yy, ln, scale)
        else:
            text(buf, x, yy, ln)
        yy += lh


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
                x0 = dx + (sx * scale)
                y0 = dy + (sy * scale)
                x1 = dx + ((sx + 1) * scale)
                y1 = dy + ((sy + 1) * scale)
                if mode == "clear":
                    clear_rect(dest, x0, y0, x1, y1)
                else:
                    fill_rect(dest, x0, y0, x1, y1)


def _bmp_u16(data, off):
    return data[off] | (data[off + 1] << 8)


def _bmp_u32(data, off):
    return data[off] | (data[off + 1] << 8) | (data[off + 2] << 16) | (data[off + 3] << 24)


def _bmp_i32(data, off):
    v = _bmp_u32(data, off)
    if v & 0x80000000:
        v -= 0x100000000
    return v


def load_science_glyph(token):
    if token in GLYPH_CACHE:
        return GLYPH_CACHE[token]
    path = "{}/sciencegothic_{}.bmp".format(SCIENCE_BMP_DIR_4IN2, token)
    try:
        with open(path, "rb") as f:
            data = f.read()
    except Exception:
        return None

    if len(data) < 64 or data[0] != 0x42 or data[1] != 0x4D:
        return None

    pix_off = _bmp_u32(data, 10)
    dib = _bmp_u32(data, 14)
    if dib < 40:
        return None

    w = _bmp_i32(data, 18)
    h_raw = _bmp_i32(data, 22)
    planes = _bmp_u16(data, 26)
    bpp = _bmp_u16(data, 28)
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
            # BMP palette index: 0 = black, 1 = white
            if bit == 0:
                i = (y * dst_bw) + (x // 8)
                out[i] |= 0x80 >> (x % 8)

    glyph = (w, h, bytes(out))
    GLYPH_CACHE[token] = glyph
    return glyph


def blit_glyph(dest, glyph, x, y, mode="set"):
    gw, gh, gbuf = glyph
    gbw = (gw + 7) // 8
    for gy in range(gh):
        row = gy * gbw
        for gx in range(gw):
            if gbuf[row + (gx // 8)] & (0x80 >> (gx % 8)):
                if mode == "clear":
                    clear_px(dest, x + gx, y + gy)
                else:
                    set_px(dest, x + gx, y + gy)


def draw_battery(buf, bars):
    bars = max(0, min(4, int(bars)))
    x = W - 36
    y = 8
    rect_outline(buf, x, y, x + 22, y + 11, 1)
    fill_rect(buf, x + 22, y + 3, x + 25, y + 8)
    slot_w = 4
    for i in range(bars):
        fill_rect(buf, x + 2 + (i * (slot_w + 1)), y + 2, x + 2 + (i * (slot_w + 1)) + slot_w, y + 9)


def draw_culture_ribbon(buf):
    fill_rect(buf, 0, 0, 28, H)
    y = 10
    while y < H - 8:
        fill_circle(buf, 14, y, 5)
        y += 32


def draw_lock(buf, now_t):
    rect_outline(buf, 288, 24, 289, 272, 1)

    hh = "{:02d}".format(now_t[3])
    mm = "{:02d}".format(now_t[4])
    tokens = (hh[0], hh[1], mm[0], mm[1])
    glyphs = []
    ok = True
    for t in tokens:
        g = load_science_glyph(t)
        if g is None:
            ok = False
            break
        glyphs.append(g)
    if ok:
        cell_w = max(g[0] for g in glyphs)
        cell_h = max(g[1] for g in glyphs)
        col_gap = 8
        row_gap = 12
        grid_w = (2 * cell_w) + col_gap
        left_min = 34
        left_max = 282
        avail = left_max - left_min
        gx0 = left_min + max(0, (avail - grid_w) // 2)
        gy0 = 48
        pos = (
            (gx0, gy0),
            (gx0 + cell_w + col_gap, gy0),
            (gx0, gy0 + cell_h + row_gap),
            (gx0 + cell_w + col_gap, gy0 + cell_h + row_gap),
        )
        for g, (px, py) in zip(glyphs, pos):
            xoff = max(0, (cell_w - g[0]) // 2)
            yoff = max(0, (cell_h - g[1]) // 2)
            blit_glyph(buf, g, px + xoff, py + yoff)
    else:
        # Fallback only if glyph assets are missing on device.
        text_scaled(buf, 82, 80, hh, 7)
        text_scaled(buf, 82, 152, mm, 7)
    text(buf, 95, 272, "PRESS O TO UNLOCK")

    # quick launch dots/icons (placeholder geometry)
    fill_circle(buf, 334, 66, 26)
    ring(buf, 334, 66, 12, 9)
    fill_circle(buf, 334, 140, 26)
    ring(buf, 334, 140, 10, 7)
    fill_circle(buf, 334, 214, 26)
    ring(buf, 334, 214, 11, 8)


def draw_drawer(buf):
    sel = 0
    try:
        sel = max(0, min(len(DRAWER_APPS) - 1, int(CURRENT_STATE.get("drawer_idx", 0))))
    except Exception:
        sel = 0
    cols = (138, 216, 294)
    rows = (70, 144, 218)
    idx = 0
    for cy in rows:
        for cx in cols:
            selected = idx == sel
            if selected:
                fill_circle(buf, cx, cy, 25)
            else:
                ring(buf, cx, cy, 25, 1)
            label = DRAWER_LABELS[idx]
            if selected:
                text_white(buf, cx - 4, cy - 4, label)
            else:
                text(buf, cx - 4, cy - 4, label)
            idx += 1


def draw_dash(buf, card_idx):
    rect_outline(buf, 34, 26, 367, 275, 2)
    fill_rect(buf, 34, 26, 367, 140)
    # carve lower body white by clearing bits in region via overwrite buffer copy trick
    for y in range(140, 273):
        row = y * BW
        for x in range(36, 365):
            idx = row + (x // 8)
            buf[idx] &= ~(0x80 >> (x % 8))

    text_scaled(buf, 174, 58, "O", 5)
    title = CARD_TITLES[card_idx].upper()
    body = CARD_BODIES[card_idx].upper()
    text_scaled(buf, 66, 164, title[:12], 3)
    text(buf, 66, 208, body[:44])
    text(buf, 66, 224, body[44:88])
    text(buf, 66, 256, "O READ ARTICLE")
    text(buf, 284, 256, "NEXT")


def draw_dash_tricolor(black_buf, red_buf, card_idx):
    # Rounded outer card shell as red outline.
    fill_rounded_rect(red_buf, 34, 26, 367, 275, 30, top=True, bottom=True)
    clear_rounded_rect(red_buf, 30 + 8, 26 + 8, 367 - 8, 275 - 8, 22, top=True, bottom=True)

    # Controlled red test area: hero slab only.
    fill_rounded_rect(red_buf, 34, 26, 367, 140, 30, top=True, bottom=False)
    # Keep hero lower edge flat (prototype behavior).
    fill_rect(red_buf, 34, 110, 367, 140)

    # Keep lower body white.
    clear_rect(black_buf, 36, 140, 365, 273)

    text_scaled(black_buf, 174, 58, "O", 5)
    title = CARD_TITLES[card_idx].upper()
    body = CARD_BODIES[card_idx].upper()
    draw_text_block(black_buf, 66, 164, 265, title, 2, 1, line_gap=3)
    draw_text_block(black_buf, 66, 204, 265, body, 1, 2, line_gap=4)
    text(black_buf, 66, 256, "O READ ARTICLE")
    text(black_buf, 284, 256, "NEXT")


def draw_article(buf, page_idx):
    # Rounded hero card, per prototype.
    fill_rounded_rect(buf, 32, 22, 368, 132, 24, top=True, bottom=True)

    # Hero icon/label in white over dark hero.
    text_scaled_white(buf, 52, 42, "LOC", 3)
    coords = ARTICLE_COORDS.split("\\n")
    y = 36
    for line in coords:
        text_white(buf, 148, y, line[:24].upper())
        y += 16

    lines = [ARTICLE_TITLE.upper()] + list(ARTICLE_LINES)
    start = page_idx * ARTICLE_PAGE_LINES
    chunk = lines[start : start + ARTICLE_PAGE_LINES]
    y = 154
    for ln in chunk:
        draw_text_block(buf, 34, y, 330, ln.upper(), 1, 2, line_gap=2)
        y += 22
        if y > 268:
            break

    total_pages = (len(lines) + ARTICLE_PAGE_LINES - 1) // ARTICLE_PAGE_LINES
    page_label = "{} / {}".format(page_idx + 1, total_pages)
    text(buf, W - 62, 10, page_label)
    text(buf, W - 24, H - 18, "V")


def draw_nopac(buf):
    fill_rect(buf, 164, 92, 236, 146)
    text_scaled(buf, 108, 162, "NO PAC", 3)
    text(buf, 78, 200, "INSERT YOUR PAC INTO THE SLOT")


def draw_settings(buf, profile):
    text_scaled(buf, 28, 30, "SETTINGS", 3)
    text(buf, 24, 86, "PROFILE: {}".format(profile))
    text(buf, 24, 108, "A LOCK  B ARTICLE  C CYCLE")
    text(buf, 24, 130, "USER DRAWER  UP/DOWN SCROLL")
    text(buf, 24, 152, "QS0A3 DRIVER ACTIVE")


def load_teo_photo_masks():
    global TEO_IMAGE_CACHE
    if TEO_IMAGE_CACHE is not None:
        return TEO_IMAGE_CACHE
    try:
        with open(TEO_BLACK_BIN, "rb") as f:
            black = f.read()
        with open(TEO_RED_BIN, "rb") as f:
            red = f.read()
        if len(black) != BUF_LEN or len(red) != BUF_LEN:
            log("TEO asset bad size black={} red={}".format(len(black), len(red)))
            return None
        TEO_IMAGE_CACHE = (black, red)
        return TEO_IMAGE_CACHE
    except Exception as e:
        log("TEO asset load fail {}".format(e))
        return None


def draw_red_screen_border(black, red, thickness):
    t = max(1, int(thickness))
    # Keep the border zone dedicated to red.
    clear_rect(black, 0, 0, W, t)
    clear_rect(black, 0, H - t, W, H)
    clear_rect(black, 0, 0, t, H)
    clear_rect(black, W - t, 0, W, H)
    fill_rect(red, 0, 0, W, t)
    fill_rect(red, 0, H - t, W, H)
    fill_rect(red, 0, 0, t, H)
    fill_rect(red, W - t, 0, W, H)


def build_layers(state):
    black = bytearray(BUF_LEN)
    red = bytearray(BUF_LEN)

    if state["screen"] == "lock":
        draw_culture_ribbon(red)
        draw_lock(black, time.localtime())
    elif state["screen"] == "drawer":
        draw_culture_ribbon(red)
        draw_drawer(black)
    elif state["screen"] == "dash":
        draw_dash_tricolor(black, red, state["card"])
    elif state["screen"] == "article":
        draw_article(black, state["article_page"])
    elif state["screen"] == "teo_photo":
        masks = load_teo_photo_masks()
        if masks is not None:
            black = bytearray(masks[0])
            red = bytearray(masks[1])
        else:
            text_scaled(black, 36, 128, "TEO IMAGE MISSING", 3)
    elif state["screen"] == "nopac":
        draw_nopac(black)
    else:
        draw_settings(black, "VUSION 4.2")

    if state["screen"] != "teo_photo":
        draw_battery(black, state["battery_bars"])

    # Ensure red never overlaps black pixels.
    for i in range(BUF_LEN):
        red[i] &= ~black[i]

    return bytes(black), bytes(red)


C_BLACK = 0b00
C_WHITE = 0b01
C_YELLOW = 0b10
C_RED = 0b11
BUF_2BPP = W * H * 2 // 8


def _pack_frame(black_mask, red_mask, yellow_mask=None):
    use_yellow = yellow_mask is not None
    buf = bytearray(BUF_2BPP)
    for y in range(H):
        row_off = y * BW
        for x in range(0, W, 4):
            packed = 0
            for dx in range(4):
                px = x + dx
                bi = row_off + (px // 8)
                bit = 0x80 >> (px % 8)
                if black_mask[bi] & bit:
                    color = C_BLACK
                elif red_mask[bi] & bit:
                    color = C_RED
                elif use_yellow and yellow_mask[bi] & bit:
                    color = C_YELLOW
                else:
                    color = C_WHITE
                packed |= color << (6 - dx * 2)
            buf[(y * W + x) // 4] = packed
    return bytes(buf)


def write_frame(epd, black_mask, red_mask, yellow_mask=None):
    gc.collect()
    frame_2bpp = _pack_frame(black_mask, red_mask, yellow_mask)
    if epd.otp is None:
        log("write_frame: otp not loaded, skipping render")
        return
    otp = epd.otp
    epd.reset()
    epd.cmd(0xE0, bytes((0x02,)))
    epd.cmd(0xE6, bytes((0x19,)))
    epd.cmd(0x01, otp[16:17])
    epd.cmd(0x00, otp[17:19])
    epd.cmd(0x03, otp[30:33])
    epd.cmd(0x06, otp[23:26])
    epd.cmd(0x50, bytes((otp[39],)))
    epd.cmd(0x60, otp[40:42])
    epd.cmd(0x61, otp[19:23])
    epd.cmd(0xE3, bytes((otp[42],)))
    epd.cmd(0xE7, bytes((otp[33],)))
    epd.cmd(0x65, otp[34:38])
    epd.cmd(0x30, bytes((otp[38],)))
    epd.cmd(0xE9, bytes((0x01,)))
    epd.cmd(0x04, bytes((0x00,)))
    epd.wait_busy_high("pon_04")
    epd.cmd(0x10, frame_2bpp)
    refresh(epd)
    epd.cmd(0x02, bytes((0x00,)))
    epd.wait_busy_high("pof_02")
    time.sleep_ms(REFRESH_SETTLE_MS)


def boot_preflight(epd):
    if not PREFLIGHT_BOOT:
        return
    white = bytes((0x00,)) * BUF_LEN
    black = bytes((0xFF,)) * BUF_LEN

    write_frame(epd, white, white)
    log("PREFLIGHT WHITE")
    time.sleep_ms(250)

    write_frame(epd, black, white)
    log("PREFLIGHT BLACK")
    time.sleep_ms(250)

    write_frame(epd, white, white)
    log("PREFLIGHT WHITE2")
    time.sleep_ms(250)


def total_article_pages():
    total_lines = 1 + len(ARTICLE_LINES)
    return max(1, (total_lines + ARTICLE_PAGE_LINES - 1) // ARTICLE_PAGE_LINES)


def apply_event(state, event):
    changed = False

    if event == "A":
        if state["screen"] != "lock":
            state["screen"] = "lock"
            changed = True

    elif event == "B":
        if state["screen"] == "lock":
            state["screen"] = "drawer"
            state["await_b_release"] = True
            changed = True
        elif state.get("await_b_release", False):
            changed = False
        elif state["screen"] == "drawer":
            idx = state["drawer_idx"] % len(DRAWER_APPS)
            app = DRAWER_APPS[idx]
            log("DRAWER_OPEN idx={} app={}".format(idx, app))
            if app == "teo":
                state["screen"] = "teo_photo"
            elif app in ("tlalli", "ollin"):
                state["screen"] = "article"
            elif app == "settings":
                state["screen"] = "settings"
            else:
                state["screen"] = "dash"
            changed = True
        elif state["screen"] == "article":
            state["screen"] = "dash"
            changed = True
        else:
            state["screen"] = "article"
            changed = True

    elif event == "C":
        cycle = ("dash", "settings", "nopac")
        idx = 0
        for i, name in enumerate(cycle):
            if state["screen"] == name:
                idx = i
                break
        state["screen"] = cycle[(idx + 1) % len(cycle)]
        changed = True

    elif event == "USER":
        if state["screen"] != "drawer":
            state["screen"] = "drawer"
            changed = True

    elif event == "UP":
        if state["screen"] == "drawer":
            state["drawer_idx"] = (state["drawer_idx"] - 1) % len(DRAWER_APPS)
            changed = True
        elif state["screen"] == "article":
            if state["article_page"] > 0:
                state["article_page"] -= 1
                changed = True
        else:
            if state["screen"] != "dash":
                state["screen"] = "dash"
                changed = True
            state["card"] = (state["card"] - 1) % len(CARD_TITLES)
            changed = True

    elif event == "DOWN":
        if state["screen"] == "drawer":
            state["drawer_idx"] = (state["drawer_idx"] + 1) % len(DRAWER_APPS)
            changed = True
        elif state["screen"] == "article":
            max_page = total_article_pages() - 1
            if state["article_page"] < max_page:
                state["article_page"] += 1
                changed = True
        else:
            if state["screen"] != "dash":
                state["screen"] = "dash"
                changed = True
            state["card"] = (state["card"] + 1) % len(CARD_TITLES)
            changed = True

    return changed


def main():
    try:
        run = read_run_id() + 1
        write_run_id(run)
        log("=== 4IN2 Q SERIES RUN {} START ===".format(run))
        log("FW {}".format(os.uname().version))
        log("GEOM {}x{} Q-BWRY".format(W, H))

        epd = EPD()
        buttons = Buttons()

        init_qs0a3(epd)
        log("PREFLIGHT enabled={}".format(PREFLIGHT_BOOT))
        boot_preflight(epd)

        state = {
            "screen": "lock",
            "card": 0,
            "drawer_idx": 0,
            "article_page": 0,
            "battery_bars": 3,
            "await_b_release": False,
        }
        CURRENT_STATE.update(state)

        black, red = build_layers(state)
        write_frame(epd, black, red)
        log("RENDER screen={} card={} page={}".format(state["screen"], state["card"], state["article_page"]))

        while True:
            if state.get("await_b_release", False) and buttons.b.value() == 0:
                state["await_b_release"] = False
            ev = buttons.read_event()
            if ev is not None:
                if LOG_BUTTON_EDGE:
                    log("BTN {}".format(ev))
                if EVENT_LED_ACK:
                    epd.led.value(1)
                t0 = time.ticks_ms()
                if apply_event(state, ev):
                    CURRENT_STATE.update(state)
                    t1 = time.ticks_ms()
                    black, red = build_layers(state)
                    t2 = time.ticks_ms()
                    write_frame(epd, black, red)
                    t3 = time.ticks_ms()
                    if LOG_EVENT_TIMINGS:
                        log(
                            "EVENT {} -> screen={} card={} page={} | ms apply={} build={} frame={}".format(
                                ev,
                                state["screen"],
                                state["card"],
                                state["article_page"],
                                time.ticks_diff(t1, t0),
                                time.ticks_diff(t2, t1),
                                time.ticks_diff(t3, t2),
                            )
                        )
                    else:
                        log("EVENT {} -> screen={} card={} page={}".format(ev, state["screen"], state["card"], state["article_page"]))
                if EVENT_LED_ACK:
                    epd.led.value(0)
            time.sleep_ms(BUTTON_POLL_MS)
    except Exception as e:
        log("FATAL {}".format(repr(e)))
        try:
            with open(LOG_PATH, "a") as f:
                sys.print_exception(e, f)
        except Exception:
            pass


main()
