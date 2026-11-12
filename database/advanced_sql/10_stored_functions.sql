-- 10_stored_functions.sql
-- Read-only stored functions for contract risk management (MySQL 8.4).
-- Functions only read data; they never insert, update or delete rows.
-- CREATE FUNCTION IF NOT EXISTS never replaces an existing routine.
-- Run with: mysql -u <user> -p contract_risk_db < 10_stored_functions.sql

USE contract_risk_db;

DELIMITER $$

-- fn_contract_risk_score: risk density = risk flags per clause, rounded to 2 decimals.
--   Unknown contract id or NULL input -> NULL
--   Contract with no clauses          -> 0.00
CREATE FUNCTION IF NOT EXISTS fn_contract_risk_score(p_contract_id INT)
RETURNS DECIMAL(8,2)
READS SQL DATA
SQL SECURITY INVOKER
BEGIN
  DECLARE v_clauses INT DEFAULT 0;
  DECLARE v_flags   INT DEFAULT 0;

  IF p_contract_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM contracts WHERE contract_id = p_contract_id) THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*) INTO v_clauses FROM clauses WHERE contract_id = p_contract_id;
  IF v_clauses = 0 THEN
    RETURN 0.00;
  END IF;

  SELECT COUNT(*) INTO v_flags
  FROM risk_flags AS rf
  JOIN clauses AS cl ON cl.clause_id = rf.clause_id
  WHERE cl.contract_id = p_contract_id;

  RETURN ROUND(v_flags / v_clauses, 2);
END$$

-- fn_risk_level: converts a risk score into a label.
--   NULL -> 'UNKNOWN'; 0 -> 'NONE'; <1 -> 'LOW'; <2 -> 'MEDIUM'; otherwise 'HIGH'
CREATE FUNCTION IF NOT EXISTS fn_risk_level(p_score DECIMAL(8,2))
RETURNS VARCHAR(10)
DETERMINISTIC
NO SQL
BEGIN
  IF p_score IS NULL THEN RETURN 'UNKNOWN'; END IF;
  IF p_score <= 0 THEN RETURN 'NONE'; END IF;
  IF p_score < 1 THEN RETURN 'LOW'; END IF;
  IF p_score < 2 THEN RETURN 'MEDIUM'; END IF;
  RETURN 'HIGH';
END$$

DELIMITER ;

-- Example calls.
-- Expected output (data at time of writing): contract 1 -> 3.00 HIGH,
-- contract 4 -> 2.08 HIGH, contract 999999 -> NULL UNKNOWN, NULL -> NULL UNKNOWN.
SELECT contract_id, title,
       fn_contract_risk_score(contract_id) AS risk_score,
       fn_risk_level(fn_contract_risk_score(contract_id)) AS risk_level
FROM contracts
ORDER BY contract_id;

SELECT fn_contract_risk_score(999999) AS missing_contract,
       fn_risk_level(fn_contract_risk_score(999999)) AS missing_level,
       fn_contract_risk_score(NULL) AS null_input;

-- Expected output: NONE, LOW, MEDIUM, HIGH.
SELECT fn_risk_level(0) AS s0, fn_risk_level(0.5) AS s05, fn_risk_level(1.5) AS s15, fn_risk_level(2) AS s2;
