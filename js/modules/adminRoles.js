import { supabase } from '../config/supabase.js'
import { isAdmin } from '../utils/auth-guard.js'

/**
 * ADMIN ROLES MODULE  (/js/modules/adminRoles.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * Single-responsibility module for user role management.
 *
 * Supabase security:
 *   - fetchUsers()       → SELECT on profiles — requires authenticated session
 *   - updateUserRole()   → UPDATE on profiles via RLS policy "Admins can update all profiles"
 *                          which calls is_admin() SECURITY DEFINER fn server-side
 *
 * Both operations are ALSO guarded client-side by isAdmin() as belt-and-suspenders.
 * The real enforcement is always the RLS policy on the DB.
 */
export const adminRoles = {

    // ── fetchUsers() ──────────────────────────────────────────────────────────
    /**
     * Fetch all profiles sorted by role (admins first) then name.
     * Returns full profile rows including role, so the UI can render badges.
     *
     * @returns {Promise<Array<{ id, full_name, city, role, created_at }>>}
     */
    async fetchUsers() {
        if (!(await isAdmin())) throw new Error('Only admins can view user list')

        const { data, error } = await supabase
            .from('profiles')
            .select('id, full_name, city, role, created_at')
            .order('role',      { ascending: true })   // 'admin' before 'member' alphabetically
            .order('full_name', { ascending: true })

        if (error) throw error
        return data ?? []
    },

    // ── updateUserRole(userId, newRole) ───────────────────────────────────────
    /**
     * Change a user's role.
     * Protected by both client-side isAdmin() and Supabase RLS.
     *
     * @param {string} userId   — UUID of the target user
     * @param {'member'|'admin'} newRole
     * @returns {Promise<{ id, role }>}  — the updated row
     */
    async updateUserRole(userId, newRole) {
        if (!(await isAdmin())) throw new Error('Only admins can change roles')

        const VALID_ROLES = ['member', 'admin']
        if (!VALID_ROLES.includes(newRole)) {
            throw new Error(`Invalid role: ${newRole}`)
        }

        const { data, error } = await supabase
            .from('profiles')
            .update({ role: newRole })
            .eq('id', userId)
            .select('id, role')
            .single()

        if (error) throw error
        return data   // { id, role }
    }
}
