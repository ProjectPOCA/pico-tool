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
DEFAULT_PANEL_W = 248
DEFAULT_PANEL_H = 128

C_BLACK = 0b00
C_WHITE = 0b01
C_YELLOW = 0b10
C_RED = 0b11


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
        self.panel_rotation = o.get("panel_rotation", "none")
        self.panel_offset_x = int(o.get("panel_offset_x", 0))
        self.panel_offset_y = int(o.get("panel_offset_y", 0))
        self.busy_timeout_ms = int(o.get("busy_timeout_ms", 2000))
        self.drf_timeout_ms = int(o.get("drf_timeout_ms", 60000))
        self.spi_baud = int(o.get("spi_baud", SPI_BAUD))

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
        self.cs.value(0)
        self.dc.value(0)
        self.spi.write(bytes((reg,)))
        self.cs.value(1)
        if data is not None and len(data):
            self.dc.value(1)
            self.cs.value(0)
            self.spi.write(data)
            self.cs.value(1)

    def _write_frame(self, buf):
        self.cs.value(0)
        self.dc.value(0)
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
            time.sleep_ms(10)
        return True

    def _reset(self):
        self.rst.value(1)
        time.sleep_ms(10)
        self.rst.value(0)
        time.sleep_ms(20)
        self.rst.value(1)
        time.sleep_ms(10)
        self._wait_idle(1000)

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
        use_yellow = yellow_panel is not None
        buf_2bpp = bytearray(self.panel_w * self.panel_h * 2 // 8)

        for y in range(self.panel_h):
            row_off = y * self.panel_bw
            for x in range(0, self.panel_w, 4):
                packed = 0
                for dx in range(4):
                    px = x + dx
                    bi = row_off + (px // 8)
                    bit = 0x80 >> (px % 8)
                    if black_panel[bi] & bit:
                        color = C_BLACK
                    elif red_panel[bi] & bit:
                        color = C_RED
                    elif use_yellow and yellow_panel[bi] & bit:
                        color = C_YELLOW
                    else:
                        color = C_WHITE
                    packed |= color << (6 - dx * 2)
                buf_2bpp[(y * self.panel_w + x) // 4] = packed
        return bytes(buf_2bpp)

    def present(self, black_mask, red_mask, yellow_mask=None):
        frame_2bpp = self._pack_frame(black_mask, red_mask, yellow_mask)
        self._reset()
        self._cmd(0xE0, bytes([0x02]))
        self._cmd(0xE6, bytes([0x19]))
        self._cmd(0xA5)
        self._wait_idle(self.busy_timeout_ms)
        gc.collect()
        self._write_frame(frame_2bpp)
        self._cmd(0x04)
        self._wait_idle(self.busy_timeout_ms)
        self._cmd(0x12, bytes([0x00]))
        self._wait_idle(self.drf_timeout_ms)
        self._cmd(0x02, bytes([0x00]))
        self._wait_idle(self.busy_timeout_ms)
