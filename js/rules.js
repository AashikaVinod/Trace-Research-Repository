// Validation rules that mirror the CHECK / NOT NULL constraints in
// sql/02_constraints_and_indexes.sql. Forms use them for instant feedback
// and demo mode uses them to behave like the database. In Supabase mode
// PostgreSQL remains the authority: it re-checks everything.

export const VOCAB = {
  project_status: ['planned', 'active', 'paused', 'completed'],
  project_role: ['lead', 'researcher', 'observer'],
  age_band: ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'],
  session_status: ['planned', 'completed', 'cancelled'],
  sentiment: ['positive', 'neutral', 'negative'],
  level: ['low', 'medium', 'high'],
  recommendation_status: ['proposed', 'accepted', 'rejected'],
  decision_status: ['proposed', 'approved', 'implemented', 'reversed'],
};

const title = { required: true, min: 3, max: 160 };
const body = { required: true, min: 3, max: 4000 };

export const RULES = {
  researcher: {
    full_name: { required: true, min: 2, max: 120, constraint: 'researcher_full_name_check' },
    email: { required: true, max: 254, email: true, constraint: 'researcher_email_check' },
    role_title: { max: 80 },
  },
  segment: { name: { required: true, min: 2, max: 80 }, description: { max: 500 } },
  research_method: { name: { required: true, min: 2, max: 80 }, description: { max: 500 } },
  research_project: {
    title,
    description: { max: 2000 },
    research_objective: { required: true, min: 10, max: 1000, constraint: 'research_project_objective_check' },
    status: { required: true, oneOf: VOCAB.project_status },
    start_date: { required: true, date: true },
    end_date: { date: true },
  },
  participant: {
    participant_code: { required: true, pattern: /^P-[0-9]{2,3}$/, patternMessage: 'Use the format P-01 (P, a hyphen, then 2–3 digits).', constraint: 'participant_code_check' },
    age_band: { oneOf: VOCAB.age_band },
    notes: { max: 500 },
  },
  research_question: {
    project_id: { required: true },
    question_text: { required: true, min: 5, max: 300, constraint: 'research_question_text_check' },
  },
  research_session: {
    project_id: { required: true },
    method_id: { required: true },
    researcher_id: { required: true },
    title,
    session_date: { required: true, date: true },
    duration_minutes: { integer: true, minValue: 1, maxValue: 600, constraint: 'research_session_duration_check' },
    status: { required: true, oneOf: VOCAB.session_status },
    notes: { max: 2000 },
  },
  observation: { session_id: { required: true }, title, description: body, sentiment: { required: true, oneOf: VOCAB.sentiment } },
  finding: { project_id: { required: true }, title, description: body, confidence: { required: true, oneOf: VOCAB.level } },
  insight: { project_id: { required: true }, title, description: body, impact: { required: true, oneOf: VOCAB.level } },
  recommendation: {
    project_id: { required: true }, title, description: body,
    priority: { required: true, oneOf: VOCAB.level }, status: { required: true, oneOf: VOCAB.recommendation_status },
  },
  design_decision: {
    project_id: { required: true }, title, description: body,
    status: { required: true, oneOf: VOCAB.decision_status }, decided_on: { date: true },
  },
};

// Cross-field rules (mirrors research_project_dates_check).
const ROW_RULES = {
  research_project: [(r) => (r.end_date && r.start_date && r.end_date < r.start_date
    ? { field: 'end_date', message: 'The end date must be on or after the start date.', constraint: 'research_project_dates_check' }
    : null)],
};

const isBlank = (v) => v == null || (typeof v === 'string' && v.trim() === '');

export function validateValue(rule, value) {
  if (!rule) return null;
  if (isBlank(value)) return rule.required ? 'This field is required.' : null;
  if (typeof value === 'string') {
    const len = value.trim().length;
    if (rule.min && len < rule.min) return `Use at least ${rule.min} characters.`;
    if (rule.max && value.length > rule.max) return `Use at most ${rule.max} characters (currently ${value.length}).`;
    if (rule.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return 'Enter a valid email address.';
    if (rule.pattern && !rule.pattern.test(value)) return rule.patternMessage || 'The format is not valid.';
    if (rule.date && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Enter a valid date.';
  }
  if (rule.oneOf && !rule.oneOf.includes(value)) return 'Choose one of the listed options.';
  if (rule.integer && !Number.isInteger(value)) return 'Enter a whole number.';
  if (rule.minValue != null && value < rule.minValue) return `Enter ${rule.minValue} or more.`;
  if (rule.maxValue != null && value > rule.maxValue) return `Enter ${rule.maxValue} or less.`;
  return null;
}

/** Returns a list of { field, message, constraint } problems for a row. */
export function validateRow(table, row, { partial = false } = {}) {
  const rules = RULES[table] || {};
  const problems = [];
  for (const [field, rule] of Object.entries(rules)) {
    if (partial && !(field in row)) continue;
    const message = validateValue(rule, row[field]);
    if (message) problems.push({ field, message, constraint: rule.constraint || `${table}_${field}_check` });
  }
  for (const check of ROW_RULES[table] || []) {
    const p = check(row);
    if (p) problems.push(p);
  }
  return problems;
}
