-- Review 2: Contract risk summary view
-- Database: contract_risk_db (MySQL 8.4)
-- The view is read-only from this script and does not modify table records.
-- Plain CREATE VIEW is used so an existing view is never silently replaced.

USE contract_risk_db;

-- Create a reusable contract-level report with clause and risk-flag counts.
-- Expected output when queried: one row per contract, including contracts that
-- have no clauses or risk flags. Counts for those contracts are zero.
CREATE VIEW review2_contract_risk_summary_v AS
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
  c.expiry_date;

-- Sample query: inspect the contract risk summary through the view.
SELECT
  contract_id,
  title,
  status,
  expiry_date,
  clause_count,
  risk_flag_count,
  unreviewed_flag_count
FROM review2_contract_risk_summary_v
ORDER BY title, contract_id;
