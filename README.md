# Magnific Launcher

A GNOME Shell extension that adds a **macOS-style magnification wave effect** to dock icons when the mouse hovers over them.

The hovered icon grows by a configurable number of pixels and neighbouring icons scale down progressively, creating the familiar ripple effect from the macOS dock — all without touching the dock's CSS or layout.

---

## Features

- Smooth wave magnification on hover
- Pixel-based zoom: the growth is always the same absolute pixel amount regardless of icon size
- Works with **Ubuntu Dock**, **Dash to Dock**, **Dash to Panel**, and the **default GNOME dash**
- Only uses transform scaling — no layout shifts, no CSS overrides
- Icons scale from their visual centre — no positional shift on hover
- Anti-distortion options: configurable scaling filter and offscreen redirect control
- Fully configurable via a preferences UI (no file editing needed)
- Theme-agnostic: compatible with any icon theme or GTK theme
- Tiny footprint with icon caching and change-detection to avoid redundant redraws

---

## Supported GNOME Versions

| GNOME Shell | Supported |
|-------------|-----------|
| 47          | ✓         |
| 48          | ✓         |
| 49          | ✓         |

---

## Installation

### Option A — install script (recommended)

```bash
git clone https://github.com/gilson-fonsaca/magnific_launcher
cd magnific_launcher
./install.sh
```

The script:
1. Copies all files to `~/.local/share/gnome-shell/extensions/magnific-launcher@gilsonf/`
2. Compiles the GSettings schema
3. Enables the extension via `gnome-extensions enable`

### Option B — manual

1. Clone or download this repository.

2. Copy the directory to the extensions folder:

   ```bash
   cp -r magnific_launcher/ \
     ~/.local/share/gnome-shell/extensions/magnific-launcher@gilsonf/
   ```

   The folder name **must** match the `uuid` in `metadata.json`: `magnific-launcher@gilsonf`

3. Compile the GSettings schema:

   ```bash
   glib-compile-schemas \
     ~/.local/share/gnome-shell/extensions/magnific-launcher@gilsonf/schemas/
   ```

4. Reload GNOME Shell (see section below), then enable the extension:

   ```bash
   gnome-extensions enable magnific-launcher@gilsonf
   ```

### Option C — GNOME Extensions website

*(Once published)* Visit the extension page on [extensions.gnome.org](https://extensions.gnome.org) and toggle the switch.

---

## Uninstall

```bash
./uninstall.sh
```

---

## How to Enable / Disable

```bash
# Enable
gnome-extensions enable magnific-launcher@gilsonf

# Disable
gnome-extensions disable magnific-launcher@gilsonf
```

---

## How to Reload GNOME Shell for Testing

### Wayland session (GNOME 40+)

You **cannot** reload the shell in-place on Wayland. The easiest approach is to log out and log back in, or use a nested shell:

```bash
# Launch a nested GNOME Shell for quick iteration (no log-out needed)
dbus-run-session -- gnome-shell --nested --wayland
```

### X11 session

Press **Alt + F2**, type `r`, and press **Enter**.

### Reload only the extension (without restarting the shell)

```bash
gnome-extensions disable magnific-launcher@gilsonf
gnome-extensions enable  magnific-launcher@gilsonf
```

> **Note:** On Wayland, GJS caches ES modules for the lifetime of the session. If
> changes to `extension.js` don't take effect after disable/enable, log out and
> log back in to force a full module reload.

---

## Configuration

Open the preferences window:

```bash
gnome-extensions prefs magnific-launcher@gilsonf
```

Or use the **GNOME Extensions** app and click the settings gear next to *Magnific Launcher*.

### Magnification

| Setting | Default | Range | Description |
|---|---|---|---|
| **Zoom amount** | `8` px | 2 – 64 px | Extra pixels added to the hovered icon's size. Scale is computed as `(iconSize + zoomPixels) / iconSize`, so the visual growth is always the same absolute pixel amount. |
| **Neighbour step** | `0.10` | 0.00 – 0.50 | Scale reduction applied per ring of icons around the hovered icon. `0.00` = all visible icons zoom equally (flat); `0.50` = only the immediate neighbours receive any zoom (narrow wave). |
| **Sharp scaling** | off | on / off | Use nearest-neighbour filter instead of bilinear. Produces crisp pixel edges but may look jagged at non-integer zoom levels. Recommended for flat/solid icon themes. |

**How the wave is calculated** (example: 48 px icons, zoom = 8 px, step = 0.10):

```
hoveredScale  = (48 + 8) / 48 = 1.167
distance 1    = 1.167 − 0.10  = 1.07
distance 2    = 1.167 − 0.20  = 0.97 → clamped to 1.0  (no zoom)
```

### Animation

| Setting | Default | Range | Description |
|---|---|---|---|
| **Animation duration** | `120` ms | 50 – 500 ms | Duration of the zoom-in / zoom-out ease animation. |
| **Restore delay** | `40` ms | 0 – 200 ms | Delay before icons return to normal size after the pointer leaves the dock. Prevents flickering on quick pointer passes. |

---

## Troubleshooting

### The effect does not appear

1. Confirm the extension is enabled:
   ```bash
   gnome-extensions list --enabled | grep magnific
   ```
2. Check the extension state:
   ```bash
   gnome-extensions show magnific-launcher@gilsonf
   ```
3. Check for errors in the GNOME Shell journal:
   ```bash
   journalctl -f -o cat /usr/bin/gnome-shell
   ```
4. If you use **Ubuntu Dock**, **Dash to Dock**, or **Dash to Panel**, make sure that extension is also enabled. A shell reload after enabling both usually resolves ordering issues.

### Icons snap to size instead of animating smoothly

Make sure hardware acceleration is working. On VMs or software renderers, Clutter animations may be choppy. Try lowering the **Animation duration** to `60 ms` in the preferences.

### Icons look blurry when zoomed

- Keep **Zoom amount** between 6–16 px. Larger values amplify the blur inherent to upscaling pre-rendered icon textures.
- Enable **Sharp scaling** in the preferences for pixel-sharp edges (best with flat/solid icon themes).
- Both options are in **Preferences → Magnification**.

### Icons shift position when zoomed

This should not happen with the current version — icons scale from their visual centre (`pivot_point = 0.5, 0.5`). If you observe a shift, it may be caused by padding inside the icon actor. Try a different dock or file a bug report.

### The effect applies to the wrong dock

The extension detects docks in priority order:
**Ubuntu Dock → Dash to Dock → Dash to Panel → Default GNOME dash.**
If you use an uncommon dock, open `extension.js` and add a detection branch in `_findDashContainers()`.

### Extension crashes after a GNOME update

GNOME Shell extension APIs can change between major versions. Check the `shell-version` array in `metadata.json`, add the new version number, and run `./install.sh` again.

---

## Project Structure

```
magnific_launcher/
├── metadata.json        Extension manifest (uuid, shell-version, settings-schema)
├── extension.js         Main extension logic (ES module, GNOME Shell 47+)
├── prefs.js             Preferences UI (libadwaita, GNOME Shell 47+)
├── schemas/
│   └── org.gnome.shell.extensions.magnific-launcher.gschema.xml
├── install.sh           Install & compile schema script
├── uninstall.sh         Uninstall script
└── README.md            This file
```

---

## License

Copyright (C) 2026 Gilson Fonseca

This program is free software: you can redistribute it and/or modify it under
the terms of the **GNU General Public License** as published by the Free Software
Foundation, either **version 3** of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but **WITHOUT ANY
WARRANTY**; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE. See the [LICENSE](LICENSE) file for the full text.
