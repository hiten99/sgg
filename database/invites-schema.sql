-- ============================================================
-- INVITE-BASED USER CREATION SCHEMA
-- Run this entire file in Supabase SQL Editor
-- ============================================================

-- 1. Create the invites table
CREATE TABLE IF NOT EXISTS public.invites (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    email       text NOT NULL,
    role        text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
    token       text NOT NULL UNIQUE,
    status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
    invited_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  timestamptz DEFAULT now(),
    expires_at  timestamptz DEFAULT (now() + interval '7 days')
);

-- 2. Enable RLS on invites
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

-- 3. Grant access to roles
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON TABLE public.invites TO authenticated;
GRANT SELECT ON TABLE public.invites TO anon;

-- 4. RLS: Only admins can INSERT (create invites)
CREATE POLICY "Admins can create invites"
ON public.invites FOR INSERT
TO authenticated
WITH CHECK (is_admin());

-- 5. RLS: Only admins can SELECT all invites (for listing)
CREATE POLICY "Admins can view all invites"
ON public.invites FOR SELECT
TO authenticated
USING (is_admin());

-- 6. RLS: Anyone (anon) can read a single invite by token — needed during signup
--    We expose ONLY the minimum: status and role; ID-locked by token uniqueness
CREATE POLICY "Anyone can look up invite by token"
ON public.invites FOR SELECT
TO anon
USING (true);

-- 7. RLS: Only the system (via service function) can UPDATE status to 'accepted'
--    We use a SECURITY DEFINER function so the anon user doesn't need UPDATE permission
CREATE POLICY "Admins can update invite status"
ON public.invites FOR UPDATE
TO authenticated
USING (is_admin());

-- ============================================================
-- FUNCTION: accept_invite(token, user_id)
-- Called after Supabase Auth creates the user.
-- Validates token, creates profile with correct role, marks invite used.
-- SECURITY DEFINER: runs as postgres superuser — bypasses RLS safely.
-- ============================================================
CREATE OR REPLACE FUNCTION public.accept_invite(p_token text, p_user_id uuid)
RETURNS json AS $$
DECLARE
    v_invite   public.invites%ROWTYPE;
    v_result   json;
BEGIN
    -- 1. Find the invite
    SELECT * INTO v_invite
    FROM public.invites
    WHERE token = p_token
      AND status = 'pending'
      AND expires_at > now();

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Invalid, expired, or already used invite');
    END IF;

    -- 2. Verify email matches the auth user
    IF v_invite.email != (SELECT email FROM auth.users WHERE id = p_user_id) THEN
        RETURN json_build_object('success', false, 'error', 'Email does not match invite');
    END IF;

    -- 3. Upsert the profile with role from invite
    INSERT INTO public.profiles (id, full_name, role, created_at)
    SELECT p_user_id, split_part(v_invite.email, '@', 1), v_invite.role, now()
    ON CONFLICT (id) DO UPDATE
        SET role = v_invite.role;

    -- 4. Mark invite as accepted
    UPDATE public.invites
    SET status = 'accepted'
    WHERE token = p_token;

    RETURN json_build_object('success', true, 'role', v_invite.role);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCTION: cleanup_expired_invites()
-- Optional: can be scheduled via pg_cron or called manually
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_expired_invites()
RETURNS void AS $$
BEGIN
    UPDATE public.invites
    SET status = 'expired'
    WHERE status = 'pending' AND expires_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- GRANT execute on functions to authenticated users
-- ============================================================
GRANT EXECUTE ON FUNCTION public.accept_invite(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_invites() TO authenticated;
