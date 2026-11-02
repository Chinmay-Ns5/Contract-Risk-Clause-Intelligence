-- Review 2: Nested subquery examples
-- Database: contract_risk_db (MySQL 8.4)
-- These are read-only reports. They do not insert, update, or delete data.

USE contract_risk_db;

-- Query 1: Find contracts with clauses flagged in above-average risk categories.
-- The outer IN subquery finds contracts for matching clauses. Its nested IN
-- subquery finds categories whose flag count is greater than the average category
-- flag count; the innermost derived-table query calculates that average.
-- Categories with NULL category_id are excluded because they cannot be named as
-- a risk category. Each matching contract appears once.
-- Expected output: contract details for contracts with at least one clause flagged
-- in a category whose flag count is above the average across populated categories.
SELECT
  c.contract_id,
  c.title,
  c.status
FROM contracts AS c
WHERE c.contract_id IN (
  SELECT cl.contract_id
  FROM clauses AS cl
  WHERE cl.clause_id IN (
    SELECT rf.clause_id
    FROM risk_flags AS rf
    WHERE rf.category_id IN (
      SELECT category_flags.category_id
      FROM risk_flags AS category_flags
      WHERE category_flags.category_id IS NOT NULL
      GROUP BY category_flags.category_id
      HAVING COUNT(*) > (
        SELECT AVG(flag_counts.category_flag_count)
        FROM (
          SELECT COUNT(*) AS category_flag_count
          FROM risk_flags
          WHERE category_id IS NOT NULL
          GROUP BY category_id
        ) AS flag_counts
      )
    )
  )
)
ORDER BY c.title, c.contract_id;

-- Query 2: Find contracts with pending obligations due before the nearest future
-- deadline date recorded anywhere in the database.
-- The scalar subquery finds that nearest date; it is nested inside the IN subquery
-- that selects qualifying contract IDs. This uses the existing obligations and
-- deadlines relationships without changing either table.
-- Expected output: one row per qualifying contract. If no future deadline exists,
-- the scalar subquery returns NULL and this query returns no rows.
SELECT
  c.contract_id,
  c.title,
  c.status
FROM contracts AS c
WHERE c.contract_id IN (
  SELECT o.contract_id
  FROM obligations AS o
  WHERE o.status = 'pending'
    AND o.due_date < (
      SELECT MIN(d.deadline_date)
      FROM deadlines AS d
      WHERE d.deadline_date >= CURRENT_DATE
    )
)
ORDER BY c.title, c.contract_id;
