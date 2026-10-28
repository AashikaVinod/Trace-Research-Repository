# TRACE UX / HCI audit

The audit checked TRACE against **Nielsen's 10 usability heuristics**, **WCAG 2.2 AA** accessibility criteria, and common interaction design laws. For each heuristic, the table lists what was found and what changed. Problems found and fixed are marked **Fixed**.

## Nielsen's 10 heuristics

| # | Heuristic | In TRACE |
| --- | --- | --- |
| 1 | **Visibility of system status** | The sidebar card always shows the mode (sample or Supabase) and whether you can edit. Buttons say "Saving…" while saving. Toasts confirm every change. There is a loading screen with the logo, and live result counts on every list. |
| 2 | **Match between system and real world** | The research vocabulary (observation, finding, insight…) is numbered 1–5 so the order is clear. A one-time "How TRACE works" card explains the chain. Dates are written out ("4 Nov 2026"). |
| 3 | **User control and freedom** | **Fixed:** archiving now offers **Undo**. Escape closes every dialog, the menu and Ask TRACE. Archived projects can be restored. Sample data can be reset. |
| 4 | **Consistency and standards** | The primary action is always top-right in the page header. One button style per role. Every record type keeps the same colour everywhere: tabs, cards, charts and the trail. |
| 5 | **Error prevention** | **Fixed:** closing a form with unsaved changes now asks "Discard your changes?". Forms check required fields, lengths, formats and date order before saving. Link pickers only offer records from the same project. Archiving asks for confirmation. Buttons are disabled while saving, which prevents double submits. |
| 6 | **Recognition rather than recall** | Breadcrumbs on every page. Forms pre-fill and pre-tick the record you came from. The trail picker groups records by type. Ask TRACE offers suggested questions. |
| 7 | **Flexibility and efficiency** | **Added** keyboard shortcuts (`/`, `N`, `A`, `?`) and a shortcuts list. Filters are kept in the URL, so views can be bookmarked and shared. |
| 8 | **Aesthetic and minimalist design** | Calm pages: one surface layer plus cards, an 8-point spacing scale, and charts only where they answer a question. |
| 9 | **Help users recover from errors** | Database errors are rewritten in plain language and placed next to the field: "A project with this title already exists". If a record saves but its links don't, the app says exactly that. |
| 10 | **Help and documentation** | The welcome card, "How the database does this" panels, the shortcuts list, the README and these docs. |

## Accessibility (WCAG 2.2 AA)

| Criterion | Status |
| --- | --- |
| 1.1.1 Non-text content | Charts have text equivalents (`role="img"` with an `aria-label` listing the values, plus visible legends and numbers). Decorative images use empty `alt`. |
| 1.3.1 Info and relationships | Real headings, lists, tables with `scope`, fieldsets for checkbox groups, labelled form fields. **Fixed:** labels read "Description optional" instead of "Descriptionoptional". |
| 1.4.1 Use of colour | The stages always show a number and a name, not just a colour. Status pills include text. |
| 1.4.3 Contrast (minimum) | **Fixed:** grey text and coloured text were darkened. All 17 text/background pairs in the palette pass 4.5:1. On the moving glass, quiet text measured 5.19:1 at its worst moment (sampled from real screenshots). |
| 1.4.10 Reflow | **Fixed:** no page scrolls sideways from 320 px to 1920 px wide. Wide tables scroll inside their card. Checked automatically on all 11 pages at 9 screen sizes. |
| 2.1.1 Keyboard | Everything works with the keyboard. "Skip to content" is the first Tab stop. |
| 2.2.2 Pause, stop, hide | **Added:** the moving background can be paused (and the choice is remembered). It stops automatically when the system asks for reduced motion. |
| 2.4.3 Focus order | **Fixed:** focus now returns to the button that opened a dialog or panel. Opening the menu moves focus into it. |
| 2.4.7 Focus visible | A clear green focus ring on every control. |
| 2.5.8 Target size | Every target is above the 24 px minimum; most buttons are 32–40 px tall (filter chips are 30 px). |
| 3.3.1 / 3.3.3 Error identification and suggestion | Errors appear next to the field, with a fix suggested ("Use the format P-01"). |
| 4.1.2 Name, role, value | Icon-only buttons have `aria-label`. Tabs use `role="tab"` and `aria-selected`. The current page has `aria-current`. **Fixed:** the closed Ask TRACE panel was still reachable by keyboard and screen readers; it is now truly hidden. |

