-- 09_recursive_cte.sql
-- Recursive CTE examples (MySQL 8.4). Read-only: SELECT statements only.
-- The schema has no self-referencing (parent-child) table, so recursion is applied to
-- two natural sequences instead:
--   1. clauses.clause_order : clause n is followed by clause n+1 within a contract.
--   2. a date series        : monthly review checkpoints up to an expiry date.
-- Run with: mysql -u <user> -p contract_risk_db < 09_recursive_cte.sql

USE contract_risk_db;

-- Query 1: walk each contract's clauses in order, keeping a running total of risk flags.
-- Anchor member   : the first clause (lowest clause_order) of every contract.
-- Recursive member: the clause whose clause_order is previous + 1 in the same contract.
-- Expected output: one row per clause, ordered by contract then clause_order, with
-- cumulative_flags non-decreasing; the last clause's cumulative_flags equals that
-- contract's total flag count.
WITH RECURSIVE clause_flags AS (
  SELECT cl.clause_id, cl.contract_id, cl.clause_order,
         COUNT(rf.flag_id) AS flag_count
  FROM clauses AS cl
  LEFT JOIN risk_flags AS rf ON rf.clause_id = cl.clause_id
  GROUP BY cl.clause_id, cl.contract_id, cl.clause_order
),
clause_chain AS (
  SELECT cf.contract_id, cf.clause_id, cf.clause_order,
         cf.flag_count, cf.flag_count AS cumulative_flags
  FROM clause_flags AS cf
  WHERE cf.clause_order = (
    SELECT MIN(x.clause_order) FROM clauses AS x WHERE x.contract_id = cf.contract_id
  )
  UNION ALL
  SELECT cf.contract_id, cf.clause_id, cf.clause_order,
         cf.flag_count, ch.cumulative_flags + cf.flag_count
  FROM clause_chain AS ch
  JOIN clause_flags AS cf
    ON cf.contract_id = ch.contract_id
   AND cf.clause_order = ch.clause_order + 1
)
SELECT c.title, ch.clause_order, ch.clause_id, ch.flag_count, ch.cumulative_flags
FROM clause_chain AS ch
JOIN contracts AS c ON c.contract_id = ch.contract_id
ORDER BY ch.contract_id, ch.clause_order;

-- Query 2: monthly review checkpoints from a start date to an expiry date.
-- The date values are literal demo inputs (no contract currently has an expiry_date).
-- Expected output: 7 rows, checkpoint_no 1..7, dates 2027-01-15 .. 2027-07-15.
WITH RECURSIVE review_checkpoints AS (
  SELECT 1 AS checkpoint_no, DATE('2027-01-15') AS checkpoint_date
  UNION ALL
  SELECT checkpoint_no + 1, DATE_ADD(checkpoint_date, INTERVAL 1 MONTH)
  FROM review_checkpoints
  WHERE DATE_ADD(checkpoint_date, INTERVAL 1 MONTH) <= DATE('2027-07-15')
)
SELECT checkpoint_no, checkpoint_date FROM review_checkpoints;
