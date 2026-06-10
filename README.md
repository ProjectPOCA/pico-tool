# pico tool

Open source desktop app for flashing **POCA display drivers**, the **POCA OS**, and educational
projects onto **Raspberry Pi Pico** boards driving recycled price tag (e-ink) displays.

Built by the [Peoples Open Codex Alliance](https://github.com/ProjectPOCA). Swiss-minimal UI,
zero terminal required: pick your display, pick a flash mode, plug in a Pico.

## What it does

- **Select a Display Driver** — choose your panel by its printed Panel ID (size, colors, and
  refresh speed shown for each). A built-in **Test Display** calibration pattern verifies driver
  compatibility before you commit.
- **POCA OS** — installs the full badge OS with mini versions of POCA's apps.
- **Badge** — compose a simple image + text badge in the built-in editor and flash it.
- **MicroPython Activity** — load any `.py` script onto the Pico, with a crash-safe bootstrap
  that always falls back to the REPL (a buggy script never bricks the board).
- **Raster Image** — flash a JPEG/PNG, automatically dithered and converted to the display's
  ink colors.
- **My Pico** — save a successful configuration and re-flash new devices in two clicks.

Fresh Pico with no firmware? Hold **BOOTSEL** while plugging it in — pico tool installs
MicroPython (bundled, no download needed) and continues automatically.

No Python, no mpremote, no drivers to install on your computer: the app speaks the MicroPython
raw-REPL protocol directly over USB serial.

## Install

Download the latest release for your OS from
[Releases](https://github.com/ProjectPOCA/pico-tool/releases).

> **macOS**: builds are not yet notarized — right-click the app → **Open** the first time.
> **Windows**: if SmartScreen appears, choose **More info → Run anyway**.
> **Linux**: add yourself to the serial group if needed: `sudo usermod -a -G dialout $USER`.

## Development

```bash
npm install
npm run dev          # run with live reload
npm run dev:mock     # run with a simulated Pico (no hardware needed)
npm test             # unit tests (protocol, flash pipeline, image packing)
npm run typecheck
npm run dist         # package for the current OS
```

### Project layout

| Path | Purpose |
|---|---|
| `src/main/serial/` | Serial device watcher + native MicroPython raw-REPL client |
| `src/main/flash/` | Flash plan builder, 5-step orchestrator, BOOTSEL/UF2 flasher |
| `src/main/payloads/` | Bundled driver manifest loading + viewer template rendering |
| `src/renderer/` | React UI (DM Sans, Framer Motion directional transitions) |
| `src/shared/binpack.ts` | Image → e-paper framebuffer conversion (shared, golden-tested) |
| `resources/payloads/` | Bundled display drivers, fonts, calibration assets, manifest |
| `resources/firmware/` | Bundled MicroPython UF2 for fresh Picos |

### Display driver payloads

Driver payloads are vendored into `resources/payloads/` and described by
`resources/payloads/manifest.json`. Each panel entry maps a Pervasive Displays Panel ID to its
on-device runtime modules, fonts, calibration assets, and runtime configuration. Calibration
`.bin` planes regenerate from the source PNGs with `npm run build-calibration` (the same
conversion pipeline the app uses for Raster Image mode).

## License

Apache License 2.0 — see [LICENSE](LICENSE). Artwork by Aspen Pevan.
DM Sans is licensed under the [SIL Open Font License](src/renderer/src/assets/fonts/OFL.txt).
