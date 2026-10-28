-- =====================================================================
-- TRACE · 02_constraints_and_indexes.sql
-- Foreign keys, UNIQUE and CHECK constraints, indexes, and the triggers
-- that keep evidence links consistent. Run after 01_schema.sql.
--
-- Constraint names are stable: the frontend maps them to readable
-- error messages (js/errors.js), so rename them in both places.
--
-- Referential rules
--   * Entity -> parent entity (e.g. session -> project): ON DELETE RESTRICT.
--     TRACE archives projects instead of deleting them.
--   * Junction rows: ON DELETE CASCADE, so a link never outlives either end.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Foreign keys
-- ---------------------------------------------------------------------

alter table public.project_researcher
  add constraint project_researcher_project_fk    foreign key (project_id)    references public.research_project (id) on delete cascade,
  add constraint project_researcher_researcher_fk foreign key (researcher_id) references public.researcher (id)       on delete cascade;

alter table public.project_method
  add constraint project_method_project_fk foreign key (project_id) references public.research_project (id) on delete cascade,
  add constraint project_method_method_fk  foreign key (method_id)  references public.research_method (id)  on delete cascade;

alter table public.participant_segment
  add constraint participant_segment_participant_fk foreign key (participant_id) references public.participant (id) on delete cascade,
  add constraint participant_segment_segment_fk     foreign key (segment_id)     references public.segment (id)     on delete cascade;

alter table public.research_question
  add constraint research_question_project_fk foreign key (project_id) references public.research_project (id) on delete restrict;

alter table public.research_session
  add constraint research_session_project_fk    foreign key (project_id)    references public.research_project (id) on delete restrict,
  add constraint research_session_method_fk     foreign key (method_id)     references public.research_method (id)  on delete restrict,
  add constraint research_session_researcher_fk foreign key (researcher_id) references public.researcher (id)       on delete restrict;

alter table public.session_participant
  add constraint session_participant_session_fk     foreign key (session_id)     references public.research_session (id) on delete cascade,
  add constraint session_participant_participant_fk foreign key (participant_id) references public.participant (id)      on delete cascade;

alter table public.session_question
  add constraint session_question_session_fk  foreign key (session_id)  references public.research_session (id)  on delete cascade,
  add constraint session_question_question_fk foreign key (question_id) references public.research_question (id) on delete cascade;

alter table public.observation
  add constraint observation_session_fk foreign key (session_id) references public.research_session (id) on delete restrict;

alter table public.finding
  add constraint finding_project_fk foreign key (project_id) references public.research_project (id) on delete restrict;

alter table public.insight
  add constraint insight_project_fk foreign key (project_id) references public.research_project (id) on delete restrict;

alter table public.recommendation
  add constraint recommendation_project_fk foreign key (project_id) references public.research_project (id) on delete restrict;

alter table public.design_decision
  add constraint design_decision_project_fk foreign key (project_id) references public.research_project (id) on delete restrict;

alter table public.observation_finding
  add constraint observation_finding_observation_fk foreign key (observation_id) references public.observation (id) on delete cascade,
  add constraint observation_finding_finding_fk     foreign key (finding_id)     references public.finding (id)     on delete cascade;

alter table public.finding_insight
  add constraint finding_insight_finding_fk foreign key (finding_id) references public.finding (id) on delete cascade,
  add constraint finding_insight_insight_fk foreign key (insight_id) references public.insight (id) on delete cascade;

alter table public.insight_recommendation
  add constraint insight_recommendation_insight_fk        foreign key (insight_id)        references public.insight (id)        on delete cascade,
  add constraint insight_recommendation_recommendation_fk foreign key (recommendation_id) references public.recommendation (id) on delete cascade;

alter table public.recommendation_decision
  add constraint recommendation_decision_recommendation_fk foreign key (recommendation_id) references public.recommendation (id)  on delete cascade,
  add constraint recommendation_decision_decision_fk       foreign key (decision_id)       references public.design_decision (id) on delete cascade;

-- ---------------------------------------------------------------------
-- CHECK constraints (controlled vocabularies and sane text lengths)
-- ---------------------------------------------------------------------

alter table public.researcher
  add constraint researcher_full_name_check  check (char_length(btrim(full_name)) between 2 and 120),
  add constraint researcher_email_check      check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  add constraint researcher_role_title_check check (role_title is null or char_length(role_title) <= 80);

alter table public.segment
  add constraint segment_name_check        check (char_length(btrim(name)) between 2 and 80),
  add constraint segment_description_check check (description is null or char_length(description) <= 500);

alter table public.research_method
  add constraint research_method_name_check        check (char_length(btrim(name)) between 2 and 80),
  add constraint research_method_description_check check (description is null or char_length(description) <= 500);

