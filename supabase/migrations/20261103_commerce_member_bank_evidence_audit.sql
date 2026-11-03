-- ChurchStudio commercial records, member contact, bank verification and auditable issuance.
-- Requires preceding 20261103_bank_transfer_licenses_two_device_limit.sql migration.
-- Bank transfer proof is server-entered based on a real bank ledger; NOT automatic bank integration.

ALTER TABLE public.bank_transfer_requests
 ADD COLUMN IF NOT EXISTS order_number text,
 ADD COLUMN IF NOT EXISTS product_code text NOT NULL DEFAULT 'CS_PERPETUAL_2',
 ADD COLUMN IF NOT EXISTS product_name text NOT NULL DEFAULT 'ChurchStudio 영구 사용권 (컴퓨터 2대)',
 ADD COLUMN IF NOT EXISTS review_note text;
UPDATE public.bank_transfer_requests
 SET order_number='CSO-'||to_char(created_at AT TIME ZONE 'Asia/Seoul','YYYYMMDD')||'-'||upper(left(replace(id::text,'-',''),10))
 WHERE order_number IS NULL;
ALTER TABLE public.bank_transfer_requests
 ALTER COLUMN order_number SET DEFAULT 'CSO-'||to_char(now() AT TIME ZONE 'Asia/Seoul','YYYYMMDD')||'-'||upper(left(replace(gen_random_uuid()::text,'-',''),10)),
 ALTER COLUMN order_number SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bank_transfer_requests_order_number_key ON public.bank_transfer_requests(order_number);

