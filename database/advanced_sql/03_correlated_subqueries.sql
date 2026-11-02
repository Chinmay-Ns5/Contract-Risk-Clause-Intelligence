-- Review 2: Correlated subquery examples
-- Database: contract_risk_db (MySQL 8.4)
-- These are read-only reports. They do not insert, update, or delete data.

USE contract_risk_db;

-- Query 1: Find risk flags with a similarity score above the average of the
-- other scored flags in the same risk category.
-- The subquery is correlated because it refers to the current row's category_id
-- and flag_id from the outer risk_flags query.
-- Expected output: qualifying flags with their contract, clause, category, and
-- score details. A flag is omitted if it has no category, no score, or no other
-- scored flag in its category to compare against.
SELECT
  rf.flag_id,
  c.contract_id,
  c.title,
  cl.clause_id,
  rc.category_name,
  rf.similarity_score
FROM risk_flags AS rf
JOIN clauses AS cl
  ON cl.clause_id = rf.clause_id
JOIN contracts AS c
  ON c.contract_id = cl.contract_id
JOIN risk_categories AS rc
  ON rc.category_id = rf.category_id
WHERE rf.similarity_score IS NOT NULL
  AND rf.similarity_score > (
    SELECT AVG(rf2.similarity_score)
    FROM risk_flags AS rf2
    WHERE rf2.category_id = rf.category_id
      AND rf2.flag_id <> rf.flag_id
  )
ORDER BY rc.category_name, rf.similarity_score DESC, rf.flag_id;

-- Query 2: Find pending obligations due on the earliest pending due date for
-- their own contract.
-- The subquery is correlated because it matches the inner obligation rows to
-- the current outer row's contract_id. Contracts are therefore compared with
-- their own obligations rather than with obligations from other contracts.
-- Expected output: obligation details for the earliest pending due date per
-- contract. If multiple obligations share that date, all of them are returned.
SELECT
  c.contract_id,
  c.title,
  o.obligation_id,
  o.description,
  o.due_date,
  o.status
FROM obligations AS o
JOIN contracts AS c
  ON c.contract_id = o.contract_id
WHERE o.status = 'pending'
  AND o.due_date = (
    SELECT MIN(o2.due_date)
    FROM obligations AS o2
    WHERE o2.contract_id = o.contract_id
      AND o2.status = 'pending'
  )
ORDER BY c.title, o.due_date, o.obligation_id;
