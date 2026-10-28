-- Default schema grants can be broader than this ledger needs.
revoke all on operations.service_intake_requests from service_role;
grant select,insert on operations.service_intake_requests to service_role;
