-- =====================================================================
-- TRACE · 06_views.sql   (run after 04_seed_data.sql)
-- Views and one function that answer the questions the app shows.
-- The "Database" page in TRACE runs these live and explains each one.
--
-- security_invoker = true means a view runs with the permissions of the
-- person asking, so Row Level Security still applies through the view.
-- =====================================================================

begin;

-- 1. Every evidence record in one list (UNION ALL of five tables).
--    Used for search and as the building block for the views below.
create view public.v_evidence_record with (security_invoker = true) as
  select 'observation'::text as record_type, o.id, s.project_id, o.title, o.description, o.created_at
    from public.observation o
    join public.research_session s on s.id = o.session_id      -- project comes through the session (3NF)
  union all
  select 'finding', id, project_id, title, description, created_at from public.finding
  union all
  select 'insight', id, project_id, title, description, created_at from public.insight
  union all
  select 'recommendation', id, project_id, title, description, created_at from public.recommendation
  union all
  select 'design_decision', id, project_id, title, description, created_at from public.design_decision;

-- 2. Every link in the evidence chain as one edge list (UNION ALL of the
--    four junction tables). Turns the chain into a graph we can walk.
create view public.v_evidence_edge with (security_invoker = true) as
  select 'observation'::text as from_type, observation_id as from_id, 'finding'::text as to_type, finding_id as to_id from public.observation_finding
  union all
  select 'finding', finding_id, 'insight', insight_id from public.finding_insight
  union all
  select 'insight', insight_id, 'recommendation', recommendation_id from public.insight_recommendation
  union all
  select 'recommendation', recommendation_id, 'design_decision', decision_id from public.recommendation_decision;

-- 3. Dashboard totals (aggregate functions in scalar subqueries).
create view public.v_dashboard with (security_invoker = true) as
  select
    (select count(*) from public.research_project)                          as projects,
    (select count(*) from public.research_project where archived_at is null) as active_projects,
    (select count(*) from public.research_session)                          as sessions,
    (select count(*) from public.participant)                               as participants,
    (select count(*) from public.observation)                               as observations,
    (select count(*) from public.insight)                                   as insights,
    (select count(*) from public.design_decision)                           as decisions;

-- 4. One row per project with its lead and evidence counts
--    (LEFT JOIN keeps projects without a lead; correlated subqueries count).
create view public.v_project_summary with (security_invoker = true) as
  select p.id, p.title, p.status, p.archived_at is not null as archived,
         r.full_name as lead,
         (select count(*) from public.research_session s where s.project_id = p.id) as sessions,
         (select count(*) from public.v_evidence_record e where e.project_id = p.id and e.record_type = 'observation') as observations,
         (select count(*) from public.finding f where f.project_id = p.id) as findings,
         (select count(*) from public.insight i where i.project_id = p.id) as insights,
         (select count(*) from public.recommendation x where x.project_id = p.id) as recommendations,
         (select count(*) from public.design_decision d where d.project_id = p.id) as decisions
    from public.research_project p
    left join public.project_researcher pr on pr.project_id = p.id and pr.project_role = 'lead'
    left join public.researcher r on r.id = pr.researcher_id;

-- 5. Records that nothing builds on yet (anti-join with NOT EXISTS).
create view public.v_evidence_gap with (security_invoker = true) as
  select e.record_type, e.id, e.project_id, e.title
    from public.v_evidence_record e
   where e.record_type <> 'design_decision'
     and not exists (select 1 from public.v_evidence_edge g where g.from_type = e.record_type and g.from_id = e.id);

-- 6. Observation sentiment per project (GROUP BY with FILTER).
create view public.v_sentiment_by_project with (security_invoker = true) as
  select s.project_id,
         count(*) filter (where o.sentiment = 'positive') as positive,
         count(*) filter (where o.sentiment = 'neutral')  as neutral,
         count(*) filter (where o.sentiment = 'negative') as negative
    from public.observation o
    join public.research_session s on s.id = o.session_id
   group by s.project_id;

-- 7. Sessions per month (date_trunc + GROUP BY + ORDER BY).
create view public.v_sessions_by_month with (security_invoker = true) as
  select to_char(date_trunc('month', session_date), 'YYYY-MM') as month, count(*) as sessions
    from public.research_session
   group by 1
   order by 1;

-- 8. Participants per segment (M:N junction + LEFT JOIN + GROUP BY).
create view public.v_participants_by_segment with (security_invoker = true) as
  select g.id, g.name, count(ps.participant_id) as participants
    from public.segment g
    left join public.participant_segment ps on ps.segment_id = g.id
   group by g.id, g.name;

-- 9. How much evidence stands behind each decision (four joins + DISTINCT).
create view public.v_decision_strength with (security_invoker = true) as
  select d.id, d.title, d.status,
         count(distinct obf.observation_id) as observations,
         count(distinct o.session_id)        as sessions
    from public.design_decision d
    left join public.recommendation_decision rd on rd.decision_id = d.id
    left join public.insight_recommendation ir  on ir.recommendation_id = rd.recommendation_id
    left join public.finding_insight fi         on fi.insight_id = ir.insight_id
    left join public.observation_finding obf    on obf.finding_id = fi.finding_id
    left join public.observation o              on o.id = obf.observation_id
   group by d.id, d.title, d.status;

-- 10. The lineage of one record: walk the edge list up and down with a
--     RECURSIVE common table expression. This powers the Evidence trail.
create function public.trace_lineage(p_type text, p_id bigint)
returns table (record_type text, id bigint, title text, direction text, depth int)
language sql
stable
set search_path = ''
as $$
  with recursive
    up as (
      select g.from_type as t, g.from_id as i, 1 as depth
        from public.v_evidence_edge g where g.to_type = p_type and g.to_id = p_id
      union
      select g.from_type, g.from_id, up.depth + 1
        from public.v_evidence_edge g join up on g.to_type = up.t and g.to_id = up.i
    ),
    down as (
      select g.to_type as t, g.to_id as i, 1 as depth
        from public.v_evidence_edge g where g.from_type = p_type and g.from_id = p_id
      union
      select g.to_type, g.to_id, down.depth + 1
        from public.v_evidence_edge g join down on g.from_type = down.t and g.from_id = down.i
    ),
    found as (
      select p_type as t, p_id as i, 'self' as direction, 0 as depth
      union all select t, i, 'upstream', min(depth) from up group by t, i
      union all select t, i, 'downstream', min(depth) from down group by t, i
    )
  select f.t, f.i, e.title, f.direction, f.depth
    from found f
    join public.v_evidence_record e on e.record_type = f.t and e.id = f.i
   order by f.depth, f.t, f.i;
$$;

-- Visitors and signed-in users may read every view (RLS still applies).
grant select on public.v_evidence_record, public.v_evidence_edge, public.v_dashboard,
  public.v_project_summary, public.v_evidence_gap, public.v_sentiment_by_project,
  public.v_sessions_by_month, public.v_participants_by_segment, public.v_decision_strength
  to anon, authenticated;
revoke all on function public.trace_lineage(text, bigint) from public;
grant execute on function public.trace_lineage(text, bigint) to anon, authenticated;

commit;
