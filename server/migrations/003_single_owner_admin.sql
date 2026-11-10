-- Hard guarantee for the single-owner model: at most one admin and one owner row can ever exist.
-- NULL for renter/staff (NULLs never collide in a UNIQUE index).
ALTER TABLE users
  ADD COLUMN singleton_role VARCHAR(10) AS (CASE WHEN role IN ('admin','owner') THEN role END) VIRTUAL,
  ADD UNIQUE KEY uq_single_admin_owner (singleton_role);
