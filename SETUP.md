# TRACE setup: Supabase, GitHub and Vercel

Follow these steps in order. It takes about 30 minutes the first time.

**What you are building:** TRACE is a static website. Your data lives in a Supabase database (and your photos in Supabase Storage). GitHub holds the code, and Vercel puts the site online. Everything you add, edit or delete on the site is saved in Supabase, so you can look at it in the Supabase dashboard too.

**You need:** a free account on each of [Supabase](https://supabase.com), [GitHub](https://github.com) and [Vercel](https://vercel.com), plus Git installed on your computer.

> Menu names in these dashboards change from time to time. If a label below doesn't match exactly, look for the closest one.

---

## Step 1. Create the Supabase project

1. Sign in at supabase.com and click **New project**.
2. Pick a name (for example `trace`), choose the region closest to you, and set a **database password**. Save the password in a password manager. You never type it into TRACE.
3. Click **Create new project** and wait until it says it is ready (a minute or two).

## Step 2. Install the database (one paste)

1. In the Supabase dashboard open **SQL Editor** and click **New query**.
2. On your computer, open the file `sql/install_all.sql` from the TRACE folder in any text editor. Select everything and copy it.
3. Paste it into the SQL Editor and click **Run**.
4. You should see a success message. If you see an error instead, open a new query, paste `sql/99_uninstall_trace.sql` (read its first lines: it asks you to uncomment one line to confirm), run it, then run `install_all.sql` again.

**Check it worked:** open **Table Editor**. You should see 24 tables. `research_project` has 1 row (the starter study "Mobile banking onboarding"), `observation` has 8, and `source` has 4.

This one file creates the tables, the rules (for example, a session cannot be deleted while it still has observations), the views, the starter study, and a public Storage bucket called `sources` for photos.

## Step 3. Upload the four starter photos

The starter study has four photos (whiteboard and sketchbook pages). The database knows their file names; you put the files in Storage.

1. In the dashboard open **Storage**. You should see a bucket called **sources**.
2. Open it, click **Upload files**, and choose the four files in the TRACE folder `assets/sources/`:
   `banking-affinity-map.webp`, `banking-decision-sketch.webp`, `banking-interview-notes-p03.webp`, `banking-wireframe-sketch.webp`
3. Keep the file names exactly as they are.

If you skip this step everything still works, but the four starter photos show as broken images. Photos you add later through the site upload themselves.

## Step 4. Connect the app

1. In the dashboard open **Project Settings** and then **API Keys** (older dashboards: **Settings, API**).
2. Copy the **Project URL** (like `https://abcdefghijkl.supabase.co`) and the **Publishable key** (starts with `sb_publishable_`). An older project may show an `anon` key instead; that works too.
3. Open `js/config.js` in the TRACE folder and paste them between the quotes:

```js
const SUPABASE_URL = 'https://abcdefghijkl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_xxxxxxxx';
```

**Never use the `secret` key, the `service_role` key or the database password here.** TRACE refuses to start if it sees a secret key.

## Step 5. Try it on your computer

1. In a terminal, go into the TRACE folder and run `python3 -m http.server 8000`.
2. Open <http://localhost:8000> in your browser.
3. Check: the sidebar card says **Supabase**, Home shows 1 project, **Sources** shows 4 photos, and **Evidence trail** opens a decision with lines between its evidence.
4. Add something (for example, **New → Observation**), then look at **Table Editor → observation** in Supabase. Your new row is there. Reload the page: it is still there.

If you see "TRACE is not connected to Supabase yet", `js/config.js` is empty or wrong. If you see "couldn't load its data", read the message on the page, and press F12 to check the browser console.

## Step 6. Put the code on GitHub

1. On github.com click **New repository**. Name it `trace`, choose **Private**, and **do not** add a README or any other files (it must start empty).
2. In a terminal, inside the TRACE folder:

```bash
git add js/config.js
git commit -m "Connect Supabase"
git remote add origin https://github.com/<your-username>/trace.git
git branch -M main
git push -u origin main
```

Sign in when your browser or the terminal asks. Do not paste a GitHub token into a chat or a file. (The commits so far carry the name set up on the machine that built the project. To put your own name on the next ones, run `git config user.name "Your Name"` and `git config user.email "you@example.com"`.)

Why private? The Supabase URL and publishable key in `config.js` are designed to be public, but with no login they are also what allows editing (see "Safety" below). A private repo keeps them out of search results. Vercel can still deploy a private repo.

## Step 7. Deploy on Vercel

1. On vercel.com click **Add New, Project** and import your `trace` repository (allow Vercel access to it when asked).
2. Set **Framework Preset** to **Other**. Leave **Build Command** and **Output Directory** empty. No environment variables are needed.
3. Click **Deploy**. When it finishes you get an address like `https://trace-xxxx.vercel.app`.
4. Repeat the checks from step 5 on that address. Add a record there, and see it in Supabase.

From now on, every `git push` to `main` redeploys the site automatically. Your data lives in Supabase, so deploying never touches it.

---

## Using it day to day

- **Add things** with the **New** button, or from a page: "Add a finding" on an observation creates the finding already linked to it, so it joins the evidence trail straight away.
- **Edit** with the Edit button on any page.
- **Delete** from inside an edit dialog: open the thing, press Edit, then the red **Delete** button. Photos are removed from Storage too.
- **Some deletes are refused on purpose,** with a message saying why: a session that still has observations, a project that still has sessions or records, a research question, method, researcher or segment that is still used. Delete or move the things that depend on it first. Links between evidence records and notes, pins and photos attached to a record go with it automatically. A faster way to retire a whole project is **Archive**.
- **Everything is in Supabase,** so the **Table Editor** and the **Database** page in TRACE (its query lab runs the real SQL views) always show the same data.

### Start completely empty

The starter study is only there to show how things connect. When you want a clean slate, paste this into the Supabase SQL Editor. It removes every project, session, participant, piece of evidence, source row, note and pin, but keeps your team, methods and segments, and numbering starts again at 1:

```sql
truncate public.research_project, public.participant restart identity cascade;
```

It cannot be undone. Then delete the old photos in **Storage → sources**. (You can also delete things one by one in the app, working from the decision back to the observation.)

## Safety (please read)

**There is no login.** You asked for that because only you use it, and it keeps things simple, but it has a consequence: the publishable key is visible to anyone who opens the site's source, and in this setup that key may read, add, change and delete data. So **anyone who has your site's address can edit or delete your data.**

- Keep the address to yourself, or share it only with people you trust.
- Don't store real names or contact details of participants. TRACE identifies participants by code on purpose.
- If you later want it locked down, the next step is Supabase Auth plus stricter rules in `sql/03_security.sql` (it says where). Vercel also has options to password-protect a deployment; check its current plans for what is included.
- **Back up your work.** In **Table Editor** you can export a table as CSV, and in **Storage** you can download the photos. Check Supabase's current rules for automatic backups on your plan; don't assume the free plan has them.

## Limits

- Supabase's API returns at most **1,000 rows per table per request** by default. TRACE shows a warning if a table ever reaches that, because it would then show only the first 1,000. For one person's research this is a lot, but you can raise it in Supabase's API settings (look for "Max rows").
- Free Supabase projects can be **paused after a period of inactivity**. If the site says it can't load its data after a long break, open the project in the dashboard and restore it. Check Supabase's current policy.
- Photos are resized to at most 1,400 px before upload.

## If something goes wrong

| What you see | What to do |
| --- | --- |
| "TRACE is not connected to Supabase yet" | `js/config.js` is empty. Do step 4, then push again if you are on Vercel. |
| "The TRACE tables were not found" | Step 2 wasn't run (or failed). Run `sql/install_all.sql` again. |
| "Supabase refused to save this" | The SQL didn't finish, or the key in `config.js` belongs to a different project. Re-run step 2 and re-copy the key. |
| Photos show as broken images | The files aren't in the `sources` bucket (step 3), or their names changed. |
| "The photo bucket was not found" | Run `sql/09_storage.sql`. |
| "Couldn't reach Supabase" | Your connection, or the project is paused (see Limits). |
| "This can't be deleted yet: …" | Something still depends on it. Delete or move those first. |
| The Vercel site shows old content | Wait for the deployment to finish, then hard-refresh (Ctrl/Cmd + Shift + R). |
| Anything else | Open the browser console (F12) and read the red error. |

## What was tested, and what wasn't

The database files and the app were tested against a local copy of PostgreSQL behind PostgREST (the engine Supabase uses), with the real Supabase browser library and a stand-in for Storage: 43 SQL checks, a 30-step browser test (including delete, refusals and photo upload), and a check of the fresh install. **They have not been run against a real Supabase project,** so steps 1 to 7 above are the first real test. If one fails, the message on the page and the browser console say why; please send me the text.
