# Third-party files

TRACE includes these files so the site loads nothing from third-party CDNs.

| File | Source | Version | Licence |
| --- | --- | --- | --- |
| `js/icons.js` | npm `lucide`, icon shapes (subset) | 1.56.0 | ISC — `licenses/lucide-ISC.txt` |
| `assets/fonts/gloock-latin-400.woff2` | npm `@fontsource/gloock` | 5.3.0 | SIL OFL 1.1 — `licenses/gloock-OFL.txt` |
| `assets/fonts/familjen-grotesk-latin-wght.woff2` | npm `@fontsource-variable/familjen-grotesk` | 5.3.0 | SIL OFL 1.1 — `licenses/familjen-grotesk-OFL.txt` |
| `assets/fonts/martian-mono-latin-wght.woff2` | npm `@fontsource-variable/martian-mono` | 5.3.0 | SIL OFL 1.1 — `licenses/martian-mono-OFL.txt` |
| `assets/fonts/caveat-latin-500.woff2` | npm `@fontsource/caveat` | 5.3.0 | SIL OFL 1.1 — `licenses/caveat-OFL.txt` |


## Fonts used only to draw the illustrated sources

`tools/generate_sources.py` draws `assets/sources/*.webp` with the handwriting fonts **Caveat** (npm `@fontsource/caveat` 5.3.0) and **Kalam** (npm `@fontsource/kalam` 5.3.0), both SIL OFL 1.1. The fonts aren't shipped with the app; only the images made with them are. The OFL allows this.
