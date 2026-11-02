-- Review 2: Read-only stored procedure examples
-- Database: contract_risk_db (MySQL 8.4)
-- The procedures return result sets and do not insert, update, or delete rows.
-- CREATE PROCEDURE IF NOT EXISTS avoids replacing an existing routine definition.

USE contract_risk_db;

DELIMITER $$

-- Return clause and risk-flag counts for one contract.
CREATE PROCEDURE IF NOT EXISTS GetContractRiskSummary(IN p_contract_id INT)
READS SQL DATA
SQL SECURITY INVOKER
BEGIN
  SELECT
    c.contract_id,
    c.title,
    c.status,
    c.expiry_date,
    (
      SELECT COUNT(*)
      FROM clauses AS cl
      WHERE cl.contract_id = c.contract_id
    ) AS clause_count,
    (
      SELECT COUNT(*)
      FROM clauses AS cl
      JOIN risk_flags AS rf
        ON rf.clause_id = cl.clause_id
      WHERE cl.contract_id = c.contract_id
    ) AS risk_flag_count,
    (
      SELECT COUNT(*)
      FROM clauses AS cl
      JOIN risk_flags AS rf
        ON rf.clause_id = cl.clause_id
      WHERE cl.contract_id = c.contract_id
        AND rf.reviewed = FALSE
    ) AS unreviewed_flag_count
  FROM contracts AS c
  WHERE c.contract_id = p_contract_id;
END$$

-- Return today's or future pending obligations and deadlines for one contract.
CREATE PROCEDURE IF NOT EXISTS GetContractUpcomingItems(IN p_contract_id INT)
READS SQL DATA
SQL SECURITY INVOKER
BEGIN
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
  WHERE o.contract_id = p_contract_id
    AND o.status = 'pending'
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
  WHERE d.contract_id = p_contract_id
    AND d.deadline_date >= CURRENT_DATE
  ORDER BY event_date, event_type;
END$$

DELIMITER ;

-- Sample calls: replace 1 with an existing contract_id if needed.
-- The first CALL returns a contract summary result set.
CALL GetContractRiskSummary(1);

-- The second CALL returns future pending obligations and deadlines for that contract.
-- An empty result set means no items match the date and status filters.
CALL GetContractUpcomingItems(1);
