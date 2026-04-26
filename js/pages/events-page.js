/**
 * EVENTS PAGE BINDING  (/js/pages/events-page.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * Connects events/index.html to the events module.
 *
 * Features:
 *   - Paginated card rendering (PAGE_SIZE cards per load)
 *   - Sort by date ASC/DESC
 *   - Admin-only Edit/Delete buttons injected into each card
 *   - No HTML structure changes — binds via IDs only
 *
 * IDs this script depends on:
 *   #events-grid       — container where .event-card elements are injected
 *   #events-sort       — <select> for sort direction
 *   #events-count      — shows "X upcoming events"
 *   #events-status     — loading / error messages
 *   #events-prev-btn   — previous page button
 *   #events-next-btn   — next page button
 *   #events-page-info  — "Page X of Y" label
 */

import { events, PAGE_SIZE } from '../modules/events.js'
import { isAdmin } from '../utils/auth-guard.js'

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const grid      = document.getElementById('events-grid')
const sortEl    = document.getElementById('events-sort')
const countEl   = document.getElementById('events-count')
const statusEl  = document.getElementById('events-status')
const prevBtn   = document.getElementById('events-prev-btn')
const nextBtn   = document.getElementById('events-next-btn')
const pageInfo  = document.getElementById('events-page-info')

// ─── State ────────────────────────────────────────────────────────────────────
let currentPage  = 0
let totalCount   = 0
let currentSort  = 'asc'
let adminMode    = false   // set on init; controls whether edit/delete appear

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    // Check admin status once on load — determines whether action buttons appear
    adminMode = await isAdmin()

    await loadPage()

    // Sort change → reset to page 0 and reload
    sortEl?.addEventListener('change', async () => {
        currentSort = sortEl.value
        currentPage = 0
        await loadPage()
    })

    // Pagination buttons
    prevBtn?.addEventListener('click', async () => {
        if (currentPage > 0) {
            currentPage--
            await loadPage()
        }
    })

    nextBtn?.addEventListener('click', async () => {
        currentPage++
        await loadPage()
    })

    // Delegated card action clicks (edit/delete)
    grid?.addEventListener('click', handleCardAction)
})

// ─── Load a page of events ────────────────────────────────────────────────────
async function loadPage() {
    setStatus('Loading events…', 'info')
    showShimmers()

    try {
        const result = await events.getEvents({
            page: currentPage,
            sort: currentSort
        })

        totalCount = result.count

        renderGrid(result.data)
        updatePagination(result.hasMore)
        updateCount()
        setStatus('', '')

    } catch (err) {
        setStatus(`Error loading events: ${err.message}`, 'error')
        if (grid) grid.innerHTML = ''
    }
}

// ─── Render event cards ───────────────────────────────────────────────────────
/**
 * Injects .event-card elements into #events-grid.
 * Admin-only edit/delete buttons are appended inside each card.
 * No changes to the card CSS classes — all defined in the HTML <style> block.
 */