CREATE TABLE IF NOT EXISTS public.member_contacts (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 church_name text NOT NULL CHECK(char_length(btrim(church_name)) BETWEEN 2 AND 120),
 contact_name text CHECK(contact_name IS NULL OR char_length(btrim(contact_name)) BETWEEN 2 AND 80),
 phone text CHECK(phone IS NULL OR char_length(btrim(phone)) BETWEEN 8 AND 24),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.member_contacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_contacts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.member_contacts TO service_role;

CREATE TABLE IF NOT EXISTS public.bank_deposit_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL UNIQUE REFERENCES public.bank_transfer_requests(id) ON DELETE RESTRICT,
 bank_name text NOT NULL CHECK(char_length(btrim(bank_name)) BETWEEN 2 AND 50),
 transaction_reference text NOT NULL CHECK(char_length(btrim(transaction_reference)) BETWEEN 4 AND 120),
 bank_depositor_name text NOT NULL CHECK(char_length(btrim(bank_depositor_name)) BETWEEN 2 AND 80),
 bank_amount_krw integer NOT NULL CHECK(bank_amount_krw > 0),
 bank_deposited_at timestamptz NOT NULL,
 verification_note text CHECK(verification_note IS NULL OR char_length(verification_note) <= 1000),
 confirmed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 confirmed_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bank_deposit_unique_transaction
 ON public.bank_deposit_evidence(lower(btrim(bank_name)),lower(btrim(transaction_reference)));
ALTER TABLE public.bank_deposit_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bank_deposit_evidence FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.bank_deposit_evidence TO service_role;

CREATE TABLE IF NOT EXISTS public.commerce_audit_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 request_id uuid REFERENCES public.bank_transfer_requests(id) ON DELETE RESTRICT,
 user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 license_id bigint REFERENCES public.licenses(id) ON DELETE SET NULL,
 actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 event_type text NOT NULL CHECK(event_type IN
  ('request_submitted','bank_verified','license_issued','request_rejected','license_blocked','license_reactivated')),
 detail jsonb NOT NULL DEFAULT '{}'::jsonb,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commerce_audit_user_date_idx ON public.commerce_audit_events(user_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS commerce_audit_order_date_idx ON public.commerce_audit_events(request_id,occurred_at DESC);
ALTER TABLE public.commerce_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commerce_audit_events FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.commerce_audit_events TO service_role;

CREATE OR REPLACE FUNCTION public.log_bank_request_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 INSERT INTO public.commerce_audit_events(request_id,user_id,actor_user_id,event_type,detail)
 VALUES(NEW.id,NEW.user_id,NEW.user_id,'request_submitted',
        jsonb_build_object('order_number',NEW.order_number,'amount_claimed',NEW.amount_krw));
 RETURN NEW;
END;
$function$

REVOKE ALL ON FUNCTION public.log_bank_request_created() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS bank_transfer_requests_audit_insert ON public.bank_transfer_requests;
CREATE TRIGGER bank_transfer_requests_audit_insert AFTER INSERT ON public.bank_transfer_requests
 FOR EACH ROW EXECUTE FUNCTION public.log_bank_request_created();

CREATE OR REPLACE FUNCTION public.approve_bank_transfer_request(p_request_id uuid, p_admin_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN RAISE EXCEPTION 'BANK_EVIDENCE_REQUIRED'; END;
$function$

REVOKE ALL ON FUNCTION public.approve_bank_transfer_request(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.approve_bank_transfer_with_evidence(p_request_id uuid, p_admin_id uuid, p_bank_name text, p_transaction_reference text, p_bank_depositor_name text, p_bank_amount_krw integer, p_bank_deposited_at timestamp with time zone, p_verification_note text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_request public.bank_transfer_requests%rowtype;
 v_lic bigint;
 v_salt text;
 v_key text;
 v_name_mismatch boolean;
 v_day_mismatch boolean;
 v_note text := nullif(btrim(p_verification_note),'');
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=p_admin_id AND role='admin') THEN
   RAISE EXCEPTION 'ACCESS_DENIED';
 END IF;
 IF char_length(btrim(coalesce(p_bank_name,''))) NOT BETWEEN 2 AND 50 OR
    char_length(btrim(coalesce(p_transaction_reference,''))) NOT BETWEEN 4 AND 120 OR
    char_length(btrim(coalesce(p_bank_depositor_name,''))) NOT BETWEEN 2 AND 80 OR
    p_bank_deposited_at IS NULL THEN
   RAISE EXCEPTION 'INVALID_BANK_PROOF';
 END IF;
 SELECT * INTO v_request FROM public.bank_transfer_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
 IF v_request.status <> 'pending' THEN RAISE EXCEPTION 'ORDER_ALREADY_PROCESSED'; END IF;
 IF p_bank_amount_krw <> v_request.amount_krw THEN
   RAISE EXCEPTION 'BANK_AMOUNT_MISMATCH';
 END IF;
 v_name_mismatch := regexp_replace(lower(btrim(p_bank_depositor_name)), '[[:space:]]+', '', 'g') <>
                    regexp_replace(lower(btrim(v_request.depositor_name)), '[[:space:]]+', '', 'g');
 v_day_mismatch := (p_bank_deposited_at AT TIME ZONE 'Asia/Seoul')::date <> v_request.deposited_on;
 IF (v_name_mismatch OR v_day_mismatch) AND char_length(coalesce(v_note,'')) < 10 THEN
   RAISE EXCEPTION 'BANK_MISMATCH_REASON_REQUIRED';
 END IF;
 IF exists(SELECT 1 FROM public.licenses
           WHERE user_id=v_request.user_id AND status='active') THEN
   RAISE EXCEPTION 'MEMBER_ALREADY_LICENSED';
 END IF;
 -- Unique evidence prevents the same bank transaction from being reused for two orders.
 INSERT INTO public.bank_deposit_evidence
  (request_id,bank_name,transaction_reference,bank_depositor_name,bank_amount_krw,
   bank_deposited_at,verification_note,confirmed_by)
 VALUES(p_request_id,btrim(p_bank_name),btrim(p_transaction_reference),btrim(p_bank_depositor_name),
        p_bank_amount_krw,p_bank_deposited_at,v_note,p_admin_id);

 v_salt:=upper(replace(gen_random_uuid()::text,'-',''));
 v_key:='CS-'||substr(v_salt,1,6)||'-'||substr(v_salt,7,6)||'-'||substr(v_salt,13,6);
 INSERT INTO public.licenses(license_key,user_id,status,max_devices,expires_at,memo)
 VALUES(v_key,v_request.user_id,'active',2,NULL,'입금증빙 확인 후 발급한 영구 라이선스')
 RETURNING id INTO v_lic;
 UPDATE public.bank_transfer_requests
 SET status='approved',reviewed_by=p_admin_id,reviewed_at=now(),license_id=v_lic,
     review_note=v_note,updated_at=now()
 WHERE id=p_request_id;
 INSERT INTO public.commerce_audit_events(request_id,user_id,actor_user_id,event_type,detail)
 VALUES(p_request_id,v_request.user_id,p_admin_id,'bank_verified',
        jsonb_build_object('bank_name',btrim(p_bank_name),'reference',btrim(p_transaction_reference),
                           'actual_amount',p_bank_amount_krw,'name_mismatch',v_name_mismatch,'date_mismatch',v_day_mismatch));
 INSERT INTO public.commerce_audit_events(request_id,user_id,actor_user_id,license_id,event_type,detail)
 VALUES(p_request_id,v_request.user_id,p_admin_id,v_lic,'license_issued',
        jsonb_build_object('max_devices',2,'expires_at',NULL));
 RETURN v_lic;
END;
$function$

REVOKE ALL ON FUNCTION public.approve_bank_transfer_with_evidence(uuid,uuid,text,text,text,integer,timestamptz,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.approve_bank_transfer_with_evidence(uuid,uuid,text,text,text,integer,timestamptz,text) TO service_role;
CREATE OR REPLACE FUNCTION public.reject_bank_transfer_with_reason(p_request_id uuid, p_admin_id uuid, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_user uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=p_admin_id AND role='admin') THEN
   RAISE EXCEPTION 'ACCESS_DENIED';
 END IF;
 IF char_length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 500 THEN
   RAISE EXCEPTION 'REJECTION_REASON_REQUIRED';
 END IF;
 UPDATE public.bank_transfer_requests
 SET status='rejected',reviewed_by=p_admin_id,reviewed_at=now(),
     review_note=btrim(p_reason),updated_at=now()
 WHERE id=p_request_id AND status='pending'
 RETURNING user_id INTO v_user;
 IF v_user IS NULL THEN RAISE EXCEPTION 'ORDER_ALREADY_PROCESSED'; END IF;
 INSERT INTO public.commerce_audit_events(request_id,user_id,actor_user_id,event_type,detail)
 VALUES(p_request_id,v_user,p_admin_id,'request_rejected',jsonb_build_object('reason',btrim(p_reason)));
 RETURN true;
END;
$function$

REVOKE ALL ON FUNCTION public.reject_bank_transfer_with_reason(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reject_bank_transfer_with_reason(uuid,uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.set_member_license_status(p_license_id bigint, p_admin_id uuid, p_new_status text, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_old text; v_user uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=p_admin_id AND role='admin') THEN
   RAISE EXCEPTION 'ACCESS_DENIED';
 END IF;
 IF p_new_status NOT IN ('blocked','active') OR
    char_length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 500 THEN
   RAISE EXCEPTION 'INVALID_STATUS_OR_REASON';
 END IF;
 SELECT status,user_id INTO v_old,v_user FROM public.licenses WHERE id=p_license_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'LICENSE_NOT_FOUND'; END IF;
 IF v_old = p_new_status THEN RAISE EXCEPTION 'NO_STATUS_CHANGE'; END IF;
 IF p_new_status='active' AND v_user IS NOT NULL AND EXISTS(
   SELECT 1 FROM public.licenses WHERE user_id=v_user AND status='active' AND id<>p_license_id
 ) THEN RAISE EXCEPTION 'MEMBER_ALREADY_LICENSED'; END IF;
 UPDATE public.licenses SET status=p_new_status,updated_at=now() WHERE id=p_license_id;
 INSERT INTO public.commerce_audit_events(user_id,actor_user_id,license_id,event_type,detail)
 VALUES(v_user,p_admin_id,p_license_id,
        CASE WHEN p_new_status='blocked' THEN 'license_blocked' ELSE 'license_reactivated' END,
        jsonb_build_object('reason',btrim(p_reason),'prior_status',v_old));
 RETURN true;
END;
$function$

REVOKE ALL ON FUNCTION public.set_member_license_status(bigint,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_member_license_status(bigint,uuid,text,text) TO service_role;
