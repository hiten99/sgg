import { supabase } from '../config/supabase.js'
import { isAdmin, getCurrentUser } from '../utils/auth-guard.js'

/**
 * EVENTS MODULE
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles all event CRUD operations and supports:
 *   - Pagination (cursor-based via range())
 *   - Sorting by date ASC or DESC
 *   - Status filtering (active, cancelled, draft)
 *   - Category filtering (future)
 *   - Full-text search (future)
 *
 * Scalability notes:
 *   - getEvents() never fetches all rows; always uses .range() for pagination
 *   - Indexes on event_date, status, category make filtered queries O(log n)
 *   - Admin writes go through RLS; no client-side role check bypasses are possible
 */

export const PAGE_SIZE = 12   // Cards per page — change to adjust density

export const events = {

    // ── READ ─────────────────────────────────────────────────────────────────

    /**
     * Fetch a page of events.
     *
     * @param {object} opts
     * @param {number}  opts.page      — 0-indexed page number (default 0)
     * @param {'asc'|'desc'} opts.sort — sort direction on event_date (default 'asc')
     * @param {string}  opts.status    — filter by status (default 'active')
     * @param {string}  opts.category  — filter by category (optional)
     * @param {string}  opts.search    — keyword search on title+description (optional)
     *
     * @returns {Promise<{ data: Array, count: number, hasMore: boolean }>}
     */
    async getEvents({
        page     = 0,
        sort     = 'asc',
        status   = 'active',
        category = '',
        search   = ''
    } = {}) {
        const from = page * PAGE_SIZE
        const to   = from + PAGE_SIZE - 1

        let query = supabase
            .from('events')
            .select('id, title, description, event_date, location, image_url, category, status, created_by', { count: 'exact' })
            .eq('status', status)
            .order('event_date', { ascending: sort === 'asc' })
            .range(from, to)

        if (category) query = query.eq('category', category)

        // Full-text search using Postgres tsvector (requires the GIN index)
        if (search.trim()) {
            query = query.textSearch('fts', search.trim(), {
                type: 'websearch',
                config: 'english'
            })
        }

        const { data, error, count } = await query

        if (error) throw error

        return {
            data:    data ?? [],
            count:   count ?? 0,
            hasMore: (from + PAGE_SIZE) < (count ?? 0)
        }
    },

    /**
     * Get a single event by id.
     * @param {string} eventId
     */
    async getEvent(eventId) {
        const { data, error } = await supabase
            .from('events')
            .select('*')
            .eq('id', eventId)
            .single()

        if (error) throw error
        return data
    },

    // ── ADMIN WRITE ───────────────────────────────────────────────────────────

    /**
     * Create a new event. Admin only (enforced by RLS + client guard).
     * @param {object} fields — { title, description, event_date, location, category, status }
     */
    async createEvent(fields) {
        if (!(await isAdmin())) throw new Error('Only admins can create events')

        const user = await getCurrentUser()

        const { data, error } = await supabase
            .from('events')
            .insert({
                title:       fields.title?.trim(),
                description: fields.description?.trim() ?? null,
                event_date:  fields.event_date,
                location:    fields.location?.trim() ?? null,
                image_url:   fields.image_url?.trim() ?? null,
                category:    fields.category?.trim() || 'general',
                status:      fields.status ?? 'active',
                created_by:  user?.id ?? null
            })
            .select()
            .single()

        if (error) throw error
        return data
    },

    /**
     * Update an existing event. Admin only.
     * @param {string} eventId
     * @param {object} fields — only changed fields needed
     */
    async updateEvent(eventId, fields) {
        if (!(await isAdmin())) throw new Error('Only admins can edit events')

        // Strip undefined fields so we do partial updates cleanly
        const payload = Object.fromEntries(
            Object.entries(fields).filter(([, v]) => v !== undefined)
        )

        const { data, error } = await supabase
            .from('events')
            .update(payload)
            .eq('id', eventId)
            .select()
            .single()

        if (error) throw error
        return data
    },

    /**
     * Delete an event permanently. Admin only.
     * @param {string} eventId
     */
    async deleteEvent(eventId) {
        if (!(await isAdmin())) throw new Error('Only admins can delete events')

        const { error } = await supabase
            .from('events')
            .delete()
            .eq('id', eventId)

        if (error) throw error
    },

    /**
     * Soft-cancel an event instead of deleting it.
     * Keeps history; sets status = 'cancelled'.
     * @param {string} eventId
     */
    async cancelEvent(eventId) {
        return this.updateEvent(eventId, { status: 'cancelled' })
    }
}
