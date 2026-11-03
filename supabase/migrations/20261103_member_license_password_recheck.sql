-- 2026-11-03: Reveal member license keys only after password re-verification.
-- Edge Function: supabase/functions/reveal-license-key/index.ts
-- Keep the license key out of authenticated users' ordinary REST SELECT grants.
REVOKE SELECT ON TABLE public.licenses FROM authenticated;
GRANT SELECT (id, status, issued_at, last_checked_at, created_at, updated_at,
              user_id, max_devices, expires_at) ON TABLE public.licenses TO authenticated;

-- Do not let members insert or update their own role='admin'.
-- The privileged auth signup trigger is responsible for role assignment.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.profiles FROM authenticated;
GRANT INSERT (user_id, display_name) ON TABLE public.profiles TO authenticated;
GRANT UPDATE (display_name, updated_at) ON TABLE public.profiles TO authenticated;
