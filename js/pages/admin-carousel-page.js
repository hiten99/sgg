import { supabase } from '../config/supabase.js'
import { requireAuth, isAdmin } from '../utils/auth-guard.js'

const form       = document.getElementById('carousel-upload-form')
const fileInput  = document.getElementById('carousel-image-file')
const altInput   = document.getElementById('carousel-image-alt')
const sortInput  = document.getElementById('carousel-image-sort')
const submitBtn  = document.getElementById('carousel-upload-btn')
const statusEl   = document.getElementById('admin-carousel-status')
const grid       = document.getElementById('carousel-grid')

document.addEventListener('DOMContentLoaded', async () => {
    await requireAuth()
    const isAdminUser = await isAdmin()
    if (!isAdminUser) {
        window.location.href = '/'
        return
    }

    await loadImages()

    form?.addEventListener('submit', handleUpload)
    grid?.addEventListener('click', handleGridAction)
})

async function loadImages() {
    setStatus('Loading images...', 'info')
    grid.innerHTML = '<p>Loading...</p>'

    try {
        const { data, error } = await supabase
            .from('hero_carousel')
            .select('*')
            .order('sort_order', { ascending: true })

        if (error) throw error

        if (!data || data.length === 0) {
            grid.innerHTML = '<p style="color:var(--text-soft); grid-column:1/-1;">No images uploaded yet. The homepage will use default images.</p>'
            setStatus('', '')
            return
        }

        grid.innerHTML = data.map(item => `
            <div class="carousel-item" data-id="${item.id}" data-url="${item.image_url}">
                <img src="${item.image_url}" alt="${item.alt_text ?? ''}">
                <div class="carousel-item-info">
                    <p style="font-size:0.85rem; font-weight:600; margin-bottom:0;">${escapeHtml(item.alt_text || 'No description')}</p>
                    <div class="carousel-item-actions">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <label style="font-size:0.75rem; color:var(--text-soft); font-weight:700;">ORDER:</label>
                            <input type="number" class="sort-input" value="${item.sort_order}" data-action="update-sort">
                        </div>
                        <button class="btn-delete" data-action="delete">Delete</button>
                    </div>
                </div>
            </div>
        `).join('')

        setStatus('', '')
    } catch (err) {
        setStatus(`Error loading images: ${err.message}`, 'error')
    }
}

async function handleUpload(e) {
    e.preventDefault()

    const file = fileInput.files[0]
    if (!file) return

    submitBtn.disabled = true
    submitBtn.textContent = 'Uploading...'
    setStatus('Uploading image...', 'info')

    try {
        // 1. Upload to Storage
        const fileExt = file.name.split('.').pop()
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
        const filePath = `carousel/${fileName}`

        const { error: uploadError } = await supabase.storage
            .from('public-images')
            .upload(filePath, file, { cacheControl: '3600', upsert: false })

        if (uploadError) throw uploadError

        // 2. Get Public URL
        const { data: { publicUrl } } = supabase.storage
            .from('public-images')
            .getPublicUrl(filePath)

        // 3. Insert into Database
        const { error: dbError } = await supabase
            .from('hero_carousel')
            .insert({
                image_url: publicUrl,
                alt_text: altInput.value.trim() || 'Community Hero',
                sort_order: parseInt(sortInput.value) || 0
            })

        if (dbError) throw dbError

        setStatus('Image uploaded successfully!', 'success')
        form.reset()
        sortInput.value = '0'
        await loadImages()

    } catch (err) {
        setStatus(`Upload failed: ${err.message}`, 'error')
    } finally {
        submitBtn.disabled = false
        submitBtn.textContent = 'Upload'
    }
}

async function handleGridAction(e) {
    const itemCard = e.target.closest('.carousel-item')
    if (!itemCard) return

    const id = itemCard.dataset.id
    const imageUrl = itemCard.dataset.url

    // Delete
    if (e.target.dataset.action === 'delete') {
        if (!confirm('Are you sure you want to delete this image?')) return
        
        try {
            setStatus('Deleting...', 'info')
            
            // Delete from Database
            const { error: dbError } = await supabase
                .from('hero_carousel')
                .delete()
                .eq('id', id)

            if (dbError) throw dbError

            // Try to delete from storage (extract file path from URL)
            const urlParts = imageUrl.split('/public-images/')
            if (urlParts.length === 2) {
                const filePath = urlParts[1]
                await supabase.storage.from('public-images').remove([filePath])
            }

            setStatus('Image deleted.', 'success')
            await loadImages()
        } catch (err) {
            setStatus(`Delete failed: ${err.message}`, 'error')
        }
    }

    // Update Sort Order
    if (e.target.dataset.action === 'update-sort') {
        e.target.addEventListener('change', async (ev) => {
            const newSort = parseInt(ev.target.value) || 0
            try {
                const { error } = await supabase
                    .from('hero_carousel')
                    .update({ sort_order: newSort })
                    .eq('id', id)
                if (error) throw error
                setStatus('Sort order updated.', 'success')
                // Wait briefly then reload to sort
                setTimeout(() => loadImages(), 500)
            } catch (err) {
                setStatus(`Update failed: ${err.message}`, 'error')
            }
        }, { once: true })
    }
}

function setStatus(msg, type) {
    statusEl.textContent = msg
    statusEl.className = `status-${type}`
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}
