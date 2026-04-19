# App icons

`app.config.ts` references:

- `./icon.png`            — 1024×1024 iOS icon
- `./splash.png`          — splash (contain, background `#0B1020`)
- `./adaptive.png`        — Android adaptive foreground

These PNGs are **not checked in** yet — generate them during app
branding work (e.g. via Figma or `expo-app-icon-utils`) and drop them
here. Until then, `expo start` will emit a warning about missing
icons but will still run.
