/**
 * ADMIN PAGE BINDING  (/js/pages/admin-page.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * Connects the admin/index.html to profile module admin operations.
 *
 * IDs this script depends on (must exist in HTML):
 *   #admin-status          — status message element
 *   #admin-search-input    — search text input
 *   #admin-user-tbody      — <tbody> to inject user rows into
 *
 *   (Modal)
 *   #admin-edit-modal      — modal wrapper div
 *   #admin-modal-title     — <h3> heading inside modal
 *   #admin-edit-form       — the edit form
 *   #admin-edit-userid     — hidden input storing user id
 *   #admin-edit-fullname   — full name input
 *   #admin-edit-role       — role <select>
 *   #admin-edit-save-btn   — save button
 *   #admin-edit-cancel-btn — cancel button
 *
 * This file adds NO styles and changes NO HTML structure.
 */

import { profile } from '../modules/profile.js'
import { invites } from '../modules/invites.js'
import { adminRoles } from '../modules/adminRoles.js'
import { requireAuth, isAdmin } from '../utils/auth-guard.js'

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const statusEl = document.getElementById('admin-status')
const searchInput = document.getElementById('admin-search-input')
const tbody = document.getElementById('admin-user-tbody')
const countEl = document.getElementById('admin-member-count')

// ─── Invite DOM refs ────────────────────────────────────────────────────────
const inviteBtn         = document.getElementById('admin-invite-btn')
const inviteModal       = document.getElementById('admin-invite-modal')
const inviteForm        = document.getElementById('admin-invite-form')
const inviteTbody       = document.getElementById('admin-invite-tbody')
const inviteEmailEl     = document.getElementById('invite-email')
const inviteRoleEl      = document.getElementById('invite-role')
const inviteModalStatus = document.getElementById('invite-modal-status')
const inviteCancelBtn   = document.getElementById('admin-invite-cancel-btn')
const inviteUrlWrap     = document.getElementById('invite-url-wrap')
const inviteUrlInput    = document.getElementById('invite-url-input')
const inviteCopyBtn     = document.getElementById('invite-copy-btn')

const modal = document.getElementById('admin-edit-modal')
const modalTitle = document.getElementById('admin-modal-title')
const editForm = document.getElementById('admin-edit-form')
const editUserId = document.getElementById('admin-edit-userid')
const editName = document.getElementById('admin-edit-fullname')
const editRole = document.getElementById('admin-edit-role')
const cancelBtn = document.getElementById('admin-edit-cancel-btn')

// In-memory store so we can filter without re-fetching
let allMembers = []

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Must be logged in
    const session = await requireAuth()
    if (!session) return

    // 2. Must be admin
    const adminCheck = await isAdmin()
    if (!adminCheck) {
        setStatus('⛔ Access denied. This page is for admins only.', 'error')
        if (tbody) tbody.innerHTML = ''
        return
    }

    // 3. Load members
    await loadMembers()

    // 4. Wire up search
    searchInput?.addEventListener('input', () => {
        const q = searchInput.value.toLowerCase()
        const filtered = allMembers.filter(m =>
            (m.full_name ?? '').toLowerCase().includes(q)
        )
        renderTable(filtered)
    })

    // 5. Wire up modal cancel
    cancelBtn?.addEventListener('click', closeModal)

    // 6. Wire up edit form submit
    editForm?.addEventListener('submit', handleEditSave)

    // 7. Wire up table clicks ONCE here (not inside renderTable)
    tbody?.addEventListener('click', handleTableClick)

    // 8. Wire up invite button + modal
    inviteBtn?.addEventListener('click', openInviteModal)
    inviteCancelBtn?.addEventListener('click', closeInviteModal)
    inviteForm?.addEventListener('submit', handleInviteSend)
    inviteCopyBtn?.addEventListener('click', () => {
        inviteUrlInput?.select()
        navigator.clipboard.writeText(inviteUrlInput?.value ?? '')
        inviteCopyBtn.textContent = 'Copied!'
        setTimeout(() => { inviteCopyBtn.textContent = 'Copy' }, 2000)
    })

    // 9. Load pending invites
    await loadInvites()

    // 10. Inline role dropdown — delegated 'change' on tbody
    //     Fires when admin picks a new role directly in the table row
    tbody?.addEventListener('change', handleRoleDropdownChange)
})

// ─── Load all members ─────────────────────────────────────────────────────────
async function loadMembers() {
    setStatus('Loading members…', 'info')
    try {
        allMembers = await profile.listMembers()
        renderTable(allMembers)
        setStatus('', '')
    } catch (err) {
        setStatus(`Error loading members: ${err.message}`, 'error')
    }
}

