/**
 * AUTH SIGNUP PAGE BINDING  (/js/pages/auth-signup.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles TWO signup modes:
 *
 *  A) INVITE MODE  — URL contains ?token=<invite_token>
 *     1. On load: calls invites.validateInviteToken(token)
 *     2. If valid: pre-fills email, locks the email field, shows invite banner
 *     3. On submit: calls auth.signUp() then invites.acceptInvite(token, userId)
 *        which creates the profile with the correct role via DB function
 *
 *  B) OPEN MODE  — No token in URL
 *     Standard signup. auth.signUp() runs, profile created by DB trigger
 *     with default role = 'member'.
 *
 * IDs this script depends on (must exist in HTML):
 *   #signup-form         — <form>
 *   #signup-fullname     — full name input
 *   #signup-email        — email input
 *   #signup-password     — password input
 *   #signup-token        — hidden input (stores invite token)
 *   #auth-status         — status / error message element
 *   #invite-banner       — banner div (hidden by default)
 *   #invite-banner-text  — span inside banner for role message
 */

import { auth } from '../modules/auth.js'
import { invites } from '../modules/invites.js'
import { supabase } from '../config/supabase.js'

// ─── Redirect guard — fires immediately on page load ─────────────────────────
// If user is already logged in, no reason to be on this page
;(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
        window.location.replace('/profile/index.html')
    }
})()

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const form          = document.getElementById('signup-form')
const nameEl        = document.getElementById('signup-fullname')
const emailEl       = document.getElementById('signup-email')
const passEl        = document.getElementById('signup-password')
const tokenEl       = document.getElementById('signup-token')
const statusEl      = document.getElementById('auth-status')
const inviteBanner  = document.getElementById('invite-banner')
const bannerText    = document.getElementById('invite-banner-text')
const submitBtn     = document.getElementById('signup-submit')

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const token = getTokenFromUrl()

    if (token) {
        await initInviteMode(token)
    } else {
        initOpenMode()
    }

    form?.addEventListener('submit', handleSubmit)
})

// ─── Invite mode setup ────────────────────────────────────────────────────────
async function initInviteMode(token) {
    setStatus('Validating invite link…', 'info')

    const invite = await invites.validateInviteToken(token)

    if (!invite) {
        // Token is invalid / expired / already used
        setStatus('⛔ This invite link is invalid or has expired. Please contact an admin.', 'error')
        if (submitBtn) submitBtn.disabled = true
        return
    }

    // Store token in hidden field for use during submit
    if (tokenEl) tokenEl.value = token

    // Pre-fill and lock email — invite is email-specific
    if (emailEl) {
        emailEl.value    = invite.email
        emailEl.readOnly = true
        emailEl.style.background = '#f0f0ed'
        emailEl.style.cursor     = 'not-allowed'
    }

    // Show invite banner
    if (bannerText) {
        bannerText.textContent = `You're joining as a ${invite.role}. Your email has been pre-filled.`
    }
    if (inviteBanner) inviteBanner.style.display = 'block'

    setStatus('', '')
}

// ─── Open signup mode ─────────────────────────────────────────────────────────
function initOpenMode() {
    // No special setup needed — standard form behaviour
    // Note: without an invite, the DB trigger assigns role = 'member' automatically
}

// ─── Form submit handler ──────────────────────────────────────────────────────
async function handleSubmit(e) {
    e.preventDefault()

    const email    = emailEl?.value.trim()
    const password = passEl?.value
    const fullName = nameEl?.value.trim()
    const token    = tokenEl?.value.trim() || null

    if (!email || !password || !fullName) {
        setStatus('Please fill in all fields.', 'error')
        return
    }

    if (submitBtn) {
        submitBtn.disabled    = true
        submitBtn.textContent = 'Creating account…'
    }

    setStatus('Creating your account…', 'info')

    try {
        // Step 1: Create the Supabase auth user
        const { user } = await auth.signUp(email, password, { full_name: fullName })

        if (!user) {
            // Supabase email confirmation enabled — user not returned until confirmed
            setStatus(
                '✓ Account created! Please check your email to verify your address, then sign in.',
                'success'
            )
            form?.reset()
            return
        }

        // Step 2 (invite mode only): Accept the invite — assigns role, creates profile
        if (token) {
            try {
                const result = await invites.acceptInvite(token, user.id)
                setStatus(
                    `✓ Welcome! Your account is set up as a ${result.role}. Redirecting…`,
                    'success'
                )
            } catch (inviteErr) {
                // Signup succeeded but invite accept failed — still let them in
                console.warn('[auth-signup] acceptInvite failed:', inviteErr.message)
                setStatus('✓ Account created! Role will be assigned by an admin.', 'success')
            }
        } else {
            setStatus('✓ Account created! Redirecting to your profile…', 'success')
        }

        // Redirect after a short delay so user can read the message
        setTimeout(() => {
            window.location.href = '/profile/index.html'
        }, 1800)

    } catch (err) {
        setStatus(err.message, 'error')
        if (submitBtn) {
            submitBtn.disabled    = false
            submitBtn.textContent = 'Create Account'
        }
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract ?token= from the URL without any external library. */
function getTokenFromUrl() {
    return new URLSearchParams(window.location.search).get('token') || ''
}

function setStatus(msg, type = 'info') {
    if (!statusEl) return
    statusEl.textContent = msg
    const colors = {
        info:    '#555',
        success: '#2e7d32',
        error:   '#c62828'
    }
    statusEl.style.color = colors[type] ?? '#555'
}