alter table public.research_project
  add constraint research_project_title_check       check (char_length(btrim(title)) between 3 and 160),
  add constraint research_project_description_check check (description is null or char_length(description) <= 2000),
  add constraint research_project_objective_check   check (char_length(btrim(research_objective)) between 10 and 1000),
  add constraint research_project_status_check      check (status in ('planned', 'active', 'paused', 'completed')),
  add constraint research_project_dates_check       check (end_date is null or end_date >= start_date);

alter table public.project_researcher
  add constraint project_researcher_role_check check (project_role in ('lead', 'researcher', 'observer'));

alter table public.participant
  add constraint participant_code_check     check (participant_code ~ '^P-[0-9]{2,3}$'),
  add constraint participant_age_band_check check (age_band is null or age_band in ('18-24', '25-34', '35-44', '45-54', '55-64', '65+')),
  add constraint participant_notes_check    check (notes is null or char_length(notes) <= 500);

alter table public.research_question
  add constraint research_question_text_check check (char_length(btrim(question_text)) between 5 and 300);

alter table public.research_session
  add constraint research_session_title_check    check (char_length(btrim(title)) between 3 and 160),
  add constraint research_session_duration_check check (duration_minutes is null or duration_minutes between 1 and 600),
  add constraint research_session_status_check   check (status in ('planned', 'completed', 'cancelled')),
  add constraint research_session_notes_check    check (notes is null or char_length(notes) <= 2000);

alter table public.observation
  add constraint observation_title_check       check (char_length(btrim(title)) between 3 and 160),
  add constraint observation_description_check check (char_length(btrim(description)) between 3 and 4000),
  add constraint observation_sentiment_check   check (sentiment in ('positive', 'neutral', 'negative'));

alter table public.finding
  add constraint finding_title_check       check (char_length(btrim(title)) between 3 and 160),
  add constraint finding_description_check check (char_length(btrim(description)) between 3 and 4000),
  add constraint finding_confidence_check  check (confidence in ('low', 'medium', 'high'));

alter table public.insight
  add constraint insight_title_check       check (char_length(btrim(title)) between 3 and 160),
  add constraint insight_description_check check (char_length(btrim(description)) between 3 and 4000),
  add constraint insight_impact_check      check (impact in ('low', 'medium', 'high'));

alter table public.recommendation
  add constraint recommendation_title_check       check (char_length(btrim(title)) between 3 and 160),
  add constraint recommendation_description_check check (char_length(btrim(description)) between 3 and 4000),
  add constraint recommendation_priority_check    check (priority in ('low', 'medium', 'high')),
  add constraint recommendation_status_check      check (status in ('proposed', 'accepted', 'rejected'));

alter table public.design_decision
  add constraint design_decision_title_check       check (char_length(btrim(title)) between 3 and 160),
  add constraint design_decision_description_check check (char_length(btrim(description)) between 3 and 4000),
  add constraint design_decision_status_check      check (status in ('proposed', 'approved', 'implemented', 'reversed'));

-- ---------------------------------------------------------------------
-- UNIQUE constraints (case-insensitive where people type the value)
-- These also prevent accidental double submissions of the same record.
-- ---------------------------------------------------------------------

alter table public.participant
  add constraint participant_code_key unique (participant_code);

create unique index researcher_email_key        on public.researcher (lower(email));
create unique index segment_name_key            on public.segment (lower(name));
create unique index research_method_name_key    on public.research_method (lower(name));
create unique index research_project_title_key  on public.research_project (lower(title));
create unique index research_question_text_key  on public.research_question (project_id, lower(question_text));
create unique index research_session_title_key  on public.research_session (project_id, lower(title));
create unique index observation_title_key       on public.observation (session_id, lower(title));
create unique index finding_title_key           on public.finding (project_id, lower(title));
create unique index insight_title_key           on public.insight (project_id, lower(title));
create unique index recommendation_title_key    on public.recommendation (project_id, lower(title));
create unique index design_decision_title_key   on public.design_decision (project_id, lower(title));

-- ---------------------------------------------------------------------
-- Indexes
-- Leading columns of the unique indexes above already cover
-- observation(session_id), finding/insight/recommendation/design_decision
-- (project_id), research_question(project_id), research_session(project_id),
-- and the first column of every composite primary key.
-- ---------------------------------------------------------------------

create index project_researcher_researcher_idx      on public.project_researcher (researcher_id);
create index project_method_method_idx              on public.project_method (method_id);
create index participant_segment_segment_idx        on public.participant_segment (segment_id);
create index research_session_method_idx            on public.research_session (method_id);
create index research_session_researcher_idx        on public.research_session (researcher_id);
create index research_session_date_idx              on public.research_session (session_date desc);
create index session_participant_participant_idx    on public.session_participant (participant_id);
create index session_question_question_idx          on public.session_question (question_id);
create index observation_finding_finding_idx        on public.observation_finding (finding_id);
create index finding_insight_insight_idx            on public.finding_insight (insight_id);
create index insight_recommendation_recommendation_idx on public.insight_recommendation (recommendation_id);
create index recommendation_decision_decision_idx   on public.recommendation_decision (decision_id);
create index research_project_created_idx           on public.research_project (created_at desc);
create index insight_created_idx                    on public.insight (created_at desc);

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------

