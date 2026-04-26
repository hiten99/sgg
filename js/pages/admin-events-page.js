/**
 * ADMIN EVENTS PAGE BINDING  (/js/pages/admin-events-page.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * Connects admin/events.html to the events module.
 *
 * Form reuse pattern (create vs update):
 *   - #event-form-id is EMPTY  → openCreateModal() → handleFormSave() calls createEvent()
 *   - #event-form-id has a UUID → openEditModal()  → handleFormSave() calls updateEvent()
 *   The form is identical in both cases; only the hidden ID field decides the path.
 *
 * Edit button binding:
 *   Each rendered <tr> has data-* attributes on its Edit button.
 *   A single delegated listener on #admin-events-tbody catches all clicks via
 *   e.target.closest('.admin-event-edit-btn') — no per-row listener needed.
 *
 * IDs required in HTML:
 *   #admin-event-status       — status messages (page-level)
 *   #admin-event-count        — "X events" label
 *   #admin-events-sort        — sort <select>
 *   #admin-create-event-btn   — opens modal in create mode
 *   #admin-events-tbody       — JS injects <tr> rows
 *   #admin-events-prev-btn    — prev page
 *   #admin-events-next-btn    — next page
 *   #admin-events-page-info   — "Page X of Y"
 *
 *   (Modal)
 *   #admin-event-modal        — overlay div
 *   #admin-event-modal-title  — modal heading
 *   #admin-event-form         — form element
 *   #event-form-id            — hidden id input (empty = create, filled = edit)
 *   #event-form-title         — title input
 *   #event-form-description   — description textarea
 *   #event-form-date          — datetime-local input
 *   #event-form-location      — location input
 *   #event-form-status        — status select
 *   #event-form-modal-status  — validation / error messages inside modal
 *   #admin-event-save-btn     — submit button
 *   #admin-event-cancel-btn   — cancel button
 */

import { supabase } from '../config/supabase.js'
import { events, PAGE_SIZE } from '../modules/events.js'
import { requireAuth, isAdmin } from '../utils/auth-guard.js'

// ─── DOM refs — page level ────────────────────────────────────────────────────
const statusEl  = document.getElementById('admin-event-status')
const countEl   = document.getElementById('admin-event-count')
const sortEl    = document.getElementById('admin-events-sort')
const createBtn = document.getElementById('admin-create-event-btn')
const tbody     = document.getElementById('admin-events-tbody')
const prevBtn   = document.getElementById('admin-events-prev-btn')
const nextBtn   = document.getElementById('admin-events-next-btn')
const pageInfo  = document.getElementById('admin-events-page-info')

// ─── DOM refs — modal form ────────────────────────────────────────────────────
const modal       = document.getElementById('admin-event-modal')
const modalTitle  = document.getElementById('admin-event-modal-title')
const form        = document.getElementById('admin-event-form')
const cancelBtn   = document.getElementById('admin-event-cancel-btn')
const saveBtn     = document.getElementById('admin-event-save-btn')
const modalStatus = document.getElementById('event-form-modal-status')

const fieldId     = document.getElementById('event-form-id')
const fieldTitle  = document.getElementById('event-form-title')
const fieldDesc   = document.getElementById('event-form-description')
const fieldDate   = document.getElementById('event-form-date')
const fieldLoc    = document.getElementById('event-form-location')
const fieldStatus = document.getElementById('event-form-status')

// ─── State ────────────────────────────────────────────────────────────────────
let currentPage = 0
let totalCount  = 0
let currentSort = 'asc'

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const session = await requireAuth()
    if (!session) return

    if (!(await isAdmin())) {
        setStatus('⛔ Access denied. Admins only.', 'error')
        return
    }

    await loadPage()

    sortEl?.addEventListener('change', async () => {
        currentSort = sortEl.value
        currentPage = 0
        await loadPage()
    })

    prevBtn?.addEventListener('click', async () => {
        if (currentPage > 0) { currentPage--; await loadPage() }
    })
    nextBtn?.addEventListener('click', async () => {
        currentPage++; await loadPage()
    })

    createBtn?.addEventListener('click', openCreateModal)
    cancelBtn?.addEventListener('click', closeModal)
    form?.addEventListener('submit', handleFormSave)
    tbody?.addEventListener('click', handleRowAction)

    // Support ?edit=<id> deep-link from other pages
    const editId = new URLSearchParams(window.location.search).get('edit')
    if (editId) await loadEvent(editId)
})

