# MemPilot

**Reclaim Chrome memory without the friction of manual tab cleanup.**

MemPilot keeps your browser lean by combining three proven strategies in one extension:

- **Tab hibernation** — Automatically discards tabs you have not used, and lets you put any tab to sleep with one click.
- **Tracker blocking** — Stops common analytics and ad scripts before they load, so pages use less RAM in the first place.
- **WebGL VRAM eviction** — Frees GPU memory when you leave WebGL-heavy tabs (maps, 3D, games) and restores it when you return.

Everything is controlled from a compact, modern popup: see active and sleeping tabs, total memory saved, and tune auto-hibernate and protection settings to match how you browse.

## Load in Chrome

1. Build the extension:

   ```bash
   npm install
   npm run build
   ```

2. Open [chrome://extensions](chrome://extensions), enable **Developer mode**.

3. Click **Load unpacked** and select this project folder:

   ```
   ~/Developer/MemPilot/dist
   ```

   `npm run build` compiles `index.html` and outputs all assets, `popup.js`, CSS, and related files to the `dist` directory so Chrome can load it.

4. After code changes, run `npm run build` again and click **Reload** on the extension card.

## Project structure

```
src/
  entries/              # Vite entry points (background, content, popup)
  features/
    tab-hibernate/      # Idle tab discard, alarms, stats API
    tracker-blocker/    # declarativeNetRequest blocking rules
    webgl-eviction/     # Content-script VRAM reclaim
  popup/
    PopupApp.tsx        # Popup shell and layout
    components/         # TabRow, ThemeToggle, TimeoutDropdown
    hooks/              # usePopupStats
    lib/                # Chrome messaging, dev mocks
    styles/             # Popup + theme CSS
    theme/              # ThemeProvider
  shared/               # Types, constants, icons, format helpers
docs/                   # Research notes
index.html              # Vite popup HTML template
public/manifest.json    # Extension manifest (copied on build)
```

## License

MemPilot is licensed under the [GNU General Public License v3.0 or later](LICENSE) (GPL-3.0-or-later).
