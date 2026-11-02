-- Review 2: Read-only transaction demonstration
-- Database: contract_risk_db (MySQL 8.4)
-- This script runs related reports in one consistent, read-only transaction.
-- It contains no INSERT, UPDATE, or DELETE statements.

USE contract_risk_db;

-- Set the isolation level for the next transaction only. Under InnoDB,
-- REPEATABLE READ keeps consistent reads in this transaction on one snapshot.
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;

-- Start a read-only transaction and request the consistent snapshot at its start.
START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;

-- Report 1: One row per contract with clause and risk-flag counts.
-- Expected output: contract details and counts, including zero counts where
-- a contract has no clauses or risk flags.
SELECT
  c.contract_id,
  c.title,
  c.status,
  c.expiry_date,
  COUNT(DISTINCT cl.clause_id) AS clause_count,
  COUNT(rf.flag_id) AS risk_flag_count,
  SUM(
    CASE
      WHEN rf.flag_id IS NOT NULL AND rf.reviewed = FALSE THEN 1
      ELSE 0
    END
  ) AS unreviewed_flag_count
FROM contracts AS c
LEFT JOIN clauses AS cl
  ON cl.contract_id = c.contract_id
LEFT JOIN risk_flags AS rf
  ON rf.clause_id = cl.clause_id
GROUP BY
  c.contract_id,
  c.title,
  c.status,
  c.expiry_date
ORDER BY c.title, c.contract_id;

-- Report 2: Upcoming pending obligations and deadlines.
-- Expected output: one row per matching event dated today or later. An empty
-- result set means there are no events matching those conditions.
SELECT
  c.contract_id,
  c.title,
  'Obligation' AS event_type,
  o.description AS event_description,
  o.due_date AS event_date,
  CAST(NULL AS UNSIGNED) AS notified
FROM obligations AS o
JOIN contracts AS c
  ON c.contract_id = o.contract_id
WHERE o.status = 'pending'
  AND o.due_date >= CURRENT_DATE

UNION ALL

SELECT
  c.contract_id,
  c.title,
  'Deadline' AS event_type,
  d.deadline_type AS event_description,
  d.deadline_date AS event_date,
  d.notified
FROM deadlines AS d
JOIN contracts AS c
  ON c.contract_id = d.contract_id
WHERE d.deadline_date >= CURRENT_DATE
ORDER BY event_date, title, event_type;

-- End the read-only transaction. No table records were changed.
COMMIT;
