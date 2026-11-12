-- 11_triggers.sql
-- Trigger: trg_risk_flags_review_guard (MySQL 8.4)
-- Business rules enforced at database level on risk_flags:
--   1. A flag cannot be marked reviewed without a reviewer_id.
--   2. A flag that is already reviewed cannot be switched back to unreviewed.
-- The trigger only validates the row being updated. It modifies no other record
-- and does not change the application's normal workflow: the PATCH
-- /api/risk-flags/[id] route always sets reviewed = TRUE together with reviewer_id.
-- CREATE TRIGGER IF NOT EXISTS never replaces an existing trigger.
-- Run with: mysql -u <user> -p contract_risk_db < 11_triggers.sql

USE contract_risk_db;

DELIMITER $$

CREATE TRIGGER IF NOT EXISTS trg_risk_flags_review_guard
BEFORE UPDATE ON risk_flags
FOR EACH ROW
BEGIN
  IF COALESCE(NEW.reviewed, 0) = 1 AND NEW.reviewer_id IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'A risk flag cannot be marked reviewed without a reviewer_id.';
  END IF;

  IF COALESCE(OLD.reviewed, 0) = 1 AND COALESCE(NEW.reviewed, 0) = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'A reviewed risk flag cannot be reverted to unreviewed.';
  END IF;
END$$

DELIMITER ;

-- Verify the trigger exists.
-- Expected output: one row, trg_risk_flags_review_guard, risk_flags, BEFORE, UPDATE.
SELECT TRIGGER_NAME, EVENT_OBJECT_TABLE, ACTION_TIMING, EVENT_MANIPULATION
FROM information_schema.TRIGGERS
WHERE TRIGGER_SCHEMA = 'contract_risk_db' AND TRIGGER_NAME = 'trg_risk_flags_review_guard';

-- Manual tests (run inside a transaction and ROLLBACK; replace :unreviewed_id with the
-- id of any unreviewed flag and :reviewer with an existing user_id):
--   START TRANSACTION;
--   UPDATE risk_flags SET reviewed = TRUE WHERE flag_id = :unreviewed_id;
--       -> ERROR 1644 (45000): ... without a reviewer_id        (rule 1 fires)
--   UPDATE risk_flags SET reviewed = TRUE, reviewer_id = :reviewer WHERE flag_id = :unreviewed_id;
--       -> 1 row changed                                        (valid update allowed)
--   UPDATE risk_flags SET reviewed = FALSE WHERE flag_id = :unreviewed_id;
--       -> ERROR 1644 (45000): ... cannot be reverted           (rule 2 fires)
--   ROLLBACK;
