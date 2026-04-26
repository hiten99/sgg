import { supabase } from '../config/supabase.js'

/**
 * AUTH MODULE
 *
 * Handles all authentication operations.
 *
 * Usage:
 *   import { auth } from '/js/modules/auth.js'
 *   await auth.login(email, password)
 */
export const auth = {
    /**
     * Create a new account.
     * @param {string} email
     * @param {string} password
     * @param {{ full_name?: string, phone?: string }} metadata
     */
    async signUp(email, password, metadata = {}) {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: { data: metadata }
        })
        if (error) throw error
        return data
    },

    /** Sign in an existing user. */
    async login(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        // Redirect after successful login
        window.location.href = '/profile/index.html'
        return data
    },

    /** Sign out the current user and redirect to home. */
    async logout() {
        const { error } = await supabase.auth.signOut()
        if (error) throw error
        window.location.href = '/'
    },

    /**
     * Send a password reset email.
     * @param {string} email
     */
    async resetPassword(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/auth/update-password.html`
        })
        if (error) throw error
    }
}
