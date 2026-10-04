-- Phase 3: Sample/test data
USE contract_risk_db;

INSERT INTO roles (role_name) VALUES ('Admin'), ('Reviewer'), ('Viewer');

INSERT INTO users (name, email, password_hash, role_id)
SELECT 'Alice Admin', 'alice@test.com', '$2b$12$SYD9YA5qlzNM2jYUbRsVuODCx78Qm6iywBC/OXf7RFL0DNVQfLFme', role_id
FROM roles WHERE role_name = 'Admin';

INSERT INTO users (name, email, password_hash, role_id)
SELECT 'Bob Reviewer', 'bob@test.com', '$2b$12$6SUQ.5P.zWZZx5/RkfSNzOt.o20Fq2XYU2nM4SplpBwJZew9NSn56', role_id
FROM roles WHERE role_name = 'Reviewer';

INSERT INTO users (name, email, password_hash, role_id)
SELECT 'Casey Viewer', 'casey@test.com', '$2b$12$UvHMVELUoVCxJ8qd7MqzEe5m8GP2Tqr3X2n.Q60uJtzkZjiQPwl8W', role_id
FROM roles WHERE role_name = 'Viewer';

INSERT INTO risk_categories (category_name)
VALUES ('Liability'), ('Indemnity'), ('Termination'), ('Automatic Renewal');

INSERT INTO risk_patterns (category_id, pattern_text)
SELECT category_id, 'The supplier shall be liable for all direct, indirect, incidental, consequential, or special damages arising from the performance or breach of this agreement.'
FROM risk_categories
WHERE category_name = 'Liability';

INSERT INTO risk_patterns (category_id, pattern_text)
SELECT category_id, 'The supplier shall indemnify, defend, and hold harmless the customer from and against all claims, losses, damages, liabilities, costs, and expenses arising from the supplier''s acts, omissions, negligence, or breach of this agreement.'
FROM risk_categories
WHERE category_name = 'Indemnity';

INSERT INTO risk_patterns (category_id, pattern_text)
SELECT category_id, 'Either party may terminate this agreement upon written notice if the other party materially breaches its obligations and fails to cure such breach within the specified period.'
FROM risk_categories
WHERE category_name = 'Termination';

INSERT INTO risk_patterns (category_id, pattern_text)
SELECT category_id, 'This agreement shall automatically renew for successive renewal periods unless either party provides written notice of non-renewal before the end of the current term.'
FROM risk_categories
WHERE category_name = 'Automatic Renewal';

INSERT INTO contracts (title, uploaded_by, file_path, status)
VALUES ('Vendor Supply Agreement', 1, '/uploads/vendor_agreement.pdf', 'pending');

INSERT INTO parties (party_name, party_type)
VALUES ('Acme Supplies Ltd', 'Vendor'), ('Beta Corp', 'Client');

INSERT INTO contract_parties (contract_id, party_id, role_in_contract)
VALUES (1, 1, 'Seller'), (1, 2, 'Buyer');

INSERT INTO clauses (contract_id, clause_text, clause_order)
VALUES (1, 'The supplier shall indemnify the customer against all claims arising from product defects.', 1);