-- 1. Keep updated_at current on every UPDATE.
create function public.trace_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'researcher', 'segment', 'research_method', 'research_project', 'participant',
    'research_question', 'research_session', 'observation', 'finding', 'insight',
    'recommendation', 'design_decision'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.trace_touch_updated_at()',
      t || '_touch_updated_at', t);
  end loop;
end
$$;

-- 2. Resolve the project a record belongs to (observations go via their session).
create function public.trace_project_of(kind text, record_id bigint)
returns bigint
language sql
stable
set search_path = ''
as $$
  select case kind
    when 'research_session'  then (select s.project_id from public.research_session s where s.id = record_id)
    when 'research_question' then (select q.project_id from public.research_question q where q.id = record_id)
    when 'observation'       then (select s.project_id from public.observation o
                                     join public.research_session s on s.id = o.session_id
                                    where o.id = record_id)
    when 'finding'           then (select f.project_id from public.finding f where f.id = record_id)
    when 'insight'           then (select i.project_id from public.insight i where i.id = record_id)
    when 'recommendation'    then (select r.project_id from public.recommendation r where r.id = record_id)
    when 'design_decision'   then (select d.project_id from public.design_decision d where d.id = record_id)
  end;
$$;

-- 3. Links may only connect records from the same project.
--    Trigger arguments: kind_a, column_a, kind_b, column_b.
create function public.trace_check_same_project()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  id_a bigint := (to_jsonb(new) ->> tg_argv[1])::bigint;
  id_b bigint := (to_jsonb(new) ->> tg_argv[3])::bigint;
  project_a bigint := public.trace_project_of(tg_argv[0], id_a);
  project_b bigint := public.trace_project_of(tg_argv[2], id_b);
begin
  -- A missing record is reported by the foreign key instead.
  if project_a is null or project_b is null then
    return new;
  end if;
  if project_a <> project_b then
    raise exception 'Cannot link % % to % %: they belong to different projects.',
      tg_argv[0], id_a, tg_argv[2], id_b
      using errcode = '23514', constraint = 'trace_same_project';
  end if;
  return new;
end;
$$;

create trigger session_question_same_project before insert or update on public.session_question
  for each row execute function public.trace_check_same_project('research_session', 'session_id', 'research_question', 'question_id');
create trigger observation_finding_same_project before insert or update on public.observation_finding
  for each row execute function public.trace_check_same_project('observation', 'observation_id', 'finding', 'finding_id');
create trigger finding_insight_same_project before insert or update on public.finding_insight
  for each row execute function public.trace_check_same_project('finding', 'finding_id', 'insight', 'insight_id');
create trigger insight_recommendation_same_project before insert or update on public.insight_recommendation
  for each row execute function public.trace_check_same_project('insight', 'insight_id', 'recommendation', 'recommendation_id');
create trigger recommendation_decision_same_project before insert or update on public.recommendation_decision
  for each row execute function public.trace_check_same_project('recommendation', 'recommendation_id', 'design_decision', 'decision_id');

-- 4. A record's project cannot change after creation (it would orphan its links).
create function public.trace_lock_project()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.project_id <> old.project_id then
    raise exception 'The project of a % cannot be changed after it is created.', tg_table_name
      using errcode = '23514', constraint = 'trace_project_locked';
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'research_question', 'research_session', 'finding', 'insight', 'recommendation', 'design_decision'
  ] loop
    execute format(
      'create trigger %I before update of project_id on public.%I for each row execute function public.trace_lock_project()',
      t || '_lock_project', t);
  end loop;
end
$$;

-- Observations may move between sessions only within the same project.
create function public.trace_lock_observation_project()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.trace_project_of('research_session', new.session_id)
     is distinct from public.trace_project_of('research_session', old.session_id) then
    raise exception 'An observation can only move to a session in the same project.'
      using errcode = '23514', constraint = 'trace_project_locked';
  end if;
  return new;
end;
$$;

create trigger observation_lock_project before update of session_id on public.observation
  for each row execute function public.trace_lock_observation_project();

-- 5. Archived projects are read-only for new work.
create function public.trace_block_archived_project()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_project bigint;
begin
  if tg_table_name = 'observation' then
    target_project := public.trace_project_of('research_session', new.session_id);
  else
    target_project := new.project_id;
  end if;

  if exists (select 1 from public.research_project p
              where p.id = target_project and p.archived_at is not null) then
    raise exception 'This project is archived. Restore it before adding new work.'
      using errcode = '23514', constraint = 'trace_project_archived';
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'research_question', 'research_session', 'observation', 'finding', 'insight', 'recommendation', 'design_decision'
  ] loop
    execute format(
      'create trigger %I before insert on public.%I for each row execute function public.trace_block_archived_project()',
      t || '_block_archived', t);
  end loop;
end
$$;

commit;
