# pico tool viewer — presents a static image once at boot (4.2" B/W/R panel).
# Driver sequence extracted from the proven SE2417-style runtime.
import machine
import time

PIN_CS = 17
PIN_SCK = 18
PIN_MOSI = 19
PIN_DC = 20
PIN_RST = 21
PIN_BUSY = 26

SPI_ID = 0
SPI_BAUD = 8_000_000

W = 400
H = 300
BW = (W + 7) // 8
BUF_LEN = BW * H

BUSY_TIMEOUT_MS = 3000
REFRESH_TIMEOUT_MS = 45000
REFRESH_CMD_GUARD_MS = 12
REFRESH_SETTLE_MS = 220

BLACK_BIN = "{{BLACK_BIN}}"
RED_BIN = "{{RED_BIN}}"


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
            polarity=0,
            phase=0,
            sck=machine.Pin(PIN_SCK),
            mosi=machine.Pin(PIN_MOSI),
        )

    def cmd(self, reg, data=None):
        self.cs.value(0)
        self.dc.value(0)
        self.spi.write(bytes((reg,)))
        if data is not None and len(data):
            self.dc.value(1)
            self.spi.write(data)
        self.cs.value(1)

    def reset(self):
        self.rst.value(0)
        time.sleep_ms(10)
        self.rst.value(1)
        time.sleep_ms(10)

    def wait_busy_high(self, timeout_ms=BUSY_TIMEOUT_MS):
        # SE2417: busy=0, idle=1
        t0 = time.ticks_ms()
        while self.busy.value() == 0:
            if time.ticks_diff(time.ticks_ms(), t0) > timeout_ms:
                return False
            time.sleep_ms(10)
        return True


def _read_mask(path):
    try:
        with open(path, "rb") as f:
            data = f.read()
        if len(data) < BUF_LEN:
            data = data + bytes(BUF_LEN - len(data))
        return data[:BUF_LEN]
    except Exception:
        return bytes(BUF_LEN)


def main():
    epd = EPD()
    epd.reset()
    epd.cmd(0x06, bytes((0x17, 0x17, 0x17)))
    epd.cmd(0x04)
    epd.wait_busy_high()
    epd.cmd(0x00, bytes((0x0F, 0x0D)))
    epd.cmd(0x50, bytes((0x77,)))

    # Masks use bit=1 for ink; this panel wants inverted plane payloads.
    black = bytes(b ^ 0xFF for b in _read_mask(BLACK_BIN))
    red = bytes(b ^ 0xFF for b in _read_mask(RED_BIN))

    epd.led.value(1)
    epd.cmd(0x10, black)
    epd.cmd(0x13, red)
    epd.cmd(0x12)
    time.sleep_ms(REFRESH_CMD_GUARD_MS)
    epd.wait_busy_high(REFRESH_TIMEOUT_MS)
    time.sleep_ms(REFRESH_SETTLE_MS)
    epd.led.value(0)

    while True:
        time.sleep_ms(60000)


main()
