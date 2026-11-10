-- Renter cart (server-side so it follows the renter across devices) + per-staff access roles.
CREATE TABLE IF NOT EXISTS cart_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  renter_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  type ENUM('rental','purchase') NOT NULL,
  quantity INT UNSIGNED NOT NULL DEFAULT 1,
  start_date DATE NULL,
  expected_return DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cart_line (renter_id, variant_id, type),
  CONSTRAINT fk_cart_renter FOREIGN KEY (renter_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cart_variant FOREIGN KEY (variant_id) REFERENCES item_variants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

ALTER TABLE users ADD COLUMN staff_permissions VARCHAR(60) NULL AFTER theme;
UPDATE users SET staff_permissions = 'inventory,customers,transactions' WHERE role = 'staff' AND staff_permissions IS NULL;
