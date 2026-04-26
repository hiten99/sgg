/**
 * AUTH LOGIN PAGE BINDING  (/js/pages/auth-login.js)
 *
 * IDs required in HTML:
 *   #login-form     — <form>
 *   #login-email    — email input
 *   #login-password — password input
 *   #login-submit   — submit button
 *   #auth-status    — status/error message element
 *
 * Redirect Guard:
 *   If a session already exists on page load, the user is redirected
 *   immediately to /profile/index.html without seeing the login form.
 */

import { auth }     from '../modules/auth.js'
import { supabase } from '../config/supabase.js'

const form      = document.getElementById('login-form')
const emailEl   = document.getElementById('login-email')
const passEl    = document.getElementById('login-password')
const statusEl  = document.getElementById('auth-status')
const submitBtn = document.getElementById('login-submit')

// ─── Redirect guard — fires on page load ─────────────────────────────────────
;(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
        window.location.replace('/profile/index.html')
    }
})()

// ─── Form submit ──────────────────────────────────────────────────────────────
form?.addEventListener('submit', async (e) => {
    e.preventDefault()

    const email = emailEl?.value.trim()
    const pass  = passEl?.value

    if (!email || !pass) {
        setStatus('Please enter your email and password.', 'error')
        return
    }

    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Signing in…' }
    setStatus('Signing in…', 'info')

    try {
        await auth.login(email, pass)
        // auth.login() redirects to /profile/index.html on success
    } catch (err) {
        setStatus(err.message, 'error')
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Sign In' }
    }
})

function setStatus(msg, type) {
    if (!statusEl) return
    statusEl.textContent = msg
    statusEl.className   = `auth-status-${type}`
}
