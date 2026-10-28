# Third-party files

TRACE vendors these files so the deployed site loads nothing from third-party CDNs.

| File | Source | Version | Licence |
| --- | --- | --- | --- |
| `vendor/supabase-2.117.3.js` | npm `@supabase/supabase-js`, `dist/umd/supabase.js` | 2.117.3 | MIT — `licenses/supabase-js-MIT.txt` |
| `js/icons-data.js` | npm `lucide`, icon node data (subset of 32 icons) | 1.56.0 | ISC — `licenses/lucide-ISC.txt` |
| `assets/fonts/schibsted-grotesk-latin-wght.woff2` | npm `@fontsource-variable/schibsted-grotesk` | 5.3.0 | SIL OFL 1.1 — `licenses/schibsted-grotesk-OFL.txt` |
| `assets/fonts/newsreader-latin-wght*.woff2` | npm `@fontsource-variable/newsreader` | 5.3.0 | SIL OFL 1.1 — `licenses/newsreader-OFL.txt` |

To upgrade supabase-js: `npm pack @supabase/supabase-js@<version>`, copy `dist/umd/supabase.js`
to `vendor/supabase-<version>.js`, and update the filename in `js/supabase-client.js`.
