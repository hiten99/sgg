import { supabase } from '../config/supabase.js'
import { getCurrentUser } from '../utils/auth-guard.js'

/**
 * PROFILE MODULE
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles all profile CRUD operations.
 *
 * Database table expected:
 *   profiles (
 *     id          uuid  PRIMARY KEY REFERENCES auth.users,
 *     full_name   text,
 *     phone       text,
 *     city        text,
 *     state       text,
 *     bio         text,
 *     avatar_url  text,
 *     role        text  DEFAULT 'member',   -- 'admin' | 'member'
 *     created_at  timestamptz DEFAULT now(),
 *     updated_at  timestamptz
 *   )
 *
 * RLS (Row Level Security) — recommended Supabase policies:
 *   - SELECT : authenticated users can read all profiles
 *   - INSERT : user can only insert their own row  (auth.uid() = id)
 *   - UPDATE : user can only update their own row  (auth.uid() = id)
 *   - DELETE : only admin role (handled via service-role key on server, or
 *              an RLS policy: role = 'admin' via a security definer function)
 */
export const profile = {

    // ── READ ────────────────────────────────────────────────────────────────

    /**
     * Load a profile by user id.
     * @param {string} userId
     * @returns {Promise<object>} profile row
     */
    async getProfile(userId) {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single()
        if (error) throw error
        return data
    },

    /**
     * Load the currently logged-in user's own profile.
     * @returns {Promise<object|null>} profile row or null
     */
    async getOwnProfile() {
        const user = await getCurrentUser()
        if (!user) return null
        return this.getProfile(user.id)
    },

    /**
     * Fetch all member profiles (for Member Directory).
     * Only returns public-safe columns.
     * @returns {Promise<Array>}
     */
    async listMembers() {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, full_name, phone, city, state, avatar_url, role')
            .order('full_name', { ascending: true })
        if (error) throw error
        return data ?? []
    },

    // ── WRITE ───────────────────────────────────────────────────────────────

    /**
     * Create or update the current user's profile.
     * Uses upsert so it works for both first-time creation and edits.
     *
     * @param {object} profileData  — fields to save (must NOT include id)
     * @returns {Promise<object>}   — saved profile row
     */
    async saveOwnProfile(profileData) {
        const user = await getCurrentUser()
        if (!user) throw new Error('Not authenticated')

        // Prevent client from overriding the 'role' field accidentally
        const { role: _omit, ...safeData } = profileData

        const { data, error } = await supabase
            .from('profiles')
            .upsert({
                id: user.id,
                ...safeData,
                updated_at: new Date().toISOString()
            })
            .select()
            .single()

        if (error) throw error
        return data
    },

    // ── ADMIN OPERATIONS ────────────────────────────────────────────────────

    /**
     * [ADMIN] Update any user's profile fields, including role.
     * This will only succeed if the logged-in user has an admin-level RLS
     * policy or if you call this via a Supabase Edge Function with service key.
     *
     * @param {string} userId
     * @param {object} fields   — any fields on the profiles table
     */
    async adminUpdateUser(userId, fields) {
        const { data, error } = await supabase
            .from('profiles')
            .update({ ...fields, updated_at: new Date().toISOString() })
            .eq('id', userId)
            .select()
            .single()
        if (error) throw error
        return data
    },

    /**
     * [ADMIN] Soft-delete a user by clearing their profile and marking inactive.
     * Full hard-delete requires a server-side Edge Function with service_role key.
     *
     * @param {string} userId
     */
    async adminDeleteUser(userId) {
        // Soft-delete: clear PII and mark the account inactive
        const { error } = await supabase
            .from('profiles')
            .update({
                full_name: '[Removed]',
                phone: null,
                bio: null,
                avatar_url: null,
                role: 'deleted',
                updated_at: new Date().toISOString()
            })
            .eq('id', userId)
        if (error) throw error
    }
}
