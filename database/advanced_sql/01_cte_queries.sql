-- Review 2: Common Table Expression (CTE) examples
-- Database: contract_risk_db (MySQL 8.4)
-- These are read-only reports. They do not insert, update, or delete data.

USE contract_risk_db;

-- Query 1: Summarize clauses and risk flags for every contract.
-- The CTE gives the per-contract aggregates a name and keeps the final report
-- readable. LEFT JOINs preserve contracts even when they have no clauses or flags.
-- Expected output: one row per contract, with its status, expiry date, clause
-- count, total risk-flag count, and count of flags not yet reviewed.
WITH contract_clause_risks AS (
  SELECT
    cl.contract_id,
    COUNT(DISTINCT cl.clause_id) AS clause_count,
    COUNT(rf.flag_id) AS risk_flag_count,
    SUM(
      CASE
        WHEN rf.flag_id IS NOT NULL AND rf.reviewed = FALSE THEN 1
        ELSE 0
      END
    ) AS unreviewed_flag_count
  FROM clauses AS cl
  LEFT JOIN risk_flags AS rf
    ON rf.clause_id = cl.clause_id
  GROUP BY cl.contract_id
)
SELECT
  c.contract_id,
  c.title,
  c.status,
  c.expiry_date,
  COALESCE(ccr.clause_count, 0) AS clause_count,
  COALESCE(ccr.risk_flag_count, 0) AS risk_flag_count,
  COALESCE(ccr.unreviewed_flag_count, 0) AS unreviewed_flag_count
FROM contracts AS c
LEFT JOIN contract_clause_risks AS ccr
  ON ccr.contract_id = c.contract_id
ORDER BY c.title, c.contract_id;

-- Query 2: List future pending obligations and future contract deadlines.
-- Each CTE selects one event type; UNION ALL presents both types in one schedule.
-- Expected output: zero or more rows with the contract, event type, description,
-- date, and notification state (NULL for obligations, which have no notified column).
-- CURRENT_DATE includes events due today. Completed or overdue obligations are
-- excluded; deadlines are included when their date is today or later.
WITH upcoming_obligations AS (
  SELECT
    o.contract_id,
    'Obligation' AS event_type,
    o.description AS event_description,
    o.due_date AS event_date,
    CAST(NULL AS UNSIGNED) AS notified
  FROM obligations AS o
  WHERE o.status = 'pending'
    AND o.due_date >= CURRENT_DATE
),
upcoming_deadlines AS (
  SELECT
    d.contract_id,
    'Deadline' AS event_type,
    d.deadline_type AS event_description,
    d.deadline_date AS event_date,
    d.notified
  FROM deadlines AS d
  WHERE d.deadline_date >= CURRENT_DATE
),
upcoming_events AS (
  SELECT contract_id, event_type, event_description, event_date, notified
  FROM upcoming_obligations
  UNION ALL
  SELECT contract_id, event_type, event_description, event_date, notified
  FROM upcoming_deadlines
)
SELECT
  c.contract_id,
  c.title,
  ue.event_type,
  ue.event_description,
  ue.event_date,
  ue.notified
FROM upcoming_events AS ue
JOIN contracts AS c
  ON c.contract_id = ue.contract_id
ORDER BY ue.event_date, c.title, ue.event_type;
