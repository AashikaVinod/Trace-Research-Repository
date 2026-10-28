// One error type for both data sources, with readable messages for
// PostgreSQL / PostgREST error codes and TRACE's named constraints.

export class TraceError extends Error {
  constructor(message, { code = '', constraint = '', field = '', detail = '', kind = 'database', cause } = {}) {
    super(message);
    this.name = 'TraceError';
    this.code = code;
    this.constraint = constraint;
    this.field = field;
    this.detail = detail;
    this.kind = kind; // database | permission | network | config | validation | partial
    if (cause) this.cause = cause;
  }
}

// Unique and check constraints -> { field, message } shown next to the input.
const CONSTRAINTS = {
  participant_code_key: { field: 'participant_code', message: 'Another participant already uses this code.' },
  researcher_email_key: { field: 'email', message: 'Another researcher already uses this email.' },
  segment_name_key: { field: 'name', message: 'A segment with this name already exists.' },
  research_method_name_key: { field: 'name', message: 'A method with this name already exists.' },
  research_project_title_key: { field: 'title', message: 'A project with this title already exists.' },
  research_question_text_key: { field: 'question_text', message: 'This project already has this question.' },
  research_session_title_key: { field: 'title', message: 'This project already has a session with this title.' },
  observation_title_key: { field: 'title', message: 'This session already has an observation with this title.' },
  finding_title_key: { field: 'title', message: 'This project already has a finding with this title.' },
  insight_title_key: { field: 'title', message: 'This project already has an insight with this title.' },
  recommendation_title_key: { field: 'title', message: 'This project already has a recommendation with this title.' },
  design_decision_title_key: { field: 'title', message: 'This project already has a design decision with this title.' },
  research_project_dates_check: { field: 'end_date', message: 'The end date must be on or after the start date.' },
  participant_code_check: { field: 'participant_code', message: 'Use the format P-01 (P, a hyphen, then 2–3 digits).' },
  researcher_email_check: { field: 'email', message: 'Enter a valid email address.' },
  research_session_duration_check: { field: 'duration_minutes', message: 'Duration must be between 1 and 600 minutes.' },
};

function constraintFromMessage(message = '') {
  const m = message.match(/constraint "([^"]+)"/);
  return m ? m[1] : '';
}

/** Converts a supabase-js / fetch / demo error into a TraceError. */
export function normalizeError(error, action = 'complete the request') {
  if (error instanceof TraceError) return error;
  const code = error?.code || '';
  const raw = error?.message || String(error || 'Unknown error');
  const constraint = error?.constraint || constraintFromMessage(raw);
  const known = CONSTRAINTS[constraint];

  if (!code && /failed to fetch|networkerror|load failed|network request failed/i.test(raw)) {
    return new TraceError(`Couldn't reach Supabase to ${action}. Check your connection and try again.`, { kind: 'network', detail: raw, cause: error });
  }
  if (code === '42501' || code === 'PGRST301' || code === 'PGRST302' || /row-level security|permission denied/i.test(raw)) {
    return new TraceError(`You don't have permission to ${action}. Sign in with an editor account.`, { code, kind: 'permission', detail: raw, cause: error });
  }
  if (code === '23505') {
    return new TraceError(known?.message || 'This would create a duplicate record.', { code, constraint, field: known?.field, detail: raw, cause: error });
  }
  if (code === '23503') {
    return new TraceError('This refers to a record that no longer exists, or other records still depend on it. Refresh and try again.', { code, constraint, detail: raw, cause: error });
  }
  if (code === '23514' || code === '23502' || code === '22P02' || code === '22007' || code === '22001') {
    // Trigger messages are already readable sentences; check constraints are mapped.
    const message = known?.message || (/violates (check|not-null) constraint|invalid input/i.test(raw) ? 'A value is not allowed by the database rules.' : raw);
    return new TraceError(message, { code, constraint, field: known?.field, detail: raw, cause: error });
  }
  if (code === 'PGRST205' || code === '42P01') {
    return new TraceError('The TRACE tables were not found. Run the SQL files in sql/ in order (see README).', { code, kind: 'config', detail: raw, cause: error });
  }
  if (code === 'PGRST116') {
    return new TraceError('The record was not found.', { code, detail: raw, cause: error });
  }
  return new TraceError(`Couldn't ${action}: ${raw}`, { code, detail: raw, cause: error });
}
