/**
 * ADMIN-MAIN.JS
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs on every admin/* page as a proper <script type="module"> tag.
 *
 * Why navbar logic lives here and NOT inside admin-header.html:
 *   Browsers never execute <script> tags injected via innerHTML.
 *   All post-injection logic (username, active link, mobile toggle)
 *   must run here, after await injectComponent() resolves.
 */

import { auth }     from './modules/auth.js'
import { supabase } from './config/supabase.js'

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Inject components (scripts inside them will NOT auto-run)
    await injectComponent('admin-header-placeholder', '/components/admin-header.html')
    await injectComponent('footer-placeholder', '/components/footer.html')

    // 2. Run all navbar logic now that the DOM is populated
    await initAdminNavbar()

    // 3. Delegated logout
    document.addEventListener('click', async (e) => {
        if (e.target?.id === 'nav-logout-btn') {
            e.preventDefault()
            try { await auth.logout() } catch (err) {
                console.error('[admin-main] Logout error:', err.message)
            }
        }
    })
})

// ─── Admin navbar initialisation ──────────────────────────────────────────────
async function initAdminNavbar() {
    // Highlight active link
    const rawPath = window.location.pathname
    const path = rawPath.replace(/\/index\.html$/, '') || '/'
    document.querySelectorAll('.admin-nav-link').forEach(link => {
        const href = link.getAttribute('href').split('#')[0].replace(/\/index\.html$/, '') || '/'
        if (href === path) link.classList.add('active')
    })

    // Mobile hamburger
    const toggle = document.getElementById('admin-nav-toggle')
    const links  = document.getElementById('admin-nav-links')
    const right  = document.querySelector('.admin-nav-right')
    toggle?.addEventListener('click', () => {
        links?.classList.toggle('open')
        right?.classList.toggle('open')
    })

    // Show user's name in #admin-nav-username
    const usernameEl = document.getElementById('admin-nav-username')
    if (!usernameEl) return

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const { data: prof } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', session.user.id)
        .single()

    usernameEl.textContent = prof?.full_name || session.user.email || 'Admin'
}

// ─── Component loader ─────────────────────────────────────────────────────────
async function injectComponent(placeholderId, url) {
    const el = document.getElementById(placeholderId)
    if (!el) return
    try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        el.innerHTML = await res.text()
    } catch (err) {
        console.warn(`[admin-main] Could not load "${url}":`, err.message)
    }
}
