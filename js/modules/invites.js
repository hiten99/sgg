import { supabase } from '../config/supabase.js'
import { isAdmin, getCurrentUser } from '../utils/auth-guard.js'

/**
 * INVITES MODULE
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles all invite lifecycle operations.
 *
 * Data flow:
 *   Admin fills form → createInvite() → row in 'invites' table (status: pending)
 *   Email sent with link: /auth/signup.html?token=<token>
 *   User opens link → validateInviteToken() → shows pre-filled email
 *   User submits signup → auth.signUp() → acceptInvite(token, userId)
 *   acceptInvite() calls DB function → creates profile with correct role
 *   Invite status set to 'accepted'
 */
export const invites = {

    // ── CREATE ──────────────────────────────────────────────────────────────

    /**
     * Create a new invite record.
     * Only admins can call this (enforced by RLS on the invites table).
     *
     * @param {string} email  — the email to invite
     * @param {'member'|'admin'} role  — role to assign on signup
     * @returns {Promise<{token: string, inviteUrl: string}>}
     */
    async createInvite(email, role = 'member') {
        // Guard: must be admin (belt-and-suspenders on top of RLS)
        if (!(await isAdmin())) throw new Error('Only admins can send invites')

        const currentUser = await getCurrentUser()
        if (!currentUser) throw new Error('Not authenticated')

        // Generate a cryptographically secure token (browser-native)
        const token = generateToken()

        const { error } = await supabase
            .from('invites')
            .insert({
                email:      email.toLowerCase().trim(),
                role,
                token,
                status:     'pending',
                invited_by: currentUser.id
            })

        if (error) {
            // Handle duplicate email gracefully
            if (error.code === '23505') throw new Error(`An active invite already exists for ${email}`)
            throw error
        }

        // Build the signup URL with the token embedded
        const inviteUrl = `${window.location.origin}/auth/signup.html?token=${token}`

        return { token, inviteUrl }
    },

    // ── VALIDATE ────────────────────────────────────────────────────────────

    /**
     * Validate an invite token before showing the signup form.
     * Called on page load of /auth/signup.html when ?token= is present.
     *
     * @param {string} token
     * @returns {Promise<{email: string, role: string}|null>}  null = invalid
     */
    async validateInviteToken(token) {
        if (!token) return null

        const { data, error } = await supabase
            .from('invites')
            .select('email, role, status, expires_at')
            .eq('token', token)
            .eq('status', 'pending')
            .single()

        if (error || !data) return null

        // Check expiry client-side as a UX hint (server also checks in the function)
        if (new Date(data.expires_at) < new Date()) return null

        return { email: data.email, role: data.role }
    },

    // ── ACCEPT ──────────────────────────────────────────────────────────────

    /**
     * Called after Supabase Auth successfully creates the user.
     * Calls the DB's accept_invite() security-definer function which:
     *   1. Validates token is still pending + not expired
     *   2. Verifies email matches the auth user
     *   3. Creates/updates the profile with the invite's role
     *   4. Marks the invite as 'accepted'
     *
     * @param {string} token   — the invite token from the URL
     * @param {string} userId  — the newly created auth user's ID
     * @returns {Promise<{success: boolean, role: string}>}
     */
    async acceptInvite(token, userId) {
        const { data, error } = await supabase.rpc('accept_invite', {
            p_token:   token,
            p_user_id: userId
        })

        if (error) throw new Error(error.message)
        if (!data.success) throw new Error(data.error)

        return data  // { success: true, role: 'member' | 'admin' }
    },

    // ── LIST (admin only) ────────────────────────────────────────────────────

    /**
     * List all invites (admin only — enforced by RLS).
     * @returns {Promise<Array>}
     */
    async listInvites() {
        const { data, error } = await supabase
            .from('invites')
            .select('id, email, role, status, created_at, expires_at')
            .order('created_at', { ascending: false })

        if (error) throw error
        return data ?? []
    },

    // ── REVOKE (admin only) ──────────────────────────────────────────────────

    /**
     * Mark a pending invite as expired/revoked.
     * @param {string} inviteId
     */
    async revokeInvite(inviteId) {
        if (!(await isAdmin())) throw new Error('Only admins can revoke invites')

        const { error } = await supabase
            .from('invites')
            .update({ status: 'expired' })
            .eq('id', inviteId)
            .eq('status', 'pending')  // only revoke pending ones

        if (error) throw error
    }
}

// ─── Private Helpers ──────────────────────────────────────────────────────────

/**
 * Generate a 48-character URL-safe random token using the Web Crypto API.
 * No external libraries needed — works in all modern browsers.
 */
function generateToken() {
    const bytes = new Uint8Array(36)
    crypto.getRandomValues(bytes)
    // Convert to base64url (URL-safe, no padding)
    return btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '')
}
