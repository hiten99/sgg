/**
 * DIRECTORY PAGE BINDING  (/js/pages/directory-page.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * Connects directory/index.html to the profile module.
 * Renders all members as cards with live client-side search.
 *
 * IDs required in HTML:
 *   #dir-grid    — container where .member-card elements are injected
 *   #dir-search  — search input (filters in-memory, no extra DB calls)
 *   #dir-count   — "X members" label
 *   #dir-status  — loading / error messages
 */

import { profile } from '../modules/profile.js'
import { requireAuth } from '../utils/auth-guard.js'

const grid     = document.getElementById('dir-grid')
const searchEl = document.getElementById('dir-search')
const countEl  = document.getElementById('dir-count')
const statusEl = document.getElementById('dir-status')

let allMembers = []   // full list — filtering happens here, not in DB

document.addEventListener('DOMContentLoaded', async () => {
    // Directory is members-only
    const session = await requireAuth()
    if (!session) return

    await loadDirectory()

    // Live client-side search — no extra DB calls
    searchEl?.addEventListener('input', () => {
        const q = searchEl.value.trim().toLowerCase()
        const filtered = q
            ? allMembers.filter(m =>
                (m.full_name ?? '').toLowerCase().includes(q) ||
                (m.city      ?? '').toLowerCase().includes(q) ||
                (m.state     ?? '').toLowerCase().includes(q)
              )
            : allMembers
        renderGrid(filtered)
    })
})

// ─── Fetch + render ───────────────────────────────────────────────────────────
async function loadDirectory() {
    setStatus('Loading members…')
    showShimmers()

    try {
        allMembers = await profile.listMembers()
        // Filter out soft-deleted accounts
        allMembers = allMembers.filter(m => m.role !== 'deleted')
        renderGrid(allMembers)
        setStatus('')
    } catch (err) {
        setStatus(`Error: ${err.message}`)
    }
}

function renderGrid(list) {
    if (!grid) return

    if (countEl) countEl.textContent = `${list.length} member${list.length !== 1 ? 's' : ''}`

    if (list.length === 0) {
        grid.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:60px 20px; color:#7a7a7a;">
                <div style="font-size:2.5rem; margin-bottom:14px;">👥</div>
                <p>No members found.</p>
            </div>`
        return
    }

    grid.innerHTML = list.map(m => buildCard(m)).join('')
}

function buildCard(m) {
    const name      = m.full_name ?? 'Community Member'
    const initials  = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
    const location  = [m.city, m.state].filter(Boolean).join(', ') || ''
    const role      = m.role ?? 'member'
    const roleLabel = role === 'admin' ? '👑 Admin' : 'Member'

    return `
        <div class="member-card">
            <div class="member-avatar">${escHtml(initials)}</div>
            <div class="member-name">${escHtml(name)}</div>
            ${location ? `<div class="member-location">📍 ${escHtml(location)}</div>` : ''}
            ${m.bio     ? `<p class="member-bio">${escHtml(m.bio)}</p>` : ''}
            <span class="member-role-badge role-${escHtml(role)}">${roleLabel}</span>
        </div>`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function showShimmers() {
    if (!grid) return
    grid.innerHTML = Array(8).fill('<div class="shimmer"></div>').join('')
}

function setStatus(msg) {
    if (!statusEl) return
    statusEl.textContent = msg
    statusEl.style.color = msg.startsWith('Error') ? '#e53935' : '#1976d2'
}

function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