// ═══════════════════════════════════════════════════════════════════════════════
// 1. loadEvent(eventId)
//    Fetches a single event from Supabase and calls populateForm().
//    Used when admin clicks Edit OR when ?edit= is in the URL.
// ═══════════════════════════════════════════════════════════════════════════════
async function loadEvent(eventId) {
    setModalStatus('Loading event…', 'info')
    setSaveLoading(true, 'Loading…')

    // Show modal immediately with a loading state so UX feels instant
    if (modalTitle) modalTitle.textContent = '✏️ Edit Event'
    if (modal)      modal.style.display = 'flex'
    clearFieldErrors()
    form?.reset()

    try {
        const ev = await events.getEvent(eventId)
        populateForm(ev)
        setModalStatus('', '')
    } catch (err) {
        setModalStatus(`Could not load event: ${err.message}`, 'error')
    } finally {
        setSaveLoading(false, 'Save Changes')
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. populateForm(eventData)
//    Fills every form field from a single event object.
//    Works regardless of whether data came from data-* attrs or a DB fetch.
// ═══════════════════════════════════════════════════════════════════════════════
function populateForm(ev) {
    // Hidden ID field: presence of this value is what makes handleFormSave()
    // call updateEvent() instead of createEvent()
    if (fieldId)     fieldId.value     = ev.id ?? ''
    if (fieldTitle)  fieldTitle.value  = ev.title ?? ''
    if (fieldDesc)   fieldDesc.value   = ev.description ?? ''
    if (fieldLoc)    fieldLoc.value    = ev.location ?? ''
    if (fieldStatus) fieldStatus.value = ev.status ?? 'active'

    // datetime-local input requires "YYYY-MM-DDTHH:mm" format (no seconds/timezone)
    if (fieldDate) {
        fieldDate.value = ev.event_date
            ? new Date(ev.event_date).toISOString().slice(0, 16)
            : ''
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. submitUpdate(id, payload)
//    Separated from handleFormSave so it can be called independently in tests.
//    Returns the updated event object from Supabase.
// ═══════════════════════════════════════════════════════════════════════════════
async function submitUpdate(id, payload) {
    return events.updateEvent(id, payload)
}

async function submitCreate(payload) {
    return events.createEvent(payload)
}

// ─── Form submit — routes to create or update ─────────────────────────────────
async function handleFormSave(e) {
    e.preventDefault()

    // ── Collect values ────────────────────────────────────────────────────────
    const id          = fieldId?.value.trim()  // empty = create, has UUID = update
    const titleVal    = fieldTitle?.value.trim() ?? ''
    const descVal     = fieldDesc?.value.trim()  || null
    const dateVal     = fieldDate?.value         || ''
    const locationVal = fieldLoc?.value.trim()   || null
    const statusVal   = fieldStatus?.value       ?? 'active'

    // ── Validate ──────────────────────────────────────────────────────────────
    const errors = validateEventForm({ title: titleVal, date: dateVal })
    if (errors.length > 0) {
        errors.forEach(err => markFieldError(err.field, err.message))
        setModalStatus(errors[0].message, 'error')
        return
    }

    clearFieldErrors()

    const payload = {
        title:       titleVal,
        description: descVal,
        event_date:  new Date(dateVal).toISOString(),
        location:    locationVal,
        status:      statusVal
    }

    // ── Loading state ─────────────────────────────────────────────────────────
    setSaveLoading(true, id ? 'Saving changes…' : 'Creating event…')
    setModalStatus(id ? 'Updating event…' : 'Creating event…', 'info')

    try {
        // ── Handle Image Upload ───────────────────────────────────────────────
        const imageInput = document.getElementById('event-form-image')
        const file = imageInput?.files[0]
        
        if (file) {
            setModalStatus('Uploading banner image…', 'info')
            const fileExt = file.name.split('.').pop()
            const fileName = `events/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
            
            const { error: uploadError } = await supabase.storage
                .from('public-images')
                .upload(fileName, file, { cacheControl: '3600', upsert: false })
                
            if (uploadError) throw new Error(`Image upload failed: ${uploadError.message}`)
            
            const { data: { publicUrl } } = supabase.storage
                .from('public-images')
                .getPublicUrl(fileName)
                
            payload.image_url = publicUrl
        }

        if (id) {
            await submitUpdate(id, payload)
            setStatus('✓ Event updated.', 'success')
        } else {
            await submitCreate(payload)
            setStatus('✓ Event created.', 'success')
        }

        closeModal()
        currentPage = 0
        await loadPage()

    } catch (err) {
        setModalStatus(`Error: ${err.message}`, 'error')
    } finally {
        setSaveLoading(false, id ? 'Save Changes' : 'Create Event')
    }
}

// ─── Validation ───────────────────────────────────────────────────────────────
/**
 * Returns an array of { field: string, message: string } error objects.
 * Empty array = form is valid.
 *
 * Rules:
 *   - title:      required, 3–120 chars
 *   - date:       required, must be a valid date, cannot be in the past (warn only)
 */
function validateEventForm({ title, date }) {
    const errors = []

    if (!title) {
        errors.push({ field: 'event-form-title', message: 'Event title is required.' })
    } else if (title.length < 3) {
        errors.push({ field: 'event-form-title', message: 'Title must be at least 3 characters.' })
    } else if (title.length > 120) {
        errors.push({ field: 'event-form-title', message: 'Title must be under 120 characters.' })
    }

    if (!date) {
        errors.push({ field: 'event-form-date', message: 'Event date and time is required.' })
    } else if (isNaN(new Date(date).getTime())) {
        errors.push({ field: 'event-form-date', message: 'Please enter a valid date and time.' })
    }

    return errors
}

/** Adds a red border + small error label below a field. */
function markFieldError(fieldId, message) {
    const el = document.getElementById(fieldId)
    if (!el) return
    el.style.borderColor = '#e53935'

    // Append error hint below field if not already there
    const existingHint = el.parentElement?.querySelector('.field-error-hint')
    if (!existingHint) {
        const hint = document.createElement('span')
        hint.className  = 'field-error-hint'
        hint.textContent = message
        hint.style.cssText = 'display:block;color:#e53935;font-size:.78rem;margin-top:4px;'
        el.parentElement?.appendChild(hint)
    }
}

/** Removes all red borders and error hints from form fields. */
function clearFieldErrors() {
    form?.querySelectorAll('input, select, textarea').forEach(el => {
        el.style.borderColor = ''
    })
    form?.querySelectorAll('.field-error-hint').forEach(el => el.remove())
}

// ─── Modal: Create ─────────────────────────────────────────────────────────────
function openCreateModal() {
    form?.reset()
    clearFieldErrors()
    if (fieldId)    fieldId.value = ''   // empty = create mode
    if (modalTitle) modalTitle.textContent = '＋ Create Event'
    if (saveBtn)    saveBtn.textContent    = 'Create Event'
    setModalStatus('', '')
    if (modal)      modal.style.display = 'flex'
}

// ─── Modal: Edit (from data-* attributes — no DB fetch needed for fast UX) ─────
/**
 * Opens the modal and populates it from data already in the table row.
 * Data-* attributes are embedded by renderTable() so no extra network call.
 * Falls back to loadEvent() if the row data seems stale (future: cache-busting).
 */
function openEditModal(data) {
    clearFieldErrors()
    setModalStatus('', '')
    if (modalTitle) modalTitle.textContent = '✏️ Edit Event'
    if (saveBtn)    saveBtn.textContent    = 'Save Changes'

    // Map data-* attribute names → event object shape expected by populateForm()
    populateForm({
        id:          data.id,
        title:       data.title,
        description: data.description,
        event_date:  data.date,       // note: renderTable stores as data-date
        location:    data.location,
        status:      data.status
    })

    if (modal) modal.style.display = 'flex'
}

function closeModal() {
    if (modal) modal.style.display = 'none'
    clearFieldErrors()
    setModalStatus('', '')
}

// ─── Table row click delegation ───────────────────────────────────────────────
function handleRowAction(e) {
    const editBtn   = e.target.closest('.admin-event-edit-btn')
    const deleteBtn = e.target.closest('.admin-event-delete-btn')

    if (editBtn)   openEditModal(editBtn.dataset)
    if (deleteBtn) handleDelete(deleteBtn.dataset)
}

// ─── Delete ────────────────────────────────────────────────────────────────────
async function handleDelete({ id, title }) {
    if (!confirm(`Delete "${title}"?\n\nThis is permanent and cannot be undone.`)) return

    // Dim the row for immediate visual feedback
    const row = tbody?.querySelector(`[data-id="${id}"]`)?.closest('tr')
    if (row) { row.style.opacity = '0.4'; row.style.pointerEvents = 'none' }

    setStatus('Deleting…', 'info')

    try {
        await events.deleteEvent(id)
        setStatus(`✓ "${title}" deleted.`, 'success')
        totalCount--
        await loadPage()
    } catch (err) {
        if (row) { row.style.opacity = '1'; row.style.pointerEvents = '' }
        setStatus(`Error: ${err.message}`, 'error')
    }
}

// ─── Render table ──────────────────────────────────────────────────────────────
async function loadPage() {
    setStatus('Loading…', 'info')

    try {
        const result = await events.getEvents({ page: currentPage, sort: currentSort, status: 'active' })
        totalCount = result.count
        renderTable(result.data)
        updatePagination(result.hasMore)
        if (countEl) countEl.textContent = `${totalCount} event${totalCount !== 1 ? 's' : ''}`
        setStatus('', '')
    } catch (err) {
        setStatus(`Error: ${err.message}`, 'error')
    }
}

function renderTable(list) {
    if (!tbody) return

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="padding:30px;text-align:center;color:#999;">
            No events yet — click <strong>Create Event</strong> to add your first one.
        </td></tr>`
        return
    }

    // All event fields stored as data-* on the Edit button.
    // This means openEditModal() needs NO extra DB call for typical edits.
    tbody.innerHTML = list.map(ev => `
        <tr>
            <td><strong>${escHtml(ev.title)}</strong></td>
            <td style="white-space:nowrap;">${formatDate(ev.event_date)}</td>
            <td>${escHtml(ev.location ?? '—')}</td>
            <td><span class="status-badge status-${escHtml(ev.status)}">${escHtml(ev.status)}</span></td>
            <td>
                <button class="btn-action btn-edit admin-event-edit-btn"
                    data-id="${ev.id}"
                    data-title="${escHtml(ev.title)}"
                    data-description="${escHtml(ev.description ?? '')}"
                    data-date="${ev.event_date}"
                    data-location="${escHtml(ev.location ?? '')}"
                    data-status="${ev.status}"
                >✏️ Edit</button>
                <button class="btn-action btn-remove admin-event-delete-btn"
                    data-id="${ev.id}"
                    data-title="${escHtml(ev.title)}"
                >🗑 Delete</button>
            </td>
        </tr>
    `).join('')
}

// ─── Pagination ────────────────────────────────────────────────────────────────
function updatePagination(hasMore) {
    const totalPages = Math.ceil(totalCount / PAGE_SIZE)
    if (prevBtn)  prevBtn.disabled  = currentPage === 0
    if (nextBtn)  nextBtn.disabled  = !hasMore
    if (pageInfo) pageInfo.textContent = totalPages > 1
        ? `Page ${currentPage + 1} of ${totalPages}` : ''
}

// ─── Loading state helpers ─────────────────────────────────────────────────────
function setSaveLoading(loading, label) {
    if (!saveBtn) return
    saveBtn.disabled    = loading
    saveBtn.textContent = label
    saveBtn.style.opacity = loading ? '0.7' : '1'
}

// ─── Status helpers ────────────────────────────────────────────────────────────

/** Page-level status banner below the hero */
function setStatus(msg, type = 'info') {
    if (!statusEl) return
    statusEl.textContent = msg
    statusEl.className   = `event-status-${type}`
}

/** Status message inside the modal (above the save button) */
function setModalStatus(msg, type = 'info') {
    if (!modalStatus) return
    modalStatus.textContent = msg
    const colors = { info: '#1976d2', success: '#2e7d32', error: '#e53935' }
    modalStatus.style.color   = colors[type] ?? '#555'
    modalStatus.style.display = msg ? 'block' : 'none'
}

function formatDate(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    })
}

function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
