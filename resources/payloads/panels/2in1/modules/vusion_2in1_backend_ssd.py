import time
import machine

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
SPI_BAUD = 8_000_000
SPI_POLARITY = 0
SPI_PHASE = 0

DEFAULT_UI_W = 248
DEFAULT_UI_H = 128
DEFAULT_PANEL_W = 128
DEFAULT_PANEL_H = 248


class Backend:
    def __init__(self, overrides=None):
        o = overrides or {}
        self.ui_w = int(o.get("ui_w", DEFAULT_UI_W))
        self.ui_h = int(o.get("ui_h", DEFAULT_UI_H))
        self.ui_bw = (self.ui_w + 7) // 8
        self.panel_w = int(o.get("panel_w", DEFAULT_PANEL_W))
        self.panel_h = int(o.get("panel_h", DEFAULT_PANEL_H))
        self.panel_bw = (self.panel_w + 7) // 8
        self.panel_buf_len = self.panel_bw * self.panel_h
        self.panel_rotation = o.get("panel_rotation", "cw")
        self.plane_black_invert = bool(o.get("plane_black_invert", False))
        self.plane_red_invert = bool(o.get("plane_red_invert", False))
        self.busy_active_low = bool(o.get("busy_active_low", False))
        self.busy_timeout_ms = int(o.get("busy_timeout_ms", 30000))
        self.refresh_cmd_guard_ms = int(o.get("refresh_cmd_guard_ms", 12))
        self.refresh_settle_ms = int(o.get("refresh_settle_ms", 200))
        self.cs = machine.Pin(PIN_CS, machine.Pin.OUT, value=1)
        self.dc = machine.Pin(PIN_DC, machine.Pin.OUT, value=1)
        self.rst = machine.Pin(PIN_RST, machine.Pin.OUT, value=1)
        self.busy = machine.Pin(PIN_BUSY, machine.Pin.IN, machine.Pin.PULL_UP)
        self.led = machine.Pin(25, machine.Pin.OUT, value=0)
        self.spi = machine.SPI(
            SPI_ID,
            baudrate=int(o.get("spi_baud", SPI_BAUD)),
            polarity=SPI_POLARITY,
            phase=SPI_PHASE,
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
        if data is not None and len(data):
            self.dc.value(1)
            self.spi.write(data)
        self.cs.value(1)

    def _reset(self):
        self.rst.value(0)
        time.sleep_ms(12)
        self.rst.value(1)
        time.sleep_ms(20)

    def _wait_busy_idle(self):
        busy_level = 0 if self.busy_active_low else 1
        t0 = time.ticks_ms()
        while self.busy.value() == busy_level:
            if time.ticks_diff(time.ticks_ms(), t0) > self.busy_timeout_ms:
                return False
            time.sleep_ms(4)
        return True

    def init(self):
        self._reset()
        self._cmd(0x12)
        time.sleep_ms(10)
        self._wait_busy_idle()

    def _do_refresh(self):
        self._cmd(0x22, bytes((0xF7,)))
        self._cmd(0x20)
        time.sleep_ms(self.refresh_cmd_guard_ms)
        self._wait_busy_idle()
        time.sleep_ms(self.refresh_settle_ms)

    def _to_panel_space(self, mask):
        out = bytearray(self.panel_buf_len)
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
                    if 0 <= dx < self.panel_w and 0 <= dy < self.panel_h:
                        out[(dy * self.panel_bw) + (dx // 8)] |= 0x80 >> (dx % 8)
        return bytes(out)

    def _payload_from_mask(self, mask, invert):
        if invert:
            return bytes((b ^ 0xFF) for b in mask)
        return bytes(mask)

    def present(self, black_mask, red_mask):
        p_black = self._payload_from_mask(self._to_panel_space(black_mask), self.plane_black_invert)
        p_red = self._payload_from_mask(self._to_panel_space(red_mask), self.plane_red_invert)

        self._cmd(0x24, p_black)
        self._cmd(0x26, p_red)
        self._do_refresh()