function renderGrid(eventList) {
    if (!grid) return

    if (eventList.length === 0) {
        grid.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:60px 20px; color:#7a7a7a;">
                <div style="font-size:2.5rem; margin-bottom:16px;">📅</div>
                <p style="font-size:1rem;">No upcoming events. Check back soon!</p>
            </div>`
        return
    }

    grid.innerHTML = eventList.map(ev => buildCard(ev)).join('')
}

/**
 * Builds the HTML string for one event card.
 * Admin buttons are only included when adminMode is true.
 */
function buildCard(ev) {
    const dateStr = formatDate(ev.event_date)
    const isCancelled = ev.status === 'cancelled'

    const adminActions = adminMode ? `
        <div class="event-admin-actions">
            <button class="btn-event-edit"
                data-action="edit"
                data-id="${escHtml(ev.id)}"
                data-title="${escHtml(ev.title)}"
                data-description="${escHtml(ev.description ?? '')}"
                data-date="${escHtml(ev.event_date)}"
                data-location="${escHtml(ev.location ?? '')}"
                data-status="${escHtml(ev.status)}"
            >✏️ Edit</button>
            <button class="btn-event-delete"
                data-action="delete"
                data-id="${escHtml(ev.id)}"
                data-title="${escHtml(ev.title)}"
            >🗑 Delete</button>
        </div>` : ''

    const bannerStyle = ev.image_url 
        ? `background-image: url('${escHtml(ev.image_url)}'); background-size: cover; background-position: center;`
        : ''

    return `
        <div class="event-card" data-event-id="${escHtml(ev.id)}">
            <div class="event-card-banner ${isCancelled ? 'cancelled' : ''}" style="${bannerStyle}"></div>
            <div class="event-card-body">
                <div class="event-card-date">${dateStr}</div>
                <h3 class="event-card-title">${escHtml(ev.title)}</h3>
                <p class="event-card-desc">${escHtml(ev.description ?? '')}</p>
                <div class="event-card-footer">
                    <span class="event-card-location">
                        ${ev.location ? `📍 ${escHtml(ev.location)}` : ''}
                    </span>
                    ${isCancelled ? '<span class="event-cancelled-badge">Cancelled</span>' : ''}
                </div>
                ${adminActions}
            </div>
        </div>`
}

// ─── Card action delegation ───────────────────────────────────────────────────
async function handleCardAction(e) {
    const editBtn   = e.target.closest('[data-action="edit"]')
    const deleteBtn = e.target.closest('[data-action="delete"]')

    if (editBtn)   openEditModal(editBtn.dataset)
    if (deleteBtn) handleDelete(deleteBtn.dataset)
}

// ─── Edit modal (re-uses admin-event-modal if on admin page, else inline) ─────
function openEditModal(data) {
    // If we're on the admin events page, dispatch to that modal
    const modal = document.getElementById('admin-event-modal')
    if (modal) {
        fillEventModal(data)
        modal.style.display = 'flex'
        return
    }
    // Fallback: redirect to admin events page pre-filled
    window.location.href = `/admin/events.html?edit=${data.id}`
}

function fillEventModal(data) {
    setField('event-form-id',          data.id          ?? '')
    setField('event-form-title',       data.title       ?? '')
    setField('event-form-description', data.description ?? '')
    setField('event-form-location',    data.location    ?? '')
    setField('event-form-status',      data.status      ?? 'active')
    // Format date for datetime-local input: "2024-06-15T18:00"
    const dt = data.date ? new Date(data.date).toISOString().slice(0, 16) : ''
    setField('event-form-date', dt)

    const title = document.getElementById('admin-event-modal-title')
    if (title) title.textContent = '✏️ Edit Event'
}

async function handleDelete({ id, title }) {
    if (!confirm(`Delete "${title}"?\nThis cannot be undone.`)) return

    const card = document.querySelector(`[data-event-id="${id}"]`)
    if (card) {
        card.style.opacity = '0.5'
        card.style.pointerEvents = 'none'
    }

    try {
        await events.deleteEvent(id)
        card?.remove()
        totalCount--
        updateCount()
        setStatus(`✓ "${title}" deleted.`, 'success')
    } catch (err) {
        if (card) { card.style.opacity = '1'; card.style.pointerEvents = '' }
        setStatus(`Error: ${err.message}`, 'error')
    }
}

// ─── Pagination UI ────────────────────────────────────────────────────────────
function updatePagination(hasMore) {
    const totalPages = Math.ceil(totalCount / PAGE_SIZE)

    if (prevBtn) prevBtn.disabled = currentPage === 0
    if (nextBtn) nextBtn.disabled = !hasMore
    if (pageInfo) {
        pageInfo.textContent = totalPages > 1
            ? `Page ${currentPage + 1} of ${totalPages}`
            : ''
    }
}

function updateCount() {
    if (countEl) countEl.textContent = `${totalCount} event${totalCount !== 1 ? 's' : ''}`
}

// ─── Loading shimmer ──────────────────────────────────────────────────────────
function showShimmers() {
    if (!grid) return
    grid.innerHTML = Array(6).fill(
        '<div class="loading-shimmer"></div>'
    ).join('')
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function setStatus(msg, type = 'info') {
    if (!statusEl) return
    statusEl.textContent = msg
    const colors = { info: '#1976d2', success: '#2e7d32', error: '#e53935' }
    statusEl.style.color = colors[type] ?? '#555'
}

function setField(id, value) {
    const el = document.getElementById(id)
    if (el) el.value = value
}

function formatDate(iso) {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString('en-US', {
        weekday: 'short',
        year:    'numeric',
        month:   'long',
        day:     'numeric',
        hour:    '2-digit',
        minute:  '2-digit'
    })
}

function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}
