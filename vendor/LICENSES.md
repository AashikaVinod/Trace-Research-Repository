# Third-party files

TRACE includes these files so the site loads nothing from third-party CDNs.

| File | Source | Version | Licence |
| --- | --- | --- | --- |
| `vendor/supabase-2.117.3.js` | npm `@supabase/supabase-js`, the UMD browser build | 2.117.3 | MIT — `licenses/supabase-js-MIT.txt` |
| `js/icons.js` | npm `lucide`, icon shapes (subset) | 1.56.0 | ISC — `licenses/lucide-ISC.txt` |
| `assets/fonts/bricolage-grotesque-latin-wght.woff2` | npm `@fontsource-variable/bricolage-grotesque` | 5.3.0 | SIL OFL 1.1 — `licenses/bricolage-grotesque-OFL.txt` |
| `assets/fonts/onest-latin-wght.woff2` | npm `@fontsource-variable/onest` | 5.3.1 | SIL OFL 1.1 — `licenses/onest-OFL.txt` |


## Fonts used only to draw the illustrated sources

`tools/generate_sources.py` draws `assets/sources/*.webp` with the handwriting fonts **Caveat** (npm `@fontsource/caveat` 5.3.0) and **Kalam** (npm `@fontsource/kalam` 5.3.0), both SIL OFL 1.1. The fonts aren't shipped with the app; only the images made with them are. The OFL allows this.