## Interaction design laws

| Law | Applied |
| --- | --- |
| **Hick's law** (fewer choices, faster decisions) | The "New" menu is split into *Study* and *Evidence*. Filters are only shown where needed. |
| **Fitts's law** (big, close targets) | Primary buttons sit top-right where the eye ends. Project, record and session cards are fully clickable, not just their titles. |
| **Miller's law / chunking** | Evidence is chunked into 5 numbered steps. The home page has 5 rows, not 9 competing blocks. |
| **Gestalt: similarity and proximity** | One colour per stage everywhere. Related controls are grouped in toolbars. |
| **Jakob's law** (work like other apps) | Familiar patterns: a sidebar, `/` to search, Esc to close, toasts with Undo. |
| **Aesthetic-usability effect** | Consistent tokens, a real logo and calm spacing make the tool feel trustworthy. |

## Cognitive load review (latest round)

The aim was fewer things to read and decide on each screen, and more that can be understood at a glance.

| Problem | Change |
| --- | --- |
| The home page had 7 blocks competing for attention | Cut to 4 rows: greeting with latest decision, totals, the **evidence flow**, and three small charts. The featured-project and health cards were removed; their information now lives in the flow. |
| The core idea (how evidence becomes decisions) needed reading | The **evidence flow** shows the 5 steps as connected boxes. Each arrow shows how much of a step is used by the next ("83% used"), so weak links stand out without reading anything. |
| Long forms (the session form has 10 fields) | Forms are split into short **sections** with headings ("The session", "How and who", "Participants and questions"). This is chunking, which follows Miller's law. |
| On record pages it wasn't obvious where the record sat in the chain | A **position strip** at the top shows the five steps, with the current one highlighted and linked neighbours tinted. |
| The project page had 3 charts plus a separate coverage chart | Coverage moved into the question list ("Covered in 3 sessions"), leaving two charts. |
| The sidebar footer was wordy and spilled out of the window on 1280×720 and 1366×768 screens | **Fixed:** the mode card is two short lines, the tools sit in one row, the sidebar scrolls if a screen is very short, and on short screens the help text hides. Checked at 9 screen sizes. |
| Observations on a session page needed counting | A **sentiment bar** shows the negative / neutral / positive mix at a glance. |

**Glass and motion vs. readability:** the window is 90% opaque over the dark liquid, so only a faint tint shows through. Quiet text contrast was measured on real screenshots taken while the liquid moved: the worst moment is 5.10:1, above the 4.5:1 AA minimum. The background stops for reduced-motion users, can be paused, and is skipped on phones, where the app fills the screen anyway.

**Performance:** the liquid is a WebGL shader drawn at 40% resolution and at most 30 frames a second, and it stops completely when paused or when the tab is hidden. In the build environment, which has no graphics card, it ran at about 4 frames per second (60 when paused). Real devices with a GPU should be smooth, but this wasn't measured. Dialogs don't fade in, so they stay visible even if a slow device drops frames.

## What was checked, and how

- All user flows were tested automatically in a real browser (Chromium): 26 steps in sample mode and 27 against a database replica. See `docs/testing-checklist.md`.
- Contrast was checked with a WCAG formula script. Reflow was checked by measuring page width at 390 px and 820 px on every page.
- Not tested: real screen readers (NVDA or VoiceOver) and usability tests with real people. Both are recommended next steps.
