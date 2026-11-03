-- Make verified bank evidence and audit logs append-only for the API service role.
REVOKE UPDATE, DELETE, TRUNCATE ON public.bank_deposit_evidence FROM service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON public.commerce_audit_events FROM service_role;
-- Purchase records remain editable only for controlled approval/rejection, not physically deleted.
REVOKE DELETE, TRUNCATE ON public.bank_transfer_requests FROM service_role;
-- Member contact details may be updated, but not deleted by ordinary server APIs.
REVOKE DELETE, TRUNCATE ON public.member_contacts FROM service_role;