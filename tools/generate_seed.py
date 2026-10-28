#!/usr/bin/env python3
"""
Generates sql/04_seed_data.sql and js/sample-data.js from ONE dataset, so the
Supabase seed and the offline demo mode always contain identical records.

Usage (from the repository root):  python3 tools/generate_seed.py

Everything here is FICTIONAL demonstration data. The projects, people,
participants and research results are invented.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

def ts(day, hour=10):
    return f"{day}T{hour:02d}:00:00+00:00"

researcher = [
    dict(id=1, full_name="Mira Okafor", email="mira.okafor@example.org", role_title="Lead UX researcher", created_at=ts("2026-05-01")),
    dict(id=2, full_name="Tomás Reyes", email="tomas.reyes@example.org", role_title="Product designer", created_at=ts("2026-05-01")),
    dict(id=3, full_name="Hana Sato", email="hana.sato@example.org", role_title="UX researcher", created_at=ts("2026-05-01")),
    dict(id=4, full_name="Isaac Lindqvist", email="isaac.lindqvist@example.org", role_title="Content designer", created_at=ts("2026-05-01")),
]

research_method = [
    dict(id=1, name="Moderated usability test", description="A facilitator watches a participant attempt set tasks with a prototype or live product.", created_at=ts("2026-05-01")),
    dict(id=2, name="Contextual interview", description="An interview held where the participant normally does the activity.", created_at=ts("2026-05-01")),
    dict(id=3, name="Diary study", description="Participants log their own behaviour over several days or weeks.", created_at=ts("2026-05-01")),
    dict(id=4, name="Unmoderated survey", description="A short questionnaire completed without a facilitator.", created_at=ts("2026-05-01")),
    dict(id=5, name="Card sort", description="Participants group and label content cards to reveal their mental model.", created_at=ts("2026-05-01")),
]

segment = [
    dict(id=1, name="First-time mobile bankers", description="Opening their first account through an app.", created_at=ts("2026-05-01")),
    dict(id=2, name="Switching from another bank", description="Moving an existing account to a new bank.", created_at=ts("2026-05-01")),
    dict(id=3, name="Weekly grocery shoppers", description="Order groceries online most weeks.", created_at=ts("2026-05-01")),
    dict(id=4, name="Occasional online shoppers", description="Order groceries online a few times a year.", created_at=ts("2026-05-01")),
    dict(id=5, name="Students", description="Currently in full-time education.", created_at=ts("2026-05-01")),
    dict(id=6, name="Uses assistive technology", description="Uses a screen reader, magnification or enlarged text.", created_at=ts("2026-05-01")),
]

research_project = [
    dict(id=1, title="Mobile banking onboarding",
         description="Fictional demo project. Fernleaf, an imaginary retail bank, is redesigning account opening in its mobile app.",
         research_objective="Understand where new customers abandon account opening and what would help them finish in one sitting.",
         status="active", start_date="2026-08-03", end_date=None, archived_at=None, created_at=ts("2026-08-01")),
    dict(id=2, title="Grocery checkout friction",
         description="Fictional demo project. Basketful, an imaginary grocery delivery app, sees many full baskets abandoned at checkout.",
         research_objective="Identify the moments of friction between a full basket and a confirmed delivery slot.",
         status="active", start_date="2026-08-24", end_date=None, archived_at=None, created_at=ts("2026-08-20")),
    dict(id=3, title="Library catalogue search",
         description="Fictional demo project. An imaginary city library wants catalogue search to work for people who don't know exact titles.",
         research_objective="Learn how patrons look for books they only half remember, and what search should do with vague queries.",
         status="completed", start_date="2026-06-01", end_date="2026-07-31", archived_at=None, created_at=ts("2026-05-28")),
    dict(id=4, title="Clinic appointment reminders",
         description="Fictional demo project, paused and archived after one scoping session.",
         research_objective="Explore whether text reminders reduce missed appointments for an imaginary community clinic.",
         status="paused", start_date="2026-05-04", end_date=None, archived_at=None, created_at=ts("2026-05-02")),
]
ARCHIVE_PROJECT_4_AT = ts("2026-06-15", 16)

project_researcher = [
    dict(project_id=1, researcher_id=1, project_role="lead"),
    dict(project_id=1, researcher_id=3, project_role="researcher"),
    dict(project_id=1, researcher_id=2, project_role="observer"),
    dict(project_id=2, researcher_id=2, project_role="lead"),
    dict(project_id=2, researcher_id=1, project_role="researcher"),
    dict(project_id=2, researcher_id=3, project_role="researcher"),
    dict(project_id=3, researcher_id=4, project_role="lead"),
    dict(project_id=3, researcher_id=3, project_role="researcher"),
    dict(project_id=4, researcher_id=1, project_role="lead"),
]

project_method = [dict(project_id=p, method_id=m) for p, m in
                  [(1, 1), (1, 2), (2, 1), (2, 2), (2, 3), (3, 2), (3, 5), (4, 2)]]

participant = []
_pdata = [("25-34", None), ("18-24", "Prefers sessions after 4pm."), ("35-44", None), ("45-54", "Uses enlarged system text."),
          ("25-34", None), ("35-44", None), ("55-64", "Uses a screen reader."), ("18-24", None),
          ("65+", None), ("25-34", None), ("45-54", None), ("35-44", "Recruited for the clinic pilot only.")]
for i, (band, notes) in enumerate(_pdata, start=1):
    participant.append(dict(id=i, participant_code=f"P-{i:02d}", age_band=band, notes=notes, created_at=ts("2026-05-10")))

participant_segment = [dict(participant_id=p, segment_id=s) for p, s in [
    (1, 1), (2, 1), (2, 5), (3, 2), (4, 2), (4, 6), (5, 3), (6, 3), (7, 4), (7, 6), (8, 4), (8, 5), (9, 6), (10, 5), (11, 3)]]
# P-12 deliberately has no segment.

research_question = [
    dict(id=1, project_id=1, question_text="Where do new customers stop during account opening, and why?", created_at=ts("2026-08-02")),
    dict(id=2, project_id=1, question_text="What do people expect to have ready before they start?", created_at=ts("2026-08-02")),
    dict(id=3, project_id=1, question_text="How do people feel about verifying their identity with the camera?", created_at=ts("2026-08-02")),
    dict(id=4, project_id=2, question_text="What makes people leave a full basket at checkout?", created_at=ts("2026-08-21")),
    dict(id=5, project_id=2, question_text="How do people choose a delivery slot?", created_at=ts("2026-08-21")),
    dict(id=6, project_id=3, question_text="How do patrons search for a book they only partly remember?", created_at=ts("2026-05-29")),
    dict(id=7, project_id=3, question_text="What do patrons do when search returns nothing?", created_at=ts("2026-05-29")),
    dict(id=8, project_id=4, question_text="Do patients want reminders by text, phone call or app?", created_at=ts("2026-05-03")),
]

# (id, project, method, researcher, title, date, minutes, status, participants, questions)
_sessions = [
    (1, 1, 1, 1, "Onboarding usability test 1", "2026-08-10", 45, "completed", [1], [1, 2]),
    (2, 1, 1, 3, "Onboarding usability test 2", "2026-08-11", 50, "completed", [2], [1, 3]),
    (3, 1, 1, 1, "Onboarding usability test 3", "2026-08-12", 45, "completed", [3], [1, 3]),
    (4, 1, 2, 3, "Bank switcher interview", "2026-08-14", 60, "completed", [4], [2]),
    (5, 2, 1, 2, "Checkout usability test A", "2026-08-31", 40, "completed", [5], [4, 5]),
    (6, 2, 1, 2, "Checkout usability test B", "2026-09-01", 55, "completed", [6, 11], [4]),
    (7, 2, 3, 1, "Weekly shop diary review", "2026-09-08", 30, "completed", [5, 6, 11], [5]),
    (8, 2, 2, 3, "Occasional shopper interview", "2026-09-10", 45, "completed", [7, 8], [4]),
    (9, 3, 2, 4, "Catalogue search interview 1", "2026-06-10", 50, "completed", [9], [6, 7]),
    (10, 3, 2, 4, "Catalogue search interview 2", "2026-06-12", 45, "completed", [10], [6, 7]),
    (11, 3, 5, 3, "Search results card sort", "2026-06-24", 35, "completed", [2, 8, 10], [7]),
    (12, 4, 2, 1, "Reminder preferences scoping", "2026-05-20", 30, "completed", [12], [8]),
    (13, 2, 1, 2, "Checkout follow-up test", "2026-11-04", 45, "planned", [], [4]),
]
research_session, session_participant, session_question = [], [], []
for (sid, pid, mid, rid, title, day, mins, status, parts, qs) in _sessions:
    research_session.append(dict(id=sid, project_id=pid, method_id=mid, researcher_id=rid, title=title,
                                 session_date=day, duration_minutes=mins, status=status, notes=None,
                                 created_at=ts(day if status == "completed" else "2026-10-20", 9)))
    session_participant += [dict(session_id=sid, participant_id=p) for p in parts]
    session_question += [dict(session_id=sid, question_id=q) for q in qs]
research_session[12]["notes"] = "Will test the new fee summary in the basket."

# (id, session, title, description, sentiment)
_obs = [
    (1, 1, "Stopped at the proof-of-address step", "P-01 paused for about a minute at 'Upload proof of address', said they had no utility bill on their phone, and closed the app to look for one.", "negative"),
    (2, 1, "Found the step counter reassuring", "P-01 pointed at the step counter and said it helped to know there were only five steps.", "positive"),
    (3, 2, "Unsure which documents count", "P-02 asked aloud whether a statement from another bank would be accepted. The screen did not say.", "negative"),
    (4, 2, "Hesitated at the camera permission", "P-02 read the camera permission prompt twice and asked why the app needed it before tapping Allow.", "negative"),
    (5, 3, "Left the app to find a document", "P-03 switched to their email to search for a council tax letter, then came back to find the form had reset.", "negative"),
    (6, 3, "Identity check was quick once started", "P-03 finished the selfie check in under a minute and said it was easier than expected.", "positive"),
    (7, 4, "Expected a checklist before starting", "P-04 said their previous bank emailed a list of what to prepare, and they wanted the same here.", "neutral"),
    (8, 4, "Enlarged text cut off button labels", "P-04 uses enlarged system text. The Continue button label was truncated on two screens.", "negative"),
    (9, 5, "Delivery fee appeared only at payment", "P-05 noticed the delivery fee on the payment screen and went back to the basket to remove items.", "negative"),
    (10, 5, "Slot grid was hard to scan", "P-05 scrolled the delivery slot grid twice before finding an evening slot.", "negative"),
    (11, 6, "Minimum spend message came too late", "P-06 saw the minimum spend message only after tapping Checkout.", "negative"),
    (12, 6, "Wanted to share slot options", "P-11 wanted to send two slot options to their partner before committing.", "neutral"),
    (13, 6, "Saved card made payment fast", "Both participants paid within seconds once a saved card was selected.", "positive"),
    (14, 7, "Slots chosen around work shifts", "Diary entries from P-05 and P-11 show slots picked around shift patterns, often the same slot each week.", "neutral"),
    (15, 7, "Rebuilt the same basket every week", "P-06 rebuilt a near-identical basket by hand each week.", "neutral"),
    (16, 8, "Left when the total beat expectations", "P-08 closed the app after seeing the total with fees, saying it was more than the shelf price.", "negative"),
    (17, 8, "Screen reader skipped slot availability", "P-07's screen reader announced slot times but not whether each slot was available.", "negative"),
    (18, 9, "Searched by plot description", "P-09 typed 'book about a lighthouse keeper's daughter' and got no results.", "negative"),
    (19, 9, "Would ask a librarian instead", "After two failed searches P-09 said they would normally ask at the desk.", "neutral"),
    (20, 10, "Remembered the cover, not the title", "P-10 remembered a green cover with a bird on it, but not the title or author.", "neutral"),
    (21, 10, "Misspelled author returned nothing", "P-10 misspelled the author's surname and the catalogue returned no results and no suggestion.", "negative"),
    (22, 11, "Grouped results by subject", "Most participants grouped result cards by what the book is about rather than by format.", "neutral"),
    (23, 11, "Put available titles first", "Participants moved 'Available now' cards to the top of every group.", "neutral"),
    (24, 12, "Reads texts, ignores app alerts", "P-12 said they ignore app notifications but always read text messages.", "neutral"),
]
observation = [dict(id=i, session_id=s, title=t, description=d, sentiment=snt,
                    created_at=ts(next(x for x in _sessions if x[0] == s)[5], 15))
               for (i, s, t, d, snt) in _obs]

finding = [
    dict(id=1, project_id=1, title="Proof of address is the main drop-off point", confidence="high", created_at=ts("2026-08-17"),
         description="Three of four participants stopped at the proof-of-address step because they had no suitable document on their phone."),
    dict(id=2, project_id=1, title="People don't know what to prepare", confidence="medium", created_at=ts("2026-08-17"),
         description="Participants started without knowing which documents would be accepted and expected guidance before step one."),
    dict(id=3, project_id=1, title="The camera request needs a reason", confidence="medium", created_at=ts("2026-08-17"),
         description="The system camera prompt appeared without explanation, causing hesitation, although the check itself went smoothly."),
    dict(id=4, project_id=1, title="Progress is lost when people leave the app", confidence="high", created_at=ts("2026-08-17"),
         description="Leaving the app to find a document reset the form, forcing participants to start again."),
    dict(id=5, project_id=1, title="Enlarged text breaks key buttons", confidence="medium", created_at=ts("2026-08-18"),
         description="With enlarged system text, primary button labels were truncated on two onboarding screens."),
    dict(id=6, project_id=2, title="Costs appear too late", confidence="high", created_at=ts("2026-09-12"),
         description="Delivery fees and the minimum spend surfaced after the basket, prompting edits or abandonment."),
    dict(id=7, project_id=2, title="Slot selection is slow to scan", confidence="medium", created_at=ts("2026-09-12"),
         description="Finding a suitable slot took repeated scrolling, and availability was not announced to screen readers."),
    dict(id=8, project_id=2, title="Shoppers repeat the same order", confidence="medium", created_at=ts("2026-09-12"),
         description="Weekly shoppers recreate similar baskets and pick the same slot each week."),
    dict(id=9, project_id=3, title="Patrons search with memory cues, not metadata", confidence="high", created_at=ts("2026-06-26"),
         description="Patrons describe plots or covers instead of titles and authors, which the catalogue cannot match."),
    dict(id=10, project_id=3, title="Zero results is a dead end", confidence="high", created_at=ts("2026-06-26"),
         description="Searches with no results offered no suggestions, so patrons gave up or planned to ask staff."),
    dict(id=11, project_id=3, title="Availability matters more than format", confidence="medium", created_at=ts("2026-06-26"),
         description="In the card sort, participants prioritised whether a book was available over its format."),
]

insight = [
    dict(id=1, project_id=1, title="New customers start without the documents they need", impact="high", created_at=ts("2026-08-20"),
         description="Account opening assumes people arrive prepared. Most don't, so the first real task is finding paperwork."),
    dict(id=2, project_id=1, title="Leaving the app is part of the journey", impact="high", created_at=ts("2026-08-20"),
         description="Going to find a document is expected behaviour, so progress has to survive people leaving and returning."),
    dict(id=3, project_id=1, title="Trust comes before the camera", impact="medium", created_at=ts("2026-08-20"),
         description="People accept identity checks once they understand why the camera is needed."),
    dict(id=4, project_id=2, title="Shoppers judge the basket by its final price", impact="high", created_at=ts("2026-09-15"),
         description="The number that matters is the total including fees; anything hidden until payment feels like a surprise charge."),
    dict(id=5, project_id=2, title="Delivery slots are a routine, not a fresh choice", impact="medium", created_at=ts("2026-09-15"),
         description="Most weekly shoppers want the same slot as last time, so a full grid is overhead."),
    dict(id=6, project_id=3, title="Search needs to forgive vague and misspelled queries", impact="high", created_at=ts("2026-06-29"),
         description="Exact-match search fails the way people actually remember books."),
    dict(id=7, project_id=3, title="Availability is the first filter patrons apply", impact="medium", created_at=ts("2026-06-29"),
         description="Patrons decide what to borrow based on what they can get today."),
]

recommendation = [
    dict(id=1, project_id=1, title="Show a 'what you'll need' checklist before step one", priority="high", status="accepted", created_at=ts("2026-08-24"),
         description="List accepted documents and examples on a preparation screen before the form begins."),
    dict(id=2, project_id=1, title="Save progress automatically and resume where people left off", priority="high", status="accepted", created_at=ts("2026-08-24"),
         description="Store a draft after each step so returning to the app restores the form."),
    dict(id=3, project_id=1, title="Explain the camera before the system prompt", priority="medium", status="accepted", created_at=ts("2026-08-24"),
         description="Show a short explanation of the identity check before triggering the operating system permission."),
    dict(id=4, project_id=1, title="Accept a wider range of address documents", priority="medium", status="proposed", created_at=ts("2026-08-25"),
         description="Allow statements from other banks and digital letters as proof of address."),
    dict(id=5, project_id=2, title="Show fees and minimum spend in the basket", priority="high", status="accepted", created_at=ts("2026-09-17"),
         description="Display the delivery fee, minimum spend and running total in the basket, not only at payment."),
    dict(id=6, project_id=2, title="Offer 'same slot as last week' first", priority="medium", status="proposed", created_at=ts("2026-09-17"),
         description="Put the shopper's previous slot at the top of slot selection when it is available."),
    dict(id=7, project_id=3, title="Add spelling suggestions and description search", priority="high", status="accepted", created_at=ts("2026-07-02"),
         description="Suggest corrected spellings and match words in summaries and subjects, not only titles and authors."),
    dict(id=8, project_id=3, title="Make 'available now' the default sort", priority="medium", status="rejected", created_at=ts("2026-07-02"),
         description="Sort results so books on the shelf appear first."),
]

design_decision = [
    dict(id=1, project_id=1, title="Add a preparation screen to account opening", status="implemented", decided_on="2026-09-02", created_at=ts("2026-09-02"),
         description="A preparation screen listing accepted documents now opens the flow, so people gather paperwork before starting."),
    dict(id=2, project_id=1, title="Keep onboarding drafts for seven days", status="approved", decided_on="2026-09-04", created_at=ts("2026-09-04"),
         description="Drafts persist for seven days so people can leave to find documents without losing progress."),
    dict(id=3, project_id=1, title="Add a pre-permission screen for camera access", status="implemented", decided_on="2026-09-02", created_at=ts("2026-09-02"),
         description="A screen explaining the identity check appears before the system camera prompt."),
    dict(id=4, project_id=2, title="Move the fee summary into the basket", status="approved", decided_on="2026-09-18", created_at=ts("2026-09-18"),
         description="Fees and minimum spend move into the basket so the final total is visible before checkout."),
    dict(id=5, project_id=2, title="Pilot a 'repeat last slot' shortcut", status="proposed", decided_on=None, created_at=ts("2026-09-22"),
         description="Test a one-tap option to rebook the previous slot with a small group of weekly shoppers."),
    dict(id=6, project_id=3, title="Use fuzzy matching in catalogue search", status="implemented", decided_on="2026-07-28", created_at=ts("2026-07-28"),
         description="Search tolerates misspellings and matches summary text, so vague queries return candidates."),
]

observation_finding = [dict(observation_id=o, finding_id=f) for o, f in [
    (1, 1), (3, 1), (5, 1), (3, 2), (7, 2), (4, 3), (6, 3), (5, 4), (1, 4), (8, 5),
    (9, 6), (11, 6), (16, 6), (10, 7), (14, 7), (17, 7), (15, 8), (14, 8),
    (18, 9), (20, 9), (19, 10), (21, 10), (22, 11), (23, 11)]]
# Observations 2, 12, 13 and 24 are deliberately unlinked; finding 5 has no insight.
finding_insight = [dict(finding_id=f, insight_id=i) for f, i in [
    (1, 1), (2, 1), (4, 2), (1, 2), (3, 3), (6, 4), (7, 5), (8, 5), (9, 6), (10, 6), (11, 7)]]
insight_recommendation = [dict(insight_id=i, recommendation_id=r) for i, r in [
    (1, 1), (2, 2), (3, 3), (1, 4), (4, 5), (5, 6), (6, 7), (7, 8)]]
recommendation_decision = [dict(recommendation_id=r, decision_id=d) for r, d in [
    (1, 1), (2, 2), (3, 3), (5, 4), (6, 5), (7, 6)]]
# Recommendations 4 and 8 have no decision yet.

LINK_CREATED = ts("2026-09-25")
for rows in (project_researcher, project_method, participant_segment, session_participant, session_question,
             observation_finding, finding_insight, insight_recommendation, recommendation_decision):
    for r in rows:
        r.setdefault("created_at", LINK_CREATED)

ENTITY_ORDER = [
    ("researcher", researcher), ("segment", segment), ("research_method", research_method),
    ("research_project", research_project), ("project_researcher", project_researcher),
    ("project_method", project_method), ("participant", participant),
    ("participant_segment", participant_segment), ("research_question", research_question),
    ("research_session", research_session), ("session_participant", session_participant),
    ("session_question", session_question), ("observation", observation), ("finding", finding),
    ("insight", insight), ("recommendation", recommendation), ("design_decision", design_decision),
    ("observation_finding", observation_finding), ("finding_insight", finding_insight),
    ("insight_recommendation", insight_recommendation), ("recommendation_decision", recommendation_decision),
]
IDENTITY_TABLES = ["researcher", "segment", "research_method", "research_project", "participant",
                   "research_question", "research_session", "observation", "finding", "insight",
                   "recommendation", "design_decision"]

for name, rows in ENTITY_ORDER:
    if name in IDENTITY_TABLES:
        for r in rows:
            r.setdefault("updated_at", r["created_at"])


def sql_literal(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def build_sql():
    out = [
        "-- =====================================================================",
        "-- TRACE · 04_seed_data.sql   (GENERATED by tools/generate_seed.py)",
        "-- FICTIONAL DEMONSTRATION DATA. No real people, studies or results.",
        "-- Run after 03_security.sql. Stops without changes if TRACE already",
        "-- contains data, so it cannot duplicate or overwrite your records.",
        "-- =====================================================================",
        "",
        "begin;",
        "",
        "do $$",
        "begin",
        "  if exists (select 1 from public.research_project) or exists (select 1 from public.researcher) then",
        "    raise exception 'TRACE already contains data. The seed was not applied and nothing changed.';",
        "  end if;",
        "end",
        "$$;",
        "",
    ]
    for name, rows in ENTITY_ORDER:
        cols = list(rows[0].keys())
        out.append(f"insert into public.{name} ({', '.join(cols)}) values")
        vals = ["  (" + ", ".join(sql_literal(r[c]) for c in cols) + ")" for r in rows]
        out.append(",\n".join(vals) + ";")
        out.append("")
    out += [
        "-- Archive the clinic pilot after its records exist (archived projects",
        "-- reject new records, which is enforced by a trigger).",
        f"update public.research_project set archived_at = {sql_literal(ARCHIVE_PROJECT_4_AT)}, updated_at = {sql_literal(ARCHIVE_PROJECT_4_AT)} where id = 4;",
        "",
        "-- Move identity sequences past the explicit ids used above.",
    ]
    for t in IDENTITY_TABLES:
        out.append(f"select setval(pg_get_serial_sequence('public.{t}', 'id'), (select max(id) from public.{t}));")
    out += ["", "commit;", ""]
    return "\n".join(out)


def build_js():
    data = {name: rows for name, rows in ENTITY_ORDER}
    archived = json.loads(json.dumps(data))
    for p in archived["research_project"]:
        if p["id"] == 4:
            p["archived_at"] = ARCHIVE_PROJECT_4_AT
            p["updated_at"] = ARCHIVE_PROJECT_4_AT
    body = json.dumps(archived, ensure_ascii=False, indent=1)
    return (
        "// GENERATED by tools/generate_seed.py - edit the generator, not this file.\n"
        "// FICTIONAL sample data, identical to sql/04_seed_data.sql.\n"
        "// Used when TRACE runs without Supabase (sample mode).\n"
        f"const SAMPLE_DATA = {body};\n"
    )


if __name__ == "__main__":
    (ROOT / "sql" / "04_seed_data.sql").write_text(build_sql(), encoding="utf-8")
    (ROOT / "js" / "sample-data.js").write_text(build_js(), encoding="utf-8")
    print("Wrote sql/04_seed_data.sql and js/sample-data.js")
