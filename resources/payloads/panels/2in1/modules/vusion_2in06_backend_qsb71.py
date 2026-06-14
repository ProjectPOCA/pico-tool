import gc
import machine
import time

PIN_CS = 17
PIN_SCK = 18
PIN_MOSI = 19
PIN_DC = 20
PIN_RST = 21
PIN_BUSY = 26
PIN_LED = 25

PIN_BTN_A = 12
PIN_BTN_B = 13
PIN_BTN_C = 14
PIN_BTN_UP = 15
PIN_BTN_DOWN = 11
PIN_BTN_USER = 23

SPI_ID = 0
SPI_BAUD = 2_000_000

DEFAULT_UI_W = 248
DEFAULT_UI_H = 128
DEFAULT_PANEL_W = 128
DEFAULT_PANEL_H = 248

C_BLACK = 0b00
C_WHITE = 0b01
C_YELLOW = 0b10
C_RED = 0b11

# Pervasive fixed-register table adapted from the legacy BWRY 2.66 table,
# with TRES forced to the E2206QSB71 native memory window, 128x248.
FIXED266_NATIVE_128X248 = bytes((
    0x07,
    0x0F, 0x29,
    0x10, 0x54, 0x44,
    0x05, 0x00, 0x3F, 0x0A, 0x25, 0x12, 0x1A,
    0x37,
    0x02, 0x02,
    0x00, 0x80, 0x00, 0xF8,
    0x1C,
    0x22,
    0x78,
    0xD0,
    0x00,
    0x01,
    0x08,
))

FIXED213_NATIVE_128X248 = bytes((
    0x07,
    0x0F, 0x29,
    0x10, 0x54, 0x44,
    0x05, 0x00, 0x3F, 0x0A, 0x25, 0x0D, 0x16,
    0x37,
    0x02, 0x02,
    0x00, 0x80, 0x00, 0xF8,
    0x1C,
    0x22,
    0x78,
    0xD0,
    0x03,
    0x01,
    0x08,
))

TABLES = {
    "fixed266": FIXED266_NATIVE_128X248,
    "fixed213": FIXED213_NATIVE_128X248,
}


