-- Phase 3: Indexes for frequently queried columns
USE contract_risk_db;

CREATE INDEX idx_clauses_contract ON clauses(contract_id);
CREATE INDEX idx_riskflags_clause ON risk_flags(clause_id);
CREATE INDEX idx_deadlines_date ON deadlines(deadline_date);
