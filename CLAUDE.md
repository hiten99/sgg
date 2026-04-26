# CLAUDE.md — Indian Community Hub

This file gives AI assistants (Claude, Gemini, Copilot, etc.) full context about this project so they can help without repeated explanations.

---

## Project Overview

**Name**: Indian Community Hub (South Gujarat Group — SGG North America)  
**Type**: Static HTML/CSS/JS frontend + Supabase backend  
**Hosting**: GitHub Pages (`hiten99.github.io`)  
**Local Dev**: `python3 -m http.server 8080` (no Node required)  
**Supabase URL**: `https://ylfsanlkywggttpevusz.supabase.co`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML, CSS, ES6 Modules (no React, no build step) |
| Auth | Supabase Auth (email/password only, no OAuth) |
| Database | Supabase Postgres |
| Storage | Supabase Storage (for avatars — future) |
| Hosting | GitHub Pages (static) |
| Fonts | Plus Jakarta Sans (Google Fonts) |

> **No npm, no webpack, no bundler.** Supabase is loaded via CDN ESM import.

---

## Repository Structure

```
/ (root)
├── index.html               # Public landing page
├── CLAUDE.md                # This file
│
├── auth/
│   ├── login.html           # /auth/login.html
│   └── signup.html          # /auth/signup.html
│
├── profile/
│   └── index.html           # /profile/index.html — view/edit own profile
│
├── admin/
│   └── index.html           # /admin/index.html — admin user management (PROTECTED)
│
├── events/                  # (future) event listing & RSVP
├── directory/               # (future) member directory
│
├── components/
│   ├── header.html          # Main site nav (injected on public/member pages)
│   ├── admin-header.html    # Admin dark navbar (injected on admin/* pages)
│   └── footer.html          # Shared footer
│
├── assets/
│   ├── css/main.css         # Global design system (tokens, typography, layout)
│   └── img/
│
├── js/
│   ├── config/
│   │   └── supabase.js      # Singleton Supabase client — import this everywhere
│   │
│   ├── modules/             # Feature logic (NO DOM access here)
│   │   ├── auth.js          # signUp, login, logout, resetPassword
│   │   ├── profile.js       # getOwnProfile, saveOwnProfile, listMembers, adminUpdateUser, adminDeleteUser
│   │   └── events.js        # listEvents, getEventDetails, rsvpToEvent, checkUserRSVP
│   │
│   ├── utils/
│   │   └── auth-guard.js    # requireAuth(), getCurrentUser(), getCurrentUserProfile(), isAdmin()
│   │
│   ├── pages/               # Page-specific JS — binds DOM to modules
│   │   ├── auth-login.js    # Binds #login-form → auth.login()
│   │   ├── auth-signup.js   # Binds #signup-form → auth.signUp()
│   │   ├── profile-page.js  # Binds #profile-form → profile.saveOwnProfile()
│   │   └── admin-page.js    # Binds admin table/modal → profile admin methods
│   │
│   ├── main.js              # Runs on all PUBLIC pages: loads header/footer, auth state nav
│   └── admin-main.js        # Runs on all ADMIN pages: loads admin-header/footer, logout
│
└── images/                  # Community photos (existing)
```

---

## Architecture Rules

### 1. Modules never touch the DOM
Files in `js/modules/` are pure logic — they talk to Supabase only. They must never call `document.getElementById` or manipulate HTML.

### 2. Page bindings live in `js/pages/`
Each `*-page.js` file is responsible for one HTML page. It imports from modules, reads DOM by ID, and wires up event listeners.

### 3. IDs are the contract between HTML and JS
The HTML defines element IDs. The JS page binding reads them. **Never change an ID in HTML without updating the corresponding `js/pages/` file.**

### 4. Two entry points
- `js/main.js` — included on all public/member pages
- `js/admin-main.js` — included on all `admin/*` pages (loads admin-header, not regular header)

### 5. ES6 Modules via CDN
```html
<script type="module" src="/js/pages/auth-login.js"></script>
```
Paths starting with `/` are absolute from the repo root. This requires a proper web server (not `file://`).

---

## Supabase Database Schema

