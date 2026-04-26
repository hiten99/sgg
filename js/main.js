/**
 * MAIN.JS
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs on every public page as a proper <script type="module"> tag.
 *
 * Why logic lives here and NOT inside user-header.html:
 *   Browsers do NOT execute <script> tags that are injected via innerHTML.
 *   After fetch() → el.innerHTML = html, any <script> inside is inert.
 *   All post-injection logic (auth state, active links, mobile toggle)
 *   must run here, after await injectComponent() resolves.
 *
 * Responsibilities:
 *   1. Inject user-header.html into #header-placeholder
 *   2. Inject footer.html into #footer-placeholder
 *   3. Set auth-aware navbar state (guest vs member, avatar, admin pill)
 *   4. Active link highlighting
 *   5. Mobile hamburger toggle
 *   6. Delegated logout handler
 */

import { supabase } from './config/supabase.js'
import { auth }     from './modules/auth.js'

document.addEventListener('DOMContentLoaded', async () => {
    // ── 1. Inject components ─────────────────────────────────────────────────
    await injectComponent('header-placeholder', '/components/user-header.html')
    await injectComponent('footer-placeholder', '/components/footer.html')

    // ── 2. Auth-aware navbar ─────────────────────────────────────────────────
    //    Runs after inject so all IDs exist in the DOM
    await initNavbar()

    // ── 3. Delegated logout — document level so it always works ─────────────
    document.addEventListener('click', async (e) => {
        if (e.target?.id === 'user-nav-logout-btn') {
            e.preventDefault()
            try { await auth.logout() } catch (err) {
                console.error('[main] Logout error:', err.message)
            }
        }
    })
})

// ─── Navbar initialisation (runs after component is in the DOM) ───────────────
async function initNavbar() {
    // Active link highlight
    const rawPath = window.location.pathname
    const path = rawPath.replace(/\/index\.html$/, '') || '/'
    document.querySelectorAll('.user-nav-link').forEach(link => {
        const href = link.getAttribute('href').split('#')[0].replace(/\/index\.html$/, '') || '/'
        if (href === path) link.classList.add('active')
    })

    // Mobile hamburger
    const toggle  = document.getElementById('user-nav-toggle')
    const linksEl = document.getElementById('user-nav-links')
    const rightEl = document.getElementById('user-nav-right')
    toggle?.addEventListener('click', () => {
        linksEl?.classList.toggle('open')
        rightEl?.classList.toggle('open')
    })

    // DOM refs
    const guestEl  = document.getElementById('unav-guest')
    const memberEl = document.getElementById('unav-member')
    const avatarEl = document.getElementById('unav-avatar-initials')
    const adminLink = document.getElementById('unav-admin-link')

    // Check session
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
        // Logged out — show Sign In button only
        if (guestEl)  guestEl.style.display  = 'flex'
        if (memberEl) memberEl.style.display  = 'none'
        return
    }

    // Logged in — show member area, hide guest
    if (guestEl)  guestEl.style.display  = 'none'
    if (memberEl) memberEl.style.display = 'flex'

    // If logged in, point the Events link directly to the dashboard
    const eventsLink = document.getElementById('unav-events')
    if (eventsLink) eventsLink.href = '/events/index.html'

    // Fetch profile for initials + admin check
    const { data: prof } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', session.user.id)
        .single()

    // Build exactly 2-letter initials:
    //   "Ravi Patel"  → "RP"
    //   "Hiten"       → "HI"  (first 2 chars of single name)
    //   email fallback → first 2 chars of local part, uppercased
    if (avatarEl) {
        const name = prof?.full_name?.trim() || ''
        let initials = ''

        if (name) {
            const parts = name.split(/\s+/).filter(Boolean)
            if (parts.length >= 2) {
                initials = (parts[0][0] + parts[1][0]).toUpperCase()
            } else {
                initials = name.slice(0, 2).toUpperCase()
            }
        } else {
            // Fallback: first 2 chars of email local part
            const emailLocal = session.user.email?.split('@')[0] ?? ''
            initials = emailLocal.slice(0, 2).toUpperCase()
        }

        avatarEl.textContent = initials || '??'
    }

    // Show ⚙️ Admin pill if role is admin
    if (adminLink && prof?.role === 'admin') {
        adminLink.style.display = 'inline-flex'
    }
}

// ─── Component loader ─────────────────────────────────────────────────────────
async function injectComponent(placeholderId, url) {
    const el = document.getElementById(placeholderId)
    if (!el) return
    try {
        // Append cache-buster to ensure the latest component is always loaded during dev
        const cacheBusterUrl = url + '?v=' + Date.now()
        const res = await fetch(cacheBusterUrl)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        el.innerHTML = await res.text()
    } catch (err) {
        console.warn(`[main] Could not load "${url}":`, err.message)
    }
}
