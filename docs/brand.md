# TRACE brand guide

## Logo

<img src="../assets/logo-mark.svg" width="56" height="56" alt="TRACE logo mark">

The mark is a **trail of five dots** rising from left to right: one per evidence stage, ending in a larger ink dot for the decision. Every decision rests on a path of evidence.

- `assets/logo-mark.svg` is for light backgrounds. `assets/favicon.svg` is for dark backgrounds and the browser tab.
- The wordmark is **trace** in lowercase, Schibsted Grotesk ExtraBold (800), letter-spacing −0.045em. Place it to the right of the mark, with a gap of one-third of the mark's width.
- Don't recolour, rotate or stretch the mark, and don't put the light mark on a dark background.

## Colour palette

All colours are defined in `css/tokens.css`.

### Core

| Name | Hex | Use |
| --- | --- | --- |
| Trace Ink | `#15161c` | Text, primary buttons, the "decision" stage |
| Trace Paper | `#f7f6f2` | The app window |
| White | `#ffffff` | Cards |
| Trace Green | `#1f5a45` | Links, focus rings, active navigation |
| Green tint | `#e3eee8` | Concept tags, focus glow |

### Evidence spectrum (one colour per stage)

| Stage | Fill | Text on tint | Tint |
| --- | --- | --- | --- |
| 1 Observation | `#7c6cf0` violet | `#5546c2` | `#efedfd` |
| 2 Finding | `#2f7fd8` blue | `#1f5f9e` | `#e6f0fb` |
| 3 Insight | `#17a173` green | `#0f7353` | `#e2f4ec` |
| 4 Recommendation | `#ef7d3c` orange | `#9c4612` | `#fdede2` |
| 5 Decision | `#15161c` ink | `#15161c` | `#e9e9ec` |

Use the **fill** colour for shapes, bars and dots, and the **text** colour for small text on the tint. Every text pair passes WCAG AA (4.5:1).

### Neutrals and feedback

| Name | Hex | Use |
| --- | --- | --- |
| Ink 2 | `#4f535c` | Secondary text |
| Ink 3 | `#575b64` | Quiet text (6.8:1 on white, 5.2:1 at worst on the glass) |
| Line | `#e7e5df` | Borders |
| Danger | `#b4362a` | Errors |

## Type

- **Schibsted Grotesk**: the interface, headings and numbers.
- **Newsreader**: research text (objectives, observations, quotes), so evidence reads like a document.
- Scale: 44 / 32 / 22 / 17 / 15 / 13 px.

## Background and glass

- **Liquid.** A WebGL shader (`js/background.js`) draws dark, dense, slowly flowing liquid. It feeds noise back into itself ("domain warping") to make the swirls. The colours are the evidence spectrum (violet, blue, green, orange, pink) glowing out of near-black, with a soft light that drifts underneath. `assets/liquid.webp` is a still frame, used when WebGL isn't available.
- **Glass.** The app window is `rgba(248, 247, 243, 0.9)`, so a faint tint of the liquid shows through. Cards are `rgba(255, 255, 255, 0.92)` with a faint border. There is no live blur, which keeps it fast.
- **Motion rules.** It can be paused, stops for reduced-motion users, and is skipped on phones.

## Voice

Plain, specific and calm. Use real numbers ("12 sessions") instead of slogans. Sentence case everywhere, with no capitals-only labels.
