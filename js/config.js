// TRACE public configuration.
//
// Leave both values empty to run in demo mode (sample data stored in this
// browser only). To connect to Supabase, paste your project's values from
// Supabase Dashboard -> Project Settings -> API (Data API / API Keys).
//
// Both values are PUBLIC by design: anyone can read them in the browser.
// Your data is protected by Row Level Security (sql/03_security.sql), not
// by hiding these values.
//
// NEVER put a secret key here: no service_role key, no "sb_secret_..." key,
// no database password. TRACE refuses to start if it detects one.

export const SUPABASE_URL = '';

// A publishable key ("sb_publishable_...") or the legacy "anon" public key.
export const SUPABASE_PUBLISHABLE_KEY = '';
