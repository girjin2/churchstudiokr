-- ChurchStudio: bank transfer approvals, permanent licences and strict two-device limit.
-- Applied to Supabase project nodijpmukvclftlegyyu on 2026-11-03.
-- Existing site authorization still uses auth.users and public.profiles.
UPDATE public.licenses SET max_devices=2 WHERE max_devices <> 2;
ALTER TABLE public.licenses ALTER COLUMN max_devices SET DEFAULT 2;
ALTER TABLE public.licenses DROP CONSTRAINT IF EXISTS licenses_max_devices_check;
ALTER TABLE public.licenses ADD CONSTRAINT licenses_max_devices_check CHECK(max_devices=2);
CREATE UNIQUE INDEX IF NOT EXISTS licenses_one_active_per_user
 ON public.licenses(user_id) WHERE user_id IS NOT NULL AND status='active';

CREATE TABLE IF NOT EXISTS public.bank_transfer_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 church_name text NOT NULL CHECK(char_length(btrim(church_name)) BETWEEN 2 AND 120),
 depositor_name text NOT NULL CHECK(char_length(btrim(depositor_name)) BETWEEN 2 AND 80),
 amount_krw integer NOT NULL CHECK(amount_krw BETWEEN 1 AND 100000000),
 deposited_on date NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 license_id bigint UNIQUE REFERENCES public.licenses(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bank_transfer_requests_user_created_idx
 ON public.bank_transfer_requests(user_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS bank_transfer_requests_one_pending_per_user
 ON public.bank_transfer_requests(user_id) WHERE status='pending';
ALTER TABLE public.bank_transfer_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bank_transfer_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.bank_transfer_requests TO service_role;

CREATE OR REPLACE FUNCTION public.approve_bank_transfer_request(p_request_id uuid, p_admin_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_request public.bank_transfer_requests%rowtype;
  v_license_id bigint;
  v_random text;
  v_license_key text;
begin
  if not exists(select 1 from public.profiles where user_id=p_admin_id and role='admin') then
    raise exception 'ACCESS_DENIED';
  end if;

  select * into v_request from public.bank_transfer_requests
  where id=p_request_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_request.status <> 'pending' then raise exception 'ORDER_ALREADY_PROCESSED'; end if;
  if exists(select 1 from public.licenses where user_id=v_request.user_id and status='active') then
    raise exception 'MEMBER_ALREADY_LICENSED';
  end if;

  -- Preserve the desktop-compatible CS-XXXXXX-XXXXXX-XXXXXX key format.
  v_random := upper(replace(pg_catalog.gen_random_uuid()::text, '-', ''));
  v_license_key := 'CS-' || substr(v_random,1,6) || '-' ||
                   substr(v_random,7,6) || '-' || substr(v_random,13,6);

  insert into public.licenses (license_key,status,user_id,max_devices,expires_at,memo)
  values (v_license_key,'active',v_request.user_id,2,null,'입금확인 승인 · 영구 라이선스')
  returning id into v_license_id;

  update public.bank_transfer_requests set
    status='approved',reviewed_by=p_admin_id,reviewed_at=now(),
    license_id=v_license_id,updated_at=now()
  where id=v_request.id;

  return v_license_id;
end;
$function$

REVOKE ALL ON FUNCTION public.approve_bank_transfer_request(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.approve_bank_transfer_request(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.register_own_device(p_license_id bigint, p_device_fingerprint text, p_device_name text DEFAULT NULL::text, p_platform text DEFAULT NULL::text, p_app_version text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_max int;
  v_active_count int;
  v_device_id uuid;
  v_was_active boolean;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_device_fingerprint is null or char_length(btrim(p_device_fingerprint)) not between 1 and 256 then
    raise exception 'INVALID_DEVICE_FINGERPRINT';
  end if;

  -- Lock the license so concurrent registrations for the same key are serialized.
  select max_devices into v_max
    from public.licenses
   where id = p_license_id
     and user_id = (select auth.uid())
     and status = 'active'
     and (expires_at is null or expires_at > now())
   for update;
  if v_max is null then raise exception 'LICENSE_NOT_FOUND'; end if;

  select id, is_active into v_device_id, v_was_active from public.license_devices
   where license_id=p_license_id and device_fingerprint=p_device_fingerprint
   for update;

  if coalesce(v_was_active,false) = false then
    select count(*) into v_active_count from public.license_devices
     where license_id=p_license_id and is_active=true;
    if v_active_count >= 2 then raise exception 'DEVICE_LIMIT_REACHED'; end if;
  end if;

  if v_device_id is not null then
    update public.license_devices
       set user_id=(select auth.uid()), device_name=p_device_name, platform=p_platform,
           app_version=p_app_version, last_seen_at=now(), is_active=true, released_at=null
     where id=v_device_id;
    return v_device_id;
  end if;

  insert into public.license_devices
    (license_id,user_id,device_fingerprint,device_name,platform,app_version)
  values
    (p_license_id,(select auth.uid()),p_device_fingerprint,p_device_name,p_platform,p_app_version)
  returning id into v_device_id;
  return v_device_id;
end;
$function$

REVOKE ALL ON FUNCTION public.register_own_device(bigint,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.register_own_device(bigint,text,text,text,text) TO authenticated;

-- Note: The desktop client is NOT modified by this migration.
-- 14-day trial expiration must be enforced by a new desktop build.