### `profiles` table
```sql
id          uuid  PRIMARY KEY REFERENCES auth.users(id)
full_name   text
phone       text
city        text
state       text
bio         text
avatar_url  text
role        text  DEFAULT 'member'   -- 'admin' | 'member' | 'deleted'
created_at  timestamptz DEFAULT now()
updated_at  timestamptz
```

### RLS Policies on `profiles`
| Policy | Command | Rule |
|---|---|---|
| Authenticated users can view profiles | SELECT | `true` (any logged-in user) |
| Users can insert own profile | INSERT | `auth.uid() = id` |
| Users can update own profile | UPDATE | `auth.uid() = id` |
| Admins can update all profiles | UPDATE | `is_admin()` (security definer function) |

### Key SQL Functions
```sql
-- Checks if current user has role = 'admin'
CREATE FUNCTION is_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$$ LANGUAGE sql SECURITY DEFINER;

-- Auto-creates profile row on signup
CREATE FUNCTION handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name)
  VALUES (new.id, new.raw_user_meta_data->>'full_name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Admin Detection

```js
// js/utils/auth-guard.js
export async function isAdmin() {
    const profile = await getCurrentUserProfile()
    return profile?.role === 'admin'
}
```

Used in `admin-page.js` to gate the entire page:
```js
const adminCheck = await isAdmin()
if (!adminCheck) {
    setStatus('⛔ Access denied.', 'error')
    return
}
```

To promote a user to admin manually (Supabase SQL Editor):
```sql
UPDATE profiles SET role = 'admin' WHERE id = (
  SELECT id FROM auth.users WHERE email = 'your@email.com'
);
```

---

## Key Element IDs (HTML ↔ JS Contract)

### Profile Page (`profile/index.html` ↔ `js/pages/profile-page.js`)
| ID | Type | Purpose |
|---|---|---|
| `#profile-form` | `<form>` | Submit listener |
| `#profile-full-name` | `<input>` | Full name |
| `#profile-phone` | `<input>` | Phone |
| `#profile-city` | `<input>` | City |
| `#profile-state` | `<input>` | State/Province |
| `#profile-bio` | `<textarea>` | Bio |
| `#profile-status` | any | Status messages |

### Admin Page (`admin/index.html` ↔ `js/pages/admin-page.js`)
| ID | Purpose |
|---|---|
| `#admin-status` | Status messages |
| `#admin-search-input` | Live search filter |
| `#admin-member-count` | Member count badge |
| `#admin-user-tbody` | JS injects `<tr>` rows here |
| `#admin-edit-modal` | Modal div (JS toggles `display`) |
| `#admin-modal-title` | Modal heading |
| `#admin-edit-userid` | Hidden input — stores user ID |
| `#admin-edit-fullname` | Edit name input |
| `#admin-edit-role` | Role `<select>` |
| `#admin-edit-save-btn` | Save button |
| `#admin-edit-cancel-btn` | Cancel button |

---

## Running Locally

```bash
cd /Users/HitendraRathod/Desktop/hiten99.github.io
python3 -m http.server 8080
```
Open: `http://localhost:8080`

> Note: Do NOT open HTML files directly via `file://` — ES6 module imports will be blocked by CORS.

---

## Common Gotchas

| Problem | Cause | Fix |
|---|---|---|
| `permission denied for table profiles` | RLS enabled, no GRANT | Run: `GRANT USAGE ON SCHEMA public TO authenticated; GRANT ALL ON TABLE profiles TO authenticated;` |
| `npx serve` fails with `libicui18n` error | Node 20.1.0 / Homebrew ICU version mismatch | Use `python3 -m http.server 8080` instead |
| Module not found | Opened via `file://` instead of server | Always use `http://localhost:8080` |
| Admin page shows "Access denied" | User `role` is not `admin` in DB | Run SQL: `UPDATE profiles SET role = 'admin' WHERE ...` |
| Trigger not creating profile row | Trigger was created after the user was registered | Manually INSERT into profiles |

---

## Future Features Planned

- [ ] Member Directory (`/directory/index.html`)
- [ ] Events listing + RSVP (`/events/index.html`)
- [ ] Event recordings (video links)
- [ ] Avatar upload (Supabase Storage)
- [ ] Admin: Create/manage events
- [ ] Migration to Next.js (folder structure is already compatible)