// ─── Render table rows ────────────────────────────────────────────────────────
/**
 * Injects <tr> rows into #admin-user-tbody.
 * Uses CSS classes from admin/index.html — no inline styles on buttons.
 * @param {Array} members
 */
function renderTable(members) {
    if (!tbody) return

    // Update member count badge
    if (countEl) countEl.textContent = `${members.length} member${members.length !== 1 ? 's' : ''}`

    if (members.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4">
                    <div class="empty-state">
                        <svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                            <circle cx="12" cy="8" r="4"/>
                            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                        </svg>
                        <p>No members found.</p>
                    </div>
                </td>
            </tr>`
        return
    }

    tbody.innerHTML = members.map(m => {
        const role = m.role ?? 'member'
        const isAdminUser = role === 'admin'

        // ── Visual differentiation for admin users ───────────────────────────
        // Admin rows get a subtle left accent border and a crown icon.
        // This is applied via inline style on the <tr> so no CSS changes needed.
        const rowStyle = isAdminUser
            ? 'border-left: 3px solid #f4831f;'
            : 'border-left: 3px solid transparent;'

        // Inline role <select> — replaces the static badge.
        // data-userid and data-original-role let handleRoleDropdownChange()
        // identify the user and detect actual changes.
        const roleSelect = `
            <select
                class="inline-role-select"
                data-userid="${m.id}"
                data-original-role="${escHtml(role)}"
                style="
                    padding:4px 10px;
                    border:1.5px solid ${isAdminUser ? '#f4831f' : 'var(--border, #e8e8e4)'};
                    border-radius:8px;
                    font-family:inherit;
                    font-size:.8rem;
                    font-weight:700;
                    background:${isAdminUser ? '#fff4ea' : '#f8f8f6'};
                    color:${isAdminUser ? '#f4831f' : '#4a4a4a'};
                    cursor:pointer;
                    outline:none;
                "
            >
                <option value="member" ${role === 'member' ? 'selected' : ''}>Member</option>
                <option value="admin"  ${role === 'admin'  ? 'selected' : ''}>👑 Admin</option>
            </select>
        `

        return `
            <tr data-userid="${m.id}" style="${rowStyle}">
                <td>
                    ${isAdminUser ? '<span title="Admin" style="margin-right:5px;">👑</span>' : ''}
                    <strong>${escHtml(m.full_name ?? '—')}</strong>
                </td>
                <td>${escHtml(m.city ?? '—')}</td>
                <td>${roleSelect}</td>
                <td>
                    <button class="btn-action btn-edit admin-edit-btn"
                        data-userid="${m.id}"
                        data-name="${escHtml(m.full_name ?? '')}"
                        data-role="${escHtml(role)}"
                    >✏️ Edit</button>
                    <button class="btn-action btn-remove admin-delete-btn"
                        data-userid="${m.id}"
                        data-name="${escHtml(m.full_name ?? '[user]')}"
                    >🗑 Remove</button>
                </td>
            </tr>
        `
    }).join('')
}

// ─── Table click delegation (attached once in DOMContentLoaded) ──────────────
function handleTableClick(e) {
    const editBtn = e.target.closest('.admin-edit-btn')
    const deleteBtn = e.target.closest('.admin-delete-btn')

    if (editBtn) openEditModal(editBtn.dataset)
    if (deleteBtn) handleDelete(deleteBtn.dataset)
}

// ─── Inline role dropdown change ──────────────────────────────────────────────
/**
 * Fires when admin picks a new role from the inline <select> in a table row.
 *
 * Flow:
 *   1. Detect which user's dropdown changed
 *   2. Ask for confirmation (role changes are significant)
 *   3. Call adminRoles.updateUserRole() → Supabase UPDATE via RLS
 *   4. On success: update in-memory store + visually refresh the row
 *   5. On failure: revert the dropdown to original role
 */
async function handleRoleDropdownChange(e) {
    const select = e.target.closest('.inline-role-select')
    if (!select) return

    const userId       = select.dataset.userid
    const originalRole = select.dataset.originalRole
    const newRole      = select.value

    // No-op if value didn't actually change
    if (newRole === originalRole) return

    // Find member name for the confirmation message
    const member = allMembers.find(m => m.id === userId)
    const name   = member?.full_name ?? 'this user'

    const verb = newRole === 'admin' ? 'promote to Admin' : 'demote to Member'
    const confirmed = window.confirm(
        `Are you sure you want to ${verb}\n"${name}"?\n\n` +
        `${newRole === 'admin'
            ? '⚠️ Admins have full access to this panel.'
            : 'They will lose admin access immediately.'}`
    )

    if (!confirmed) {
        // Revert dropdown visually without triggering change event again
        select.value = originalRole
        return
    }

    // Loading state: dim the dropdown
    select.disabled = true
    select.style.opacity = '0.5'
    setStatus(`Updating ${name}'s role…`, 'info')

    try {
        await adminRoles.updateUserRole(userId, newRole)

        // Update in-memory store so search filter stays accurate
        if (member) member.role = newRole

        // Update data-original-role so a second change works correctly
        select.dataset.originalRole = newRole

        // Re-style dropdown to reflect new role immediately
        const isNowAdmin = newRole === 'admin'
        select.style.borderColor  = isNowAdmin ? '#f4831f' : 'var(--border, #e8e8e4)'
        select.style.background   = isNowAdmin ? '#fff4ea' : '#f8f8f6'
        select.style.color        = isNowAdmin ? '#f4831f' : '#4a4a4a'

        // Update the crown icon + row accent on the parent <tr>
        const row = select.closest('tr')
        if (row) {
            row.style.borderLeft = isNowAdmin ? '3px solid #f4831f' : '3px solid transparent'
            const nameCell = row.querySelector('td:first-child')
            if (nameCell) {
                // Toggle crown prefix
                const strong = nameCell.querySelector('strong')
                const existingCrown = nameCell.querySelector('span[title="Admin"]')
                if (isNowAdmin && !existingCrown) {
                    const crown = document.createElement('span')
                    crown.title = 'Admin'
                    crown.style.marginRight = '5px'
                    crown.textContent = '👑'
                    nameCell.insertBefore(crown, strong)
                } else if (!isNowAdmin && existingCrown) {
                    existingCrown.remove()
                }
            }
        }

        setStatus(`✓ ${name} is now a ${newRole}.`, 'success')
    } catch (err) {
        // Revert to original role on failure
        select.value = originalRole
        setStatus(`Error: ${err.message}`, 'error')
    } finally {
        select.disabled = false
        select.style.opacity = '1'
    }
}

// ─── Edit modal ───────────────────────────────────────────────────────────────
function openEditModal({ userid, name, role }) {
    if (!modal) return

    // Populate modal fields from the row's data-* attrs — no re-fetch needed
    if (modalTitle) modalTitle.textContent = `Edit: ${name}`
    if (editUserId) editUserId.value = userid
    if (editName) editName.value = name
    if (editRole) editRole.value = role ?? 'member'

    modal.style.display = 'block'
}

function closeModal() {
    if (modal) modal.style.display = 'none'
}

async function handleEditSave(e) {
    e.preventDefault()
    const userId = editUserId?.value
    if (!userId) return

    setStatus('Saving…', 'info')
    try {
        await profile.adminUpdateUser(userId, {
            full_name: editName?.value.trim(),
            role: editRole?.value
        })

        // Update in-memory store so search filter stays accurate
        const idx = allMembers.findIndex(m => m.id === userId)
        if (idx !== -1) {
            allMembers[idx].full_name = editName?.value.trim()
            allMembers[idx].role = editRole?.value
        }

        closeModal()
        renderTable(allMembers)
        setStatus('✓ User updated.', 'success')
    } catch (err) {
        setStatus(`Error: ${err.message}`, 'error')
    }
}

// ─── Delete (soft) ────────────────────────────────────────────────────────────
async function handleDelete({ userid, name }) {
    const confirmed = window.confirm(
        `Remove ${name} from the community?\nThis will clear their profile data.`
    )
    if (!confirmed) return

    setStatus('Removing…', 'info')
    try {
        await profile.adminDeleteUser(userid)

        // Remove from in-memory store and re-render
        allMembers = allMembers.filter(m => m.id !== userid)
        renderTable(allMembers)
        setStatus(`✓ ${name} removed.`, 'success')
    } catch (err) {
        setStatus(`Error: ${err.message}`, 'error')
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function setStatus(message, type = 'info') {
    if (!statusEl) return
    statusEl.textContent = message
    statusEl.className = `admin-status-${type}`
}

/** Prevents XSS when injecting user-supplied strings into innerHTML */
function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

// ═══════════════════════════════════════════════════════════════════════════
// INVITE SECTION
// ═══════════════════════════════════════════════════════════════════════════

// ─── Open / Close invite modal ────────────────────────────────────────────────
function openInviteModal() {
    if (!inviteModal) return
    inviteForm?.reset()
    if (inviteUrlWrap) inviteUrlWrap.style.display = 'none'
    if (inviteModalStatus) inviteModalStatus.textContent = ''
    inviteModal.style.display = 'flex'
}

function closeInviteModal() {
    if (inviteModal) inviteModal.style.display = 'none'
}

// ─── Send invite ──────────────────────────────────────────────────────────────
async function handleInviteSend(e) {
    e.preventDefault()

    const email = inviteEmailEl?.value.trim()
    const role  = inviteRoleEl?.value ?? 'member'

    if (!email) return
    setInviteModalStatus('Sending invite…', 'info')

    try {
        const { inviteUrl } = await invites.createInvite(email, role)

        // Show the generated link in the modal for manual sharing
        if (inviteUrlInput) inviteUrlInput.value = inviteUrl
        if (inviteUrlWrap)  inviteUrlWrap.style.display = 'block'

        setInviteModalStatus(`✓ Invite created for ${email}. Share the link below.`, 'success')
        inviteForm?.reset()

        // Refresh the invite list
        await loadInvites()
    } catch (err) {
        setInviteModalStatus(`Error: ${err.message}`, 'error')
    }
}

function setInviteModalStatus(msg, type = 'info') {
    if (!inviteModalStatus) return
    inviteModalStatus.textContent = msg
    const colors = { info: '#1976d2', success: '#2e7d32', error: '#e53935' }
    inviteModalStatus.style.color = colors[type] ?? '#666'
}

// ─── Load and render invite list ──────────────────────────────────────────────
async function loadInvites() {
    if (!inviteTbody) return

    try {
        const list = await invites.listInvites()
        renderInviteTable(list)
    } catch (err) {
        if (inviteTbody) {
            inviteTbody.innerHTML = `<tr><td colspan="5" style="padding:16px;color:#e53935;">Error loading invites: ${escHtml(err.message)}</td></tr>`
        }
    }
}

function renderInviteTable(list) {
    if (!inviteTbody) return

    if (list.length === 0) {
        inviteTbody.innerHTML = `<tr><td colspan="5" style="padding:20px;color:#999;text-align:center;">No invites sent yet.</td></tr>`
        return
    }

    const statusColors = {
        pending:  { bg: '#e3f0ff', color: '#1976d2' },
        accepted: { bg: '#e8f5e9', color: '#2e7d32' },
        expired:  { bg: '#f5f5f5', color: '#999' }
    }

    inviteTbody.innerHTML = list.map(inv => {
        const sc = statusColors[inv.status] ?? statusColors.expired
        const expires = inv.expires_at
            ? new Date(inv.expires_at).toLocaleDateString()
            : '—'
        const revokeBtn = inv.status === 'pending'
            ? `<button class="btn-action btn-remove invite-revoke-btn" data-inviteid="${inv.id}" style="font-size:.75rem;padding:4px 10px;">Revoke</button>`
            : '—'

        return `
            <tr>
                <td style="padding:12px 20px;border-bottom:1px solid #f0f0ed;font-size:.9rem;">${escHtml(inv.email)}</td>
                <td style="padding:12px 20px;border-bottom:1px solid #f0f0ed;">
                    <span class="role-badge role-${escHtml(inv.role)}">${escHtml(inv.role)}</span>
                </td>
                <td style="padding:12px 20px;border-bottom:1px solid #f0f0ed;">
                    <span style="background:${sc.bg};color:${sc.color};padding:3px 10px;border-radius:50px;font-size:.72rem;font-weight:700;text-transform:uppercase;">${escHtml(inv.status)}</span>
                </td>
                <td style="padding:12px 20px;border-bottom:1px solid #f0f0ed;font-size:.85rem;color:#7a7a7a;">${expires}</td>
                <td style="padding:12px 20px;border-bottom:1px solid #f0f0ed;">${revokeBtn}</td>
            </tr>
        `
    }).join('')

    // Delegated revoke clicks on the invite tbody
    inviteTbody.addEventListener('click', async (e) => {
        const btn = e.target.closest('.invite-revoke-btn')
        if (!btn) return

        const inviteId = btn.dataset.inviteid
        if (!inviteId) return
        if (!confirm('Revoke this invite? The link will stop working.')) return

        btn.textContent = 'Revoking…'
        btn.disabled = true

        try {
            await invites.revokeInvite(inviteId)
            await loadInvites()
            setStatus('✓ Invite revoked.', 'success')
        } catch (err) {
            setStatus(`Error: ${err.message}`, 'error')
            btn.textContent = 'Revoke'
            btn.disabled = false
        }
    })
}

