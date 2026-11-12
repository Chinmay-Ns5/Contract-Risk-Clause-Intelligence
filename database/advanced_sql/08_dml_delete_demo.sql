-- 08_dml_delete_demo.sql
-- Demonstrates the SQL DELETE statement safely.
-- Safety: all DELETEs run against a TEMPORARY table that exists only in this
-- session. No real application table (contracts, clauses, risk_flags, ...) is
-- modified. Real-table row counts are shown before and after as proof.
-- Run with: mysql -u <user> -p contract_risk_db < 08_dml_delete_demo.sql

-- Step 0: real-table counts BEFORE the demo.
SELECT 'BEFORE' AS stage,
       (SELECT COUNT(*) FROM contracts)  AS contracts,
       (SELECT COUNT(*) FROM clauses)    AS clauses,
       (SELECT COUNT(*) FROM risk_flags) AS risk_flags;

-- Step 1: isolated demo table (mirrors the shape of a risk flag).
DROP TEMPORARY TABLE IF EXISTS demo_delete_flags;
CREATE TEMPORARY TABLE demo_delete_flags (
  demo_flag_id INT PRIMARY KEY AUTO_INCREMENT,
  clause_ref   INT NOT NULL,
  reviewed     BOOLEAN DEFAULT FALSE,
  note         VARCHAR(100)
);

INSERT INTO demo_delete_flags (clause_ref, reviewed, note) VALUES
  (1, FALSE, 'unreviewed - will be deleted'),
  (1, TRUE,  'reviewed - kept'),
  (2, TRUE,  'reviewed - will be deleted via subquery'),
  (3, FALSE, 'unreviewed - kept');

-- Expected output: 4 rows.
SELECT 'Demo rows before DELETE' AS stage, COUNT(*) AS row_count FROM demo_delete_flags;

-- Step 2: simple DELETE with a WHERE clause (removes demo_flag_id = 1).
DELETE FROM demo_delete_flags WHERE demo_flag_id = 1;

-- Expected output: 0 rows with id 1; 3 rows remain.
SELECT 'Deleted id 1 still present?' AS stage, COUNT(*) AS row_count
FROM demo_delete_flags WHERE demo_flag_id = 1;
SELECT 'Demo rows after first DELETE' AS stage, COUNT(*) AS row_count FROM demo_delete_flags;

-- Step 3: DELETE driven by a subquery. The ids to remove come from a second
-- temporary table (MySQL cannot reference the same TEMPORARY table twice in
-- one statement).
DROP TEMPORARY TABLE IF EXISTS demo_obsolete_clauses;
CREATE TEMPORARY TABLE demo_obsolete_clauses (clause_ref INT PRIMARY KEY);
INSERT INTO demo_obsolete_clauses VALUES (2);

DELETE FROM demo_delete_flags
WHERE reviewed = TRUE
  AND clause_ref IN (SELECT clause_ref FROM demo_obsolete_clauses);

-- Expected output: 2 rows remain (ids 2 and 4).
SELECT demo_flag_id, clause_ref, reviewed, note FROM demo_delete_flags ORDER BY demo_flag_id;

-- Step 4: clean up the temporary table.
DROP TEMPORARY TABLE demo_delete_flags;
DROP TEMPORARY TABLE demo_obsolete_clauses;

-- Step 5: real-table counts AFTER the demo. Must equal the BEFORE row.
SELECT 'AFTER' AS stage,
       (SELECT COUNT(*) FROM contracts)  AS contracts,
       (SELECT COUNT(*) FROM clauses)    AS clauses,
       (SELECT COUNT(*) FROM risk_flags) AS risk_flags;
