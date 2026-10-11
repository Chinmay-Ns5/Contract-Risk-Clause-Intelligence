-- Phase 3: Core table creation for Contract Risk & Clause Intelligence Platform
USE contract_risk_db;

CREATE TABLE roles (
  role_id INT AUTO_INCREMENT PRIMARY KEY,
  role_name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(role_id)
);

CREATE TABLE contracts (
  contract_id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  uploaded_by INT,
  upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  file_path VARCHAR(500),
  status ENUM('pending','analyzed','reviewed') DEFAULT 'pending',
  expiry_date DATE,
  FOREIGN KEY (uploaded_by) REFERENCES users(user_id)
);

CREATE TABLE parties (
  party_id INT AUTO_INCREMENT PRIMARY KEY,
  party_name VARCHAR(255) NOT NULL,
  party_type VARCHAR(50)
);

CREATE TABLE contract_parties (
  contract_id INT,
  party_id INT,
  role_in_contract VARCHAR(50),
  PRIMARY KEY (contract_id, party_id),
  FOREIGN KEY (contract_id) REFERENCES contracts(contract_id) ON DELETE CASCADE,
  FOREIGN KEY (party_id) REFERENCES parties(party_id) ON DELETE CASCADE
);

CREATE TABLE risk_categories (
  category_id INT AUTO_INCREMENT PRIMARY KEY,
  category_name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE clauses (
  clause_id INT AUTO_INCREMENT PRIMARY KEY,
  contract_id INT NOT NULL,
  clause_text TEXT NOT NULL,
  clause_order INT,
  vector_id VARCHAR(100),
  FOREIGN KEY (contract_id) REFERENCES contracts(contract_id) ON DELETE CASCADE
);

CREATE TABLE risk_patterns (
  pattern_id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT,
  pattern_text TEXT NOT NULL,
  vector_id VARCHAR(100),
  FOREIGN KEY (category_id) REFERENCES risk_categories(category_id)
);

CREATE TABLE risk_flags (
  flag_id INT AUTO_INCREMENT PRIMARY KEY,
  clause_id INT NOT NULL,
  pattern_id INT NOT NULL,
  similarity_score DECIMAL(5,4),
  category_id INT,
  reviewed BOOLEAN DEFAULT FALSE,
  reviewer_id INT,
  flagged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (clause_id) REFERENCES clauses(clause_id) ON DELETE CASCADE,
  FOREIGN KEY (pattern_id) REFERENCES risk_patterns(pattern_id),
  FOREIGN KEY (category_id) REFERENCES risk_categories(category_id),
  FOREIGN KEY (reviewer_id) REFERENCES users(user_id)
);

CREATE TABLE obligations (
  obligation_id INT AUTO_INCREMENT PRIMARY KEY,
  contract_id INT NOT NULL,
  description TEXT,
  due_date DATE,
  status ENUM('pending','completed','overdue') DEFAULT 'pending',
  FOREIGN KEY (contract_id) REFERENCES contracts(contract_id) ON DELETE CASCADE
);

CREATE TABLE deadlines (
  deadline_id INT AUTO_INCREMENT PRIMARY KEY,
  contract_id INT NOT NULL,
  deadline_type VARCHAR(50),
  deadline_date DATE,
  notified BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (contract_id) REFERENCES contracts(contract_id) ON DELETE CASCADE
);
