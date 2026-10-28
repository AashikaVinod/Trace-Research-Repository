// Validates the public configuration and creates the Supabase client.
// The supabase-js browser build is vendored (vendor/) and only loaded in
// Supabase mode, so demo mode never downloads it.
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const SUPABASE_SCRIPT = 'vendor/supabase-2.117.3.js';

function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1];
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Returns { mode: 'demo' } when nothing is configured,
 * { mode: 'supabase', url, key } when the configuration is usable, or
 * { mode: 'invalid', problems: [...] } when it is present but unsafe/wrong.
 */
export function checkConfig(url = SUPABASE_URL, key = SUPABASE_PUBLISHABLE_KEY) {
  url = (url || '').trim();
  key = (key || '').trim();
  if (!url && !key) return { mode: 'demo' };

  const problems = [];
  if (!url) problems.push('SUPABASE_URL is empty but a key is set. Add your project URL.');
  if (!key) problems.push('SUPABASE_PUBLISHABLE_KEY is empty but a URL is set. Add your publishable key.');

  if (url) {
    let parsed = null;
    try { parsed = new URL(url); } catch { problems.push(`SUPABASE_URL "${url}" is not a valid URL.`); }
    if (parsed) {
      const local = ['localhost', '127.0.0.1'].includes(parsed.hostname);
      if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) {
        problems.push('SUPABASE_URL must start with https://');
      }
      if (/\/(rest|auth)\/v1/.test(parsed.pathname)) {
        problems.push('Use the base project URL (https://<project>.supabase.co) without /rest/v1.');
      }
    }
  }

  if (key) {
    if (key.startsWith('sb_secret_')) {
      problems.push('This is a SECRET key. Remove it from js/config.js now, rotate it in the Supabase dashboard, and use the publishable key instead.');
    } else if (key.startsWith('sb_publishable_')) {
      // Correct key type.
    } else if (key.split('.').length === 3) {
      const payload = decodeJwtPayload(key);
      if (!payload) problems.push('The key looks like a JWT but cannot be read. Copy it again.');
      else if (payload.role === 'service_role') {
        problems.push('This is the SERVICE ROLE key, which bypasses all security. Remove it from js/config.js now, rotate it, and use the anon/publishable key instead.');
      } else if (payload.role !== 'anon') {
        problems.push(`The key has role "${payload.role}". Use the anon/publishable key.`);
      }
    } else {
      problems.push('The key does not look like a Supabase publishable ("sb_publishable_...") or anon key.');
    }
  }

  return problems.length ? { mode: 'invalid', problems } : { mode: 'supabase', url: url.replace(/\/+$/, ''), key };
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = resolve;
    el.onerror = () => reject(new Error(`Could not load ${src}.`));
    document.head.append(el);
  });
}

let client = null;

export async function createSupabaseClient(config) {
  if (client) return client;
  if (!window.supabase?.createClient) await loadScript(SUPABASE_SCRIPT);
  client = window.supabase.createClient(config.url, config.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}
