-- =====================================================================
-- TRACE · 05_demo_queries.sql
-- Read-only queries that demonstrate the schema. Safe to run any time;
-- nothing here modifies data. Run them one at a time in the SQL Editor.
-- =====================================================================

-- Q1. Dashboard metrics (the same numbers the app shows).
select
  (select count(*) from public.research_project where archived_at is null) as projects_in_use,
  (select count(*) from public.research_project where archived_at is not null) as projects_archived,
  (select count(*) from public.research_session)  as sessions,
  (select count(*) from public.participant)       as participants,
  (select count(*) from public.insight)           as insights;

-- Q2. Project overview: team lead, number of sessions and evidence per stage.
select p.id,
       p.title,
       p.status,
       r.full_name as lead,
       (select count(*) from public.research_session s where s.project_id = p.id) as sessions,
       (select count(*) from public.observation o
          join public.research_session s on s.id = o.session_id
         where s.project_id = p.id)                                          as observations,
       (select count(*) from public.finding f where f.project_id = p.id)         as findings,
       (select count(*) from public.insight i where i.project_id = p.id)         as insights,
       (select count(*) from public.recommendation x where x.project_id = p.id)  as recommendations,
       (select count(*) from public.design_decision d where d.project_id = p.id) as decisions
  from public.research_project p
  left join public.project_researcher pr on pr.project_id = p.id and pr.project_role = 'lead'
  left join public.researcher r on r.id = pr.researcher_id
 order by p.start_date desc;

-- Q3. Full evidence chain behind every design decision (five-table join
--     through four junction tables).
select d.title  as design_decision,
       rec.title as recommendation,
       i.title   as insight,
       f.title   as finding,
       o.title   as observation,
       s.title   as session
  from public.design_decision d
  join public.recommendation_decision rd on rd.decision_id = d.id
  join public.recommendation rec          on rec.id = rd.recommendation_id
  join public.insight_recommendation ir   on ir.recommendation_id = rec.id
  join public.insight i                   on i.id = ir.insight_id
  join public.finding_insight fi          on fi.insight_id = i.id
  join public.finding f                   on f.id = fi.finding_id
  join public.observation_finding obf     on obf.finding_id = f.id
  join public.observation o               on o.id = obf.observation_id
  join public.research_session s          on s.id = o.session_id
 order by d.id, rec.id, i.id, f.id, o.id;

-- Q4. How much evidence supports each decision (distinct observations and
--     participants behind it).
select d.title,
       d.status,
       count(distinct o.id)              as supporting_observations,
       count(distinct sp.participant_id) as participants_behind_it
  from public.design_decision d
  left join public.recommendation_decision rd on rd.decision_id = d.id
  left join public.insight_recommendation ir  on ir.recommendation_id = rd.recommendation_id
  left join public.finding_insight fi         on fi.insight_id = ir.insight_id
  left join public.observation_finding obf    on obf.finding_id = fi.finding_id
  left join public.observation o              on o.id = obf.observation_id
  left join public.session_participant sp     on sp.session_id = o.session_id
 group by d.id, d.title, d.status
 order by supporting_observations desc, d.title;

-- Q5. Gaps in the chain: records that nothing downstream uses yet.
select 'observation' as record_type, o.id, o.title
  from public.observation o
 where not exists (select 1 from public.observation_finding x where x.observation_id = o.id)
union all
select 'finding', f.id, f.title
  from public.finding f
 where not exists (select 1 from public.finding_insight x where x.finding_id = f.id)
union all
select 'insight', i.id, i.title
  from public.insight i
 where not exists (select 1 from public.insight_recommendation x where x.insight_id = i.id)
union all
select 'recommendation', r.id, r.title
  from public.recommendation r
 where not exists (select 1 from public.recommendation_decision x where x.recommendation_id = r.id)
 order by record_type, id;

-- Q6. Participants per segment (participants can belong to several).
select g.name as segment, count(ps.participant_id) as participants
  from public.segment g
  left join public.participant_segment ps on ps.segment_id = g.id
 group by g.id, g.name
 order by participants desc, g.name;

-- Q7. Sessions per method, with total research time.
select m.name as method,
       count(s.id) as sessions,
       coalesce(sum(s.duration_minutes) filter (where s.status = 'completed'), 0) as completed_minutes
  from public.research_method m
  left join public.research_session s on s.method_id = m.id
 group by m.id, m.name
 order by sessions desc, m.name;

-- Q8. Which research questions each session addressed.
select p.title as project, s.title as session, q.question_text
  from public.session_question sq
  join public.research_session s  on s.id = sq.session_id
  join public.research_question q on q.id = sq.question_id
  join public.research_project p  on p.id = s.project_id
 order by p.title, s.session_date, q.id;

-- Q9. Search: records mentioning a term (the app does this client-side).
select 'observation' as record_type, id, title from public.observation
 where title ilike '%slot%' or description ilike '%slot%'
union all
select 'finding', id, title from public.finding
 where title ilike '%slot%' or description ilike '%slot%'
union all
select 'insight', id, title from public.insight
 where title ilike '%slot%' or description ilike '%slot%'
union all
select 'recommendation', id, title from public.recommendation
 where title ilike '%slot%' or description ilike '%slot%'
union all
select 'design_decision', id, title from public.design_decision
 where title ilike '%slot%' or description ilike '%slot%';

-- Q10. Observation sentiment by project.
select p.title,
       count(*) filter (where o.sentiment = 'negative') as negative,
       count(*) filter (where o.sentiment = 'neutral')  as neutral,
       count(*) filter (where o.sentiment = 'positive') as positive
  from public.observation o
  join public.research_session s on s.id = o.session_id
  join public.research_project p on p.id = s.project_id
 group by p.id, p.title
 order by p.title;
