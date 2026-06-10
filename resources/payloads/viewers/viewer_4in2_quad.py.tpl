# pico tool viewer — presents a static image once at boot (4.2" quad-color panel).
# Driver sequence extracted from the proven Q-series runtime: 3-wire OTP read,
# explicit register programming from OTP, PON -> frame -> DRF -> POF.
import machine
import time

PIN_CS = 17
PIN_SCK = 18
PIN_MOSI = 19
PIN_DC = 20
PIN_RST = 21
PIN_BUSY = 26

SPI_ID = 0
SPI_BAUD = 2_000_000

W = 400
H = 300
BUF_2BPP = W * H * 2 // 8

BUSY_TIMEOUT_MS = 2000
REFRESH_TIMEOUT_MS = 60000
REFRESH_CMD_GUARD_MS = 12
REFRESH_SETTLE_MS = 300

QUAD_BIN = "{{QUAD_BIN}}"


class EPD:
    def __init__(self):
        self.cs = machine.Pin(PIN_CS, machine.Pin.OUT, value=1)
        self.dc = machine.Pin(PIN_DC, machine.Pin.OUT, value=1)
        self.rst = machine.Pin(PIN_RST, machine.Pin.OUT, value=1)
        self.busy = machine.Pin(PIN_BUSY, machine.Pin.IN, machine.Pin.PULL_UP)
        self.led = machine.Pin(25, machine.Pin.OUT, value=0)
        self._make_spi()
        self.otp = None

    def _make_spi(self):
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
        self.wait_busy_high(1000)

    def wait_busy_high(self, timeout_ms=BUSY_TIMEOUT_MS):
        # Q-series: busy=0, idle=1
        t0 = time.ticks_ms()
        while self.busy.value() == 0:
            if time.ticks_diff(time.ticks_ms(), t0) > timeout_ms:
                return False
            time.sleep_ms(10)
        return True

    def _begin_3wire(self):
        self.spi.deinit()
        self._3sck = machine.Pin(PIN_SCK, machine.Pin.OUT, value=0)
        self._3data = machine.Pin(PIN_MOSI, machine.Pin.OUT, value=0)

    def _end_3wire(self):
        self._make_spi()

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
                if first == 0xA5:
                    data = bytearray(112)
                    data[0] = first
                    for i in range(1, 112):
                        data[i] = self._spi3_read_one()
                    return bytes(data)
            return None
        finally:
            self._end_3wire()


def _read_frame(path):
    try:
        with open(path, "rb") as f:
            data = f.read()
        if len(data) < BUF_2BPP:
            # pad with white (01 per pixel = 0x55 bytes)
            data = data + bytes((0x55,)) * (BUF_2BPP - len(data))
        return data[:BUF_2BPP]
    except Exception:
        return bytes((0x55,)) * BUF_2BPP


def main():
    epd = EPD()
    epd.reset()
    otp = epd.read_otp()
    if otp is None:
        # Cannot drive the panel without its OTP block; blink and idle.
        while True:
            epd.led.value(1)
            time.sleep_ms(100)
            epd.led.value(0)
            time.sleep_ms(900)

    frame = _read_frame(QUAD_BIN)

    epd.led.value(1)
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
    epd.wait_busy_high()
    epd.cmd(0x10, frame)
    epd.cmd(0x12, bytes((0x00,)))
    time.sleep_ms(REFRESH_CMD_GUARD_MS)
    epd.wait_busy_high(REFRESH_TIMEOUT_MS)
    epd.cmd(0x02, bytes((0x00,)))
    epd.wait_busy_high()
    time.sleep_ms(REFRESH_SETTLE_MS)
    epd.led.value(0)

    while True:
        time.sleep_ms(60000)


main()
