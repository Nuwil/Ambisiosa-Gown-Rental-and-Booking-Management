CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role ENUM('admin','owner','renter') NOT NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(191) NOT NULL UNIQUE,
  phone VARCHAR(30) NULL,
  address VARCHAR(255) NULL,
  shop_name VARCHAR(150) NULL,
  password_hash VARCHAR(100) NOT NULL,
  status ENUM('active','inactive','suspended') NOT NULL DEFAULT 'active',
  theme ENUM('light','dark') NOT NULL DEFAULT 'light',
  is_seed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_role (role, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  owner_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  UNIQUE KEY uq_cat (owner_id, name),
  CONSTRAINT fk_cat_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_id BIGINT UNSIGNED NOT NULL,
  category_id INT NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT NULL,
  color VARCHAR(40) NULL,
  rental_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  purchase_price DECIMAL(10,2) NULL,
  condition_status ENUM('new','good','fair','needs_repair') NOT NULL DEFAULT 'good',
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  archived_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_items_owner (owner_id, archived_at),
  INDEX idx_items_pub (is_published, archived_at),
  CONSTRAINT fk_item_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_item_cat FOREIGN KEY (category_id) REFERENCES categories(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS item_variants (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  item_id BIGINT UNSIGNED NOT NULL,
  size VARCHAR(20) NOT NULL,
  total_quantity INT UNSIGNED NOT NULL DEFAULT 1,
  UNIQUE KEY uq_variant (item_id, size),
  CONSTRAINT fk_var_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS item_images (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  item_id BIGINT UNSIGNED NOT NULL,
  path VARCHAR(255) NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_img_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS customers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(30) NULL,
  email VARCHAR(191) NULL,
  address VARCHAR(255) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cust_user (owner_id, user_id),
  INDEX idx_cust_owner (owner_id, name),
  CONSTRAINT fk_cust_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cust_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS transactions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  type ENUM('rental','purchase') NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  start_date DATE NULL,
  expected_return DATE NULL,
  actual_return DATE NULL,
  amount DECIMAL(10,2) NOT NULL,
  status ENUM('pending','approved','active','completed','rejected','cancelled') NOT NULL DEFAULT 'pending',
  payment_status ENUM('unpaid','partial','paid','refunded') NOT NULL DEFAULT 'unpaid',
  notes TEXT NULL,
  is_seed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tx_avail (variant_id, type, status, start_date, expected_return),
  INDEX idx_tx_owner (owner_id, status, created_at),
  INDEX idx_tx_customer (customer_id, created_at),
  CONSTRAINT fk_tx_owner FOREIGN KEY (owner_id) REFERENCES users(id),
  CONSTRAINT fk_tx_cust FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_tx_var FOREIGN KEY (variant_id) REFERENCES item_variants(id),
  CONSTRAINT chk_tx_dates CHECK (type = 'purchase' OR (start_date IS NOT NULL AND expected_return IS NOT NULL AND expected_return >= start_date))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  transaction_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  method VARCHAR(30) NULL,
  paid_at DATETIME NOT NULL,
  recorded_by BIGINT UNSIGNED NOT NULL,
  CONSTRAINT fk_pay_tx FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  type VARCHAR(40) NOT NULL,
  message VARCHAR(255) NOT NULL,
  ref_id BIGINT UNSIGNED NULL,
  read_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notif_user (user_id, read_at, created_at),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_id BIGINT UNSIGNED NULL,
  target_user_id BIGINT UNSIGNED NULL,
  action VARCHAR(60) NOT NULL,
  description VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_log_time (created_at),
  INDEX idx_log_action (action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS backups (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL,
  size_bytes BIGINT NULL,
  status ENUM('running','success','failed') NOT NULL DEFAULT 'running',
  error VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
