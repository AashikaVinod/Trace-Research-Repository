-- =====================================================================
-- TRACE · 99_uninstall_trace.sql            DESTRUCTIVE — READ FIRST
-- Permanently deletes every TRACE table, its data, and TRACE functions.
-- Only use it to reinstall from scratch. It touches nothing else.
--
-- It refuses to run unless you remove the two dashes in front of the
-- next line, which confirms you mean it:
-- set trace.confirm_uninstall = 'yes';
-- =====================================================================

begin;

do $$
begin
  if coalesce(current_setting('trace.confirm_uninstall', true), '') <> 'yes' then
    raise exception 'Uninstall not confirmed. Nothing was deleted. Read the header of this file.';
  end if;
end
$$;

-- Sources, notes and pins (sql/07) first.
drop view if exists public.v_source_owner;
drop table if exists public.annotation, public.note, public.source;

-- Views and the lineage function next (they depend on the tables).
drop function if exists public.trace_lineage(text, bigint);
drop view if exists public.v_decision_strength, public.v_participants_by_segment, public.v_sessions_by_month,
  public.v_sentiment_by_project, public.v_evidence_gap, public.v_project_summary, public.v_dashboard,
  public.v_evidence_edge, public.v_evidence_record;

-- Children before parents; no CASCADE, so unrelated objects are never removed.
drop table if exists
  public.recommendation_decision, public.insight_recommendation, public.finding_insight,
  public.observation_finding, public.design_decision, public.recommendation, public.insight,
  public.finding, public.observation, public.session_question, public.session_participant,
  public.research_session, public.research_question, public.participant_segment,
  public.participant, public.project_method, public.project_researcher,
  public.research_project, public.research_method, public.segment, public.researcher,
  public.trace_editor;

drop function if exists
  public.trace_is_editor(), public.trace_block_archived_project(),
  public.trace_lock_observation_project(), public.trace_lock_project(),
  public.trace_check_same_project(), public.trace_project_of(text, bigint),
  public.trace_touch_updated_at();

commit;