class Backend:
    def __init__(self, overrides=None):
        o = overrides or {}
        self.supports_yellow = True
        self.ui_w = int(o.get("ui_w", DEFAULT_UI_W))
        self.ui_h = int(o.get("ui_h", DEFAULT_UI_H))
        self.ui_bw = (self.ui_w + 7) // 8
        self.panel_w = int(o.get("panel_w", DEFAULT_PANEL_W))
        self.panel_h = int(o.get("panel_h", DEFAULT_PANEL_H))
        self.panel_bw = (self.panel_w + 7) // 8
        self.panel_rotation = o.get("panel_rotation", "cw")
        self.panel_offset_x = int(o.get("panel_offset_x", 0))
        self.panel_offset_y = int(o.get("panel_offset_y", 0))
        self.busy_timeout_ms = int(o.get("busy_timeout_ms", 5000))
        self.drf_timeout_ms = int(o.get("drf_timeout_ms", 60000))
        self.spi_baud = int(o.get("spi_baud", SPI_BAUD))
        self.table_name = o.get("register_table", "fixed266")
        self.register_table = TABLES.get(self.table_name, FIXED266_NATIVE_128X248)
        self.code_black = int(o.get("code_black", C_BLACK)) & 0x03
        self.code_white = int(o.get("code_white", C_WHITE)) & 0x03
        self.code_yellow = int(o.get("code_yellow", C_YELLOW)) & 0x03
        self.code_red = int(o.get("code_red", C_RED)) & 0x03
        self.pof_wait_ms = int(o.get("pof_wait_ms", self.busy_timeout_ms))
        self.deep_sleep_after = bool(o.get("deep_sleep_after", False))
        self.debug_log_path = o.get("debug_log_path", None)

        self.cs = machine.Pin(PIN_CS, machine.Pin.OUT, value=1)
        self.dc = machine.Pin(PIN_DC, machine.Pin.OUT, value=1)
        self.rst = machine.Pin(PIN_RST, machine.Pin.OUT, value=1)
        self.busy = machine.Pin(PIN_BUSY, machine.Pin.IN, machine.Pin.PULL_UP)
        self.led = machine.Pin(PIN_LED, machine.Pin.OUT, value=0)
        self.spi = machine.SPI(
            SPI_ID,
            baudrate=self.spi_baud,
            polarity=0,
            phase=0,
            sck=machine.Pin(PIN_SCK),
            mosi=machine.Pin(PIN_MOSI),
        )
        self.btn_a = machine.Pin(PIN_BTN_A, machine.Pin.IN, machine.Pin.PULL_DOWN)
        self.btn_b = machine.Pin(PIN_BTN_B, machine.Pin.IN, machine.Pin.PULL_DOWN)
        self.btn_c = machine.Pin(PIN_BTN_C, machine.Pin.IN, machine.Pin.PULL_DOWN)
        self.btn_up = machine.Pin(PIN_BTN_UP, machine.Pin.IN, machine.Pin.PULL_DOWN)
        self.btn_down = machine.Pin(PIN_BTN_DOWN, machine.Pin.IN, machine.Pin.PULL_DOWN)
        self.btn_user = machine.Pin(PIN_BTN_USER, machine.Pin.IN, machine.Pin.PULL_UP)

    def _log(self, msg):
        if not self.debug_log_path:
            return
        try:
            with open(self.debug_log_path, "a") as f:
                f.write("{} | backend_qsb71 {}\n".format(time.ticks_ms(), msg))
        except Exception:
            pass

    def set_led(self, value):
        self.led.value(1 if value else 0)

    def poll_buttons(self):
        return {
            "A": self.btn_a.value(),
            "B": self.btn_b.value(),
            "C": self.btn_c.value(),
            "UP": self.btn_up.value(),
            "DOWN": self.btn_down.value(),
            "USER": self.btn_user.value(),
        }

    def _cmd(self, reg, data=None):
        self.dc.value(0)
        self.cs.value(0)
        self.spi.write(bytes((reg,)))
        self.cs.value(1)
        if data is not None and len(data):
            self.dc.value(1)
            self.cs.value(0)
            self.spi.write(data)
            self.cs.value(1)

    def _write_frame(self, buf):
        self.dc.value(0)
        self.cs.value(0)
        self.spi.write(bytes((0x10,)))
        self.cs.value(1)
        self.dc.value(1)
        self.cs.value(0)
        self.spi.write(buf)
        self.cs.value(1)

    def _wait_idle(self, timeout_ms):
        t0 = time.ticks_ms()
        while self.busy.value() == 0:
            if time.ticks_diff(time.ticks_ms(), t0) > timeout_ms:
                return False
            time.sleep_ms(20)
        return True

    def _reset(self):
        time.sleep_ms(40)
        self.rst.value(1)
        time.sleep_ms(20)
        self.rst.value(0)
        time.sleep_ms(40)
        self.rst.value(1)
        time.sleep_ms(10)
        self._wait_idle(2000)

    def init(self):
        pass

    def _to_panel_space(self, mask):
        out = bytearray(self.panel_bw * self.panel_h)
        for y in range(self.ui_h):
            src_row = y * self.ui_bw
            for x in range(self.ui_w):
                if mask[src_row + (x // 8)] & (0x80 >> (x % 8)):
                    if self.panel_rotation == "cw":
                        dx = (self.ui_h - 1) - y
                        dy = x
                    elif self.panel_rotation == "ccw":
                        dx = y
                        dy = (self.ui_w - 1) - x
                    elif self.panel_rotation == "180":
                        dx = (self.ui_w - 1) - x
                        dy = (self.ui_h - 1) - y
                    else:
                        dx = x
                        dy = y
                    dx += self.panel_offset_x
                    dy += self.panel_offset_y
                    if 0 <= dx < self.panel_w and 0 <= dy < self.panel_h:
                        out[(dy * self.panel_bw) + (dx // 8)] |= 0x80 >> (dx % 8)
        return bytes(out)

    def _pack_frame(self, black_mask, red_mask, yellow_mask=None):
        black_panel = self._to_panel_space(black_mask)
        red_panel = self._to_panel_space(red_mask)
        yellow_panel = self._to_panel_space(yellow_mask) if yellow_mask is not None else None
        buf = bytearray(self.panel_w * self.panel_h * 2 // 8)

        for y in range(self.panel_h):
            row_off = y * self.panel_bw
            for x in range(0, self.panel_w, 4):
                packed = 0
                for dx in range(4):
                    px = x + dx
                    bi = row_off + (px // 8)
                    bit = 0x80 >> (px % 8)
                    if black_panel[bi] & bit:
                        color = self.code_black
                    elif red_panel[bi] & bit:
                        color = self.code_red
                    elif yellow_panel is not None and yellow_panel[bi] & bit:
                        color = self.code_yellow
                    else:
                        color = self.code_white
                    packed |= color << (6 - dx * 2)
                buf[(y * self.panel_w + x) // 4] = packed
        return bytes(buf)

    def _program_fixed_registers(self):
        reg = self.register_table
        self._cmd(0x01, reg[0:1])
        self._cmd(0x00, reg[1:3])
        self._cmd(0x03, reg[3:6])
        self._cmd(0x06, reg[6:13])
        self._cmd(0x50, reg[13:14])
        self._cmd(0x60, reg[14:16])
        self._cmd(0x61, reg[16:20])
        self._cmd(0xE7, reg[20:21])
        self._cmd(0xE3, reg[21:22])
        self._cmd(0x4D, reg[22:23])
        self._cmd(0xB4, reg[23:24])
        self._cmd(0xB5, reg[24:25])
        self._cmd(0xE9, reg[25:26])
        self._cmd(0x30, reg[26:27])

    def present(self, black_mask, red_mask, yellow_mask=None):
        self._log("present start table={} ui={}x{} panel={}x{} rot={}".format(
            self.table_name, self.ui_w, self.ui_h, self.panel_w, self.panel_h, self.panel_rotation
        ))
        frame = self._pack_frame(black_mask, red_mask, yellow_mask)
        gc.collect()
        self._reset()
        self._program_fixed_registers()
        self._write_frame(frame)
        self._cmd(0x04)
        pon_ok = self._wait_idle(self.busy_timeout_ms)
        self._log("PON ok={} busy={}".format(pon_ok, self.busy.value()))
        self._cmd(0x12, bytes((0x00,)))
        drf_ok = self._wait_idle(self.drf_timeout_ms)
        self._log("DRF ok={} busy={}".format(drf_ok, self.busy.value()))
        self._cmd(0x02, bytes((0x00,)))
        if self.pof_wait_ms > 0:
            pof_ok = self._wait_idle(self.pof_wait_ms)
            self._log("POF ok={} busy={}".format(pof_ok, self.busy.value()))
        if self.deep_sleep_after:
            self._cmd(0x07, bytes((0xA5,)))
        time.sleep_ms(50)
