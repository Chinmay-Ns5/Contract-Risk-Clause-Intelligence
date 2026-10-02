-- Phase 3: Sample/test data
USE contract_risk_db;

INSERT INTO roles (role_name) VALUES ('Admin'), ('Reviewer'), ('Viewer');

INSERT INTO users (name, email, password_hash, role_id)
VALUES ('Alice Admin', 'alice@test.com', 'hashed_pw_1', 1),
       ('Bob Reviewer', 'bob@test.com', 'hashed_pw_2', 2);

INSERT INTO risk_categories (category_name)
VALUES ('Liability'), ('Indemnity'), ('Termination'), ('Automatic Renewal');

INSERT INTO contracts (title, uploaded_by, file_path, status)
VALUES ('Vendor Supply Agreement', 1, '/uploads/vendor_agreement.pdf', 'pending');

INSERT INTO parties (party_name, party_type)
VALUES ('Acme Supplies Ltd', 'Vendor'), ('Beta Corp', 'Client');

INSERT INTO contract_parties (contract_id, party_id, role_in_contract)
VALUES (1, 1, 'Seller'), (1, 2, 'Buyer');

INSERT INTO clauses (contract_id, clause_text, clause_order)
VALUES (1, 'The supplier shall indemnify the customer against all claims arising from product defects.', 1);
