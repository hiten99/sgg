/**
 * PROFILE PAGE BINDING  (/js/pages/profile-page.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * Connects profile/index.html to the profile module.
 *
 * IDs this script depends on:
 *   #profile-form          — <form> element
 *   #profile-full-name     — full name input
 *   #profile-phone         — phone input
 *   #profile-city          — city input
 *   #profile-state         — state/province input
 *   #profile-bio           — bio textarea
 *   #profile-save-btn      — submit button
 *   #profile-status        — status / error message element
 *
 *   (Hero section — visual only, no form logic)
 *   #profile-avatar-initials — avatar circle initials text
 *   #profile-hero-name       — display name in hero
 *   #profile-hero-email      — email in hero
 *   #profile-hero-badge      — role badge (shows for admin)
 */

import { profile } from '../modules/profile.js'
import { requireAuth, getCurrentUser } from '../utils/auth-guard.js'

// ─── DOM refs — form ──────────────────────────────────────────────────────────
const form      = document.getElementById('profile-form')
const statusEl  = document.getElementById('profile-status')
const saveBtn   = document.getElementById('profile-save-btn')

const FIELDS = {
    full_name : document.getElementById('profile-full-name'),
    phone     : document.getElementById('profile-phone'),
    city      : document.getElementById('profile-city'),
    state     : document.getElementById('profile-state'),
    bio       : document.getElementById('profile-bio'),
}

// ─── DOM refs — hero (visual only) ───────────────────────────────────────────
const avatarEl  = document.getElementById('profile-avatar-initials')
const heroName  = document.getElementById('profile-hero-name')
const heroEmail = document.getElementById('profile-hero-email')
const heroBadge = document.getElementById('profile-hero-badge')

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const session = await requireAuth()
    if (!session) return

    await loadProfile()
    form?.addEventListener('submit', handleSave)
})

// ─── Load profile ─────────────────────────────────────────────────────────────
async function loadProfile() {
    setStatus('Loading…', 'info')

    try {
        const user = await getCurrentUser()
        const data = await profile.getOwnProfile()

        // ── Populate hero section ────────────────────────────────────────────
        const displayName = data?.full_name || user?.email || 'Member'

        if (heroName)  heroName.textContent  = displayName
        if (heroEmail) heroEmail.textContent = user?.email ?? ''

        // Avatar initials from name (up to 2 words)
        if (avatarEl) {
            const initials = displayName
                .split(' ')
                .slice(0, 2)
                .map(w => w[0] ?? '')
                .join('')
                .toUpperCase()
            avatarEl.textContent = initials || '?'
        }

        // Show role badge for admins
        if (heroBadge && data?.role === 'admin') {
            heroBadge.textContent = '👑 Admin'
            heroBadge.style.display = 'inline-block'
        }

        // ── Populate form fields ─────────────────────────────────────────────
        if (data) {
            populateForm(data)
            setStatus('', '')
        } else {
            setStatus('Fill in your details below and click Save.', 'info')
        }

    } catch (err) {
        setStatus(`Error loading profile: ${err.message}`, 'error')
    }
}

function populateForm(data) {
    for (const [key, inputEl] of Object.entries(FIELDS)) {
        if (inputEl && data[key] != null) {
            inputEl.value = data[key]
        }
    }
}

// ─── Save profile ─────────────────────────────────────────────────────────────
async function handleSave(e) {
    e.preventDefault()

    // Collect values
    const payload = {}
    for (const [key, inputEl] of Object.entries(FIELDS)) {
        if (inputEl) payload[key] = inputEl.value.trim()
    }

    // Basic validation
    if (!payload.full_name) {
        setStatus('Full name is required.', 'error')
        FIELDS.full_name?.focus()
        return
    }

    setSaving(true)
    setStatus('Saving…', 'info')

    try {
        const saved = await profile.saveOwnProfile(payload)

        // Update hero name + initials live after save
        if (heroName) heroName.textContent = saved.full_name ?? payload.full_name
        if (avatarEl) {
            const initials = (saved.full_name ?? '')
                .split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()
            avatarEl.textContent = initials || '?'
        }

        setStatus('✓ Profile saved successfully!', 'success')
    } catch (err) {
        setStatus(`Error: ${err.message}`, 'error')
    } finally {
        setSaving(false)
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function setSaving(loading) {
    if (!saveBtn) return
    saveBtn.disabled    = loading
    saveBtn.textContent = loading ? 'Saving…' : 'Save Profile'
}

function setStatus(message, type = '') {
    if (!statusEl) return
    statusEl.textContent = message
    statusEl.className   = `profile-status-${type}`
}
