// ===================================================================
// TRACE configuration
// -------------------------------------------------------------------
// Leave both values empty to run in SAMPLE MODE: the app opens with a
// ready-made fictional research project, and anything you add is saved
// in this browser only (localStorage).
//
// To use your Supabase database, paste the two values from your
// Supabase dashboard (Project Settings -> API Keys / Data API).
// Both values are PUBLIC by design. Row Level Security protects the
// data (see sql/03_security.sql).
//
// NEVER put a secret key ("sb_secret_..."), the service_role key or the
// database password here. TRACE refuses to start if it sees one.
// ===================================================================

const SUPABASE_URL = '';
const SUPABASE_KEY = ''; // the publishable key ("sb_publishable_...") or legacy anon key

// Ask TRACE (the assistant button in the top bar) always answers from your
// data, with no AI needed. Set this to true ONLY after deploying to Vercel
// with an ANTHROPIC_API_KEY environment variable (see README, "AI answers").
const AI_ASSISTANT = false;
