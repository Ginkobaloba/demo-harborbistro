-- Drop everything db/schema.sql creates, so it can be applied to a clean slate.
--
-- SEPARATE FROM schema.sql ON PURPOSE. schema.sql is a bootstrap a production
-- deploy runs; it must not carry DROP statements, or a stray re-apply becomes
-- a data-loss event. This file is for development and tests, which genuinely
-- want the slate wiped.
--
-- One list, one place: on axlepoint, adding `pristine` and then `ops` broke
-- every caller that carried its own hand-written DROP line, twice, with the
-- same "schema already exists" from a seed that had worked minutes earlier.
DROP SCHEMA IF EXISTS ops CASCADE;
DROP SCHEMA IF EXISTS pristine CASCADE;
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
