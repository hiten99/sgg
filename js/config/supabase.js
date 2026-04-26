import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// ─── Replace with your actual Supabase credentials ─────────────────────────
const SUPABASE_URL = 'https://ylfsanlkywggttpevusz.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_JEyxp6oH_p-qm--gVndoWg_7vv0oqu5'
// ────────────────────────────────────────────────────────────────────────────

// Singleton client — import this wherever you need DB or Auth access
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
