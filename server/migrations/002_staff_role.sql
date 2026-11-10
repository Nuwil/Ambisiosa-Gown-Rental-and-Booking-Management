-- Single-owner model: one admin, one owner, many staff (who belong to the owner's shop), many renters.
ALTER TABLE users MODIFY role ENUM('admin','owner','staff','renter') NOT NULL;
ALTER TABLE users
  ADD COLUMN owner_id BIGINT UNSIGNED NULL AFTER role,
  ADD INDEX idx_users_owner (owner_id),
  ADD CONSTRAINT fk_users_owner FOREIGN KEY (owner_id) REFERENCES users(id);
