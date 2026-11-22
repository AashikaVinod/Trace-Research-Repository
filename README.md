# TRACE

A UX research repository. Record observations from research sessions, link them into findings, insights, recommendations and design decisions, and follow any decision back to the evidence behind it. Photos, sketches and notes attach to any step.

It runs on **Supabase** (database and photo storage) and is hosted on **Vercel**. There is no login: it is built for one person.

**This folder is everything that goes to GitHub and Vercel.** The database is set up separately in Supabase (see the `supabase-setup` folder). Nothing from that folder belongs in this repository.

## Demo mode

While `config.js` is empty, TRACE runs on a built-in sample study (`js/demo.js`): a made-up research team at a grocery delivery app, with five projects, sessions, participants, evidence from observation to decision, drawn sources with pinned notes, and team notes. Everything works, including the forms and the query lab, but changes live in memory and reset when you reload. Dates are set relative to today, so the study always looks current.

Paste your Supabase values into `config.js` and demo mode switches off by itself.

## Connect it to Supabase

Open `config.js` and paste your project's two values (Supabase, **Project Settings, API Keys**):

```js
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_KEY = 'sb_publishable_...';
```

Both are meant to be public. Never use a secret key or the `service_role` key: the app refuses to start if it finds one.

## Try it on your computer

In this folder run `python -m http.server 8000` (or `py -m http.server 8000` on Windows) and open http://localhost:8000.

## Put it online

1. **GitHub:** in GitHub Desktop choose **File, Add local repository**, pick this folder (create the repository if asked), commit, and **Publish repository**. Keep it **Private**.
2. **Vercel:** at vercel.com choose **Add New, Project**, import the repository, set **Framework Preset** to **Other**, leave everything else empty, and click **Deploy**.

Every change you commit and push updates the live site. Your data stays in Supabase.

## The folder

```
index.html       the one page the app loads
config.js        YOUR Supabase URL and key: the only file you edit
vercel.json      security headers for Vercel
css/style.css    all styles (the colour, spacing and font variables are at the top)
js/
  db.js          all data access: load, save, delete, photo upload
  ui.js          small helpers, dialogs, the form builder, charts
  forms.js       every add and edit form, plus photos, notes and pins
  app.js         the router (which page to show) and the sidebar
  background.js  the moving liquid background
  demo.js        demo mode: the sample study used while config.js is empty
  pages/         one file per page: home, projects, sessions, people,
                 library, trail, sources, database
  icons.js       icon shapes
  supabase.js    the Supabase browser library (third party, leave alone)
assets/          logo, fonts and the background image
LICENSES.md      licences of the third-party files
```

Each big file starts with a list of what is inside it.

## How it works

1. When the page opens, `db.js` reads every table from Supabase into one `data` object.
2. Each page file draws itself from that data; pages never talk to Supabase directly.
3. A form calls a save function in `db.js`. It writes one change to Supabase and reloads the data, so every page shows it straight away.

To add a page: create `js/pages/yourpage.js` with a `pageYourpage()` function, add its `<script>` tag to `index.html` before `app.js`, and add a line to `ROUTES` in `js/app.js`.

## Good to know

- **Anyone with your Vercel address can edit or delete your data.** There is no login. Keep the address private and store no real participant details.
- A free Supabase project can pause after a period of inactivity. If the site stops loading data, restore the project in the Supabase dashboard.
- Supabase returns at most 1,000 rows per table by default. The app warns if a table reaches that.
