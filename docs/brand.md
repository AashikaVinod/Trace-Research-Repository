# TRACE brand guide

## Logo

<img src="../assets/logo-mark.svg" width="56" height="56" alt="TRACE logo mark">

The mark is a **trail of five dots** rising from left to right: one per evidence stage, ending in a larger ink dot for the decision. Every decision rests on a path of evidence.

- `assets/logo-mark.svg` is for light backgrounds. `assets/favicon.svg` is for dark backgrounds and the browser tab.
- The wordmark is **trace** in lowercase, Schibsted Grotesk ExtraBold (800), letter-spacing −0.045em. Place it to the right of the mark, with a gap of one-third of the mark's width.
- Don't recolour, rotate or stretch the mark, and don't put the light mark on a dark background.

## Colour palette: "kiln"

Taken from glazed ceramics (oat clay, bark, persimmon and celadon glazes), a palette almost never seen in software. All colours are defined in `css/tokens.css`.

### Core

| Name | Hex | Use |
| --- | --- | --- |
| Bark | `#2a211b` | Text, primary buttons, the highlighted stat card, the "decision" stage |
| Oat | `#efe8db` | The app window |
| Rice paper | `#faf6ee` | Cards (never pure white) |
| Persimmon glaze | `#a8441a` | Links, focus, active navigation, the highlighter stroke on titles |
| Persimmon tint | `#f4dccb` | Highlighter, focus glow |

### Evidence stages

| Stage | Fill | Text on tint | Tint |
| --- | --- | --- | --- |
| 1 Observation | `#8a9a5b` lichen | `#4c5726` | `#e7ead6` |
| 2 Finding | `#6f9f8f` celadon | `#2e5c4f` | `#dae9e2` |
| 3 Insight | `#c99a2e` ochre | `#6f520b` | `#f2e5c3` |
| 4 Recommendation | `#d4602a` persimmon | `#8f360d` | `#f7dccb` |
| 5 Decision | `#2a211b` bark | `#2a211b` | `#e4dccf` |

Every text pair passes WCAG AA (checked with a script). The quiet grey `#685c51` is 5.3:1 on oat.

## Type

| Font | Use | Why |
| --- | --- | --- |
| **Gloock** | Headings, big numbers, the wordmark | A rare, high-contrast display serif with a lot of character |
| **Familjen Grotesk** | Everything you read | A slightly quirky Swedish grotesk, warmer than the usual UI fonts |
| **Martian Mono** | Dates, counts, tags, record IDs (OBS-04, INS-02) | Makes TRACE read like a research archive |
| **Caveat** | Sticky notes and pins on images | Notes are handwritten in real research, so they are here too |

Page titles get a persimmon **highlighter stroke**, like a marked-up printout.

## Background and glass

- **Liquid.** A WebGL shader (`js/background.js`) draws big, slow folds of **celadon glaze** (near-black spruce → deep green → celadon → pale jade → oat). `assets/liquid.webp` is a still frame, used when WebGL isn't available.
- **Glass.** The app window is `rgba(248, 247, 243, 0.9)`, so a faint tint of the liquid shows through. Cards are `rgba(255, 255, 255, 0.92)` with a faint border. There is no live blur, which keeps it fast.
- **Motion rules.** It can be paused, stops for reduced-motion users, and is skipped on phones.

## Components (from the reference designs)

| Component | Where | Reference |
| --- | --- | --- |
| Highlighted stat card (deep green) and stat cards with change badges and sparklines | Dashboard | Donezo, Shopeers, BRI |
| Pill columns: hatched, with the latest month solid | Dashboard, Sessions, People | Donezo "project analytics" |
| Half-circle gauge | Dashboard ("Evidence in use") | Donezo "project progress" |
| "Up next" reminder card with a green action | Dashboard | Donezo "reminders" |
| Rows with avatars and segmented progress bars | Dashboard, Projects table | HorizonHub, Growly |
| Leaderboard with ranks | Dashboard, People | BRI |
| Sentiment faces | Dashboard, project pages | Financial dashboard |
| Dot timeline (research rhythm) | Dashboard, Sessions | Financial dashboard |
| Concentric rings funnel | Evidence trail | Financial dashboard |
| Grid / list toggle, folder tabs, document cards | Research library | Repository and Files references |

| Polaroid sources, handwritten sticky notes, numbered pins on photos | Sources, record and session pages | Files reference, plus real research walls |
| "The story so far": the whole chain as plain lists, with tiny photo prints | Every record page | How researchers write up a study |

All of them are small functions in `js/charts.js` and `js/attachments.js` that return HTML.

## Voice

Plain, specific and calm. Use real numbers ("12 sessions") instead of slogans. Sentence case everywhere, with no capitals-only labels.
