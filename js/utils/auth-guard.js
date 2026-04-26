import { supabase } from '../config/supabase.js'

/**
 * AUTH GUARD UTILITY
 *
 * How to use on any private page:
 *
 *   import { requireAuth, getCurrentUser } from '/js/utils/auth-guard.js'
 *
 *   const session = await requireAuth()   // Redirects if not logged in
 *   const user    = await getCurrentUser()
 */

/**
 * Redirects to login if no active session exists.
 * @returns {Promise<object>} Supabase session object
 */
export async function requireAuth(redirectTo = '/auth/login.html') {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
        window.location.href = redirectTo
        return null
    }
    return session
}

/**
 * Returns the currently authenticated user object, or null.
 */
export async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser()
    return user ?? null
}

/**
 * Returns the profile row for the currently authenticated user.
 */
export async function getCurrentUserProfile() {
    const user = await getCurrentUser()
    if (!user) return null

    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

    if (error) {
        console.error('[auth-guard] Error fetching profile:', error.message)
        return null
    }

    return data
}

/**
 * Returns true if the current user has the 'admin' role.
 * Expects a `role` column on the `profiles` table with value 'admin'.
 */
export async function isAdmin() {
    const profile = await getCurrentUserProfile()
    return profile?.role === 'admin'
}
