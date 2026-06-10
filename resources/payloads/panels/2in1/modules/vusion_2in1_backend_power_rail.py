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
        self.driver_family = o.get("driver_family", "se")
        self.ui_w = int(o.get("ui_w", DEFAULT_UI_W))
        self.ui_h = int(o.get("ui_h", DEFAULT_UI_H))
        self.ui_bw = (self.ui_w + 7) // 8
        self.panel_w = int(o.get("panel_w", DEFAULT_PANEL_W))
        self.panel_h = int(o.get("panel_h", DEFAULT_PANEL_H))
        self.panel_bw = (self.panel_w + 7) // 8
        self.panel_buf_len = self.panel_bw * self.panel_h
        self.write_mode = o.get("write_mode", "10_13")
        self.plane_black_invert = bool(o.get("plane_black_invert", True))
        self.plane_red_invert = bool(o.get("plane_red_invert", True))
        self.panel_rotation = o.get("panel_rotation", "cw")
        self.panel_offset_x = int(o.get("panel_offset_x", 0))
        self.panel_offset_y = int(o.get("panel_offset_y", 0))
        self.use_busy = bool(o.get("use_busy", False))
        self.busy_active_low = bool(o.get("busy_active_low", True))
        self.busy_timeout_ms = int(o.get("busy_timeout_ms", 26000))
        self.refresh_settle_ms = int(o.get("refresh_settle_ms", 900))
        self.refresh_cmd_guard_ms = int(o.get("refresh_cmd_guard_ms", 12))

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
        time.sleep_ms(10)
        self.rst.value(1)
        time.sleep_ms(12)

    def _wait_busy_idle(self):
        if not self.use_busy:
            time.sleep_ms(1800)
            return True
        target = 0 if self.busy_active_low else 1
        t0 = time.ticks_ms()
        while self.busy.value() == target:
            if time.ticks_diff(time.ticks_ms(), t0) > self.busy_timeout_ms:
                time.sleep_ms(2200)
                return False
            time.sleep_ms(4)
        return True

    def _init_uc(self):
        self._reset()
        self._cmd(0x01, bytes((0x03, 0x00, 0x2B, 0x2B, 0x09)))
        self._cmd(0x06, bytes((0x17, 0x17, 0x17)))
        self._cmd(0x04)
        self._wait_busy_idle()
        self._cmd(0x00, bytes((0x0F,)))
        self._cmd(0x50, bytes((0x37,)))
        self._cmd(0x61, bytes(((self.ui_w >> 8) & 0xFF, self.ui_w & 0xFF, (self.ui_h >> 8) & 0xFF, self.ui_h & 0xFF)))
        self._cmd(0x82, bytes((0x12,)))

    def _init_se(self):
        self._reset()
        self._cmd(0x06, bytes((0x17, 0x17, 0x17)))
        self._cmd(0x04)
        self._wait_busy_idle()
        self._cmd(0x00, bytes((0x0F, 0x0D)))
        self._cmd(0x50, bytes((0x77,)))

    def init(self):
        if self.driver_family == "se":
            self._init_se()
        else:
            self._init_uc()

    def _refresh(self):
        self._cmd(0x12)
        time.sleep_ms(self.refresh_cmd_guard_ms)
        self._wait_busy_idle()
        if self.driver_family != "se":
            self._cmd(0x02)
            self._wait_busy_idle()

    def _payload_from_mask(self, mask, invert):
        if invert:
            return bytes((b ^ 0xFF) for b in mask)
        return bytes(mask)

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
                    dx += self.panel_offset_x
                    dy += self.panel_offset_y
                    if dx < 0 or dx >= self.panel_w or dy < 0 or dy >= self.panel_h:
                        continue
                    out[(dy * self.panel_bw) + (dx // 8)] |= 0x80 >> (dx % 8)
        return bytes(out)

    def present(self, black_mask, red_mask):
        tx_black = self._to_panel_space(black_mask)
        tx_red = self._to_panel_space(red_mask)
        p_black = self._payload_from_mask(tx_black, self.plane_black_invert)
        p_red = self._payload_from_mask(tx_red, self.plane_red_invert)

        if self.driver_family == "se":
            self._cmd(0x10, p_black)
            self._cmd(0x13, p_red)
        else:
            if self.write_mode == "13_10":
                self._cmd(0x13, p_black)
                self._cmd(0x10, p_red)
            else:
                self._cmd(0x10, p_black)
                self._cmd(0x13, p_red)

        self._refresh()
        time.sleep_ms(self.refresh_settle_ms)
