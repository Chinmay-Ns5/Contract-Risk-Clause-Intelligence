// Direct database privilege test for the three application MySQL accounts.
// Connects through the same pool factory the web app uses (app/lib/db.js) and
// asks MySQL itself to allow or deny each statement.
//
// Every probe is non-mutating: INSERT ... SELECT ... WHERE 1=0, UPDATE/DELETE
// with an impossible WHERE, and DDL against non-existent objects. MySQL checks
// privileges before executing, so a denial proves the privilege is missing,
// while an allowed probe changes no rows.
//
// Usage:
//   node --env-file=.env.local --env-file=.env.mysql-accounts database/security/test_mysql_privileges.js

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { createAccountPool, getDb } from '../../app/lib/db.js';

const DENIED_ERRNOS = new Set([
  1044, // ER_DBACCESS_DENIED_ERROR
  1142, // ER_TABLEACCESS_DENIED_ERROR
  1143, // ER_COLUMNACCESS_DENIED_ERROR
  1227, // ER_SPECIFIC_ACCESS_DENIED_ERROR
  1370, // ER_PROCACCESS_DENIED_ERROR
  1410, // ER_CANT_CREATE_USER_WITH_GRANT
]);

const ACCOUNTS = {
  admin: { user: process.env.DB_ADMIN_USER || 'cri_admin', password: process.env.DB_ADMIN_PASSWORD, role: 'cri_admin_role' },
  reviewer: { user: process.env.DB_REVIEWER_USER || 'cri_reviewer', password: process.env.DB_REVIEWER_PASSWORD, role: 'cri_reviewer_role' },
  viewer: { user: process.env.DB_VIEWER_USER || 'cri_viewer', password: process.env.DB_VIEWER_PASSWORD, role: 'cri_viewer_role' },
};

// [description, sql, expected outcome per account: A = allowed, D = denied]
const PROBES = [
  ['SELECT contracts', 'SELECT contract_id FROM contracts LIMIT 1', { admin: 'A', reviewer: 'A', viewer: 'A' }],
  ['SELECT risk_flags', 'SELECT flag_id FROM risk_flags LIMIT 1', { admin: 'A', reviewer: 'A', viewer: 'A' }],
  ['SELECT users.password_hash', 'SELECT password_hash FROM users LIMIT 1', { admin: 'A', reviewer: 'D', viewer: 'D' }],
  ['SELECT users.email', 'SELECT email FROM users LIMIT 1', { admin: 'A', reviewer: 'D', viewer: 'D' }],
  ['SELECT * FROM users', 'SELECT * FROM users LIMIT 1', { admin: 'A', reviewer: 'D', viewer: 'D' }],
  ['SELECT users.password_hash via subquery', 'SELECT (SELECT MAX(password_hash) FROM users) AS h', { admin: 'A', reviewer: 'D', viewer: 'D' }],
  ['SELECT users (user_id, name, role_id) - session link', 'SELECT u.user_id, u.name, r.role_id, r.role_name FROM roles r LEFT JOIN users u ON u.role_id = r.role_id', { admin: 'A', reviewer: 'A', viewer: 'A' }],
  ['risk-flags reviewer-name join', 'SELECT rf.flag_id, reviewer.name FROM risk_flags rf LEFT JOIN users reviewer ON rf.reviewer_id = reviewer.user_id LIMIT 1', { admin: 'A', reviewer: 'A', viewer: 'A' }],
  ['SELECT clauses / risk_patterns / risk_categories', 'SELECT cl.clause_id, rp.pattern_id, rc.category_id FROM clauses cl, risk_patterns rp, risk_categories rc LIMIT 1', { admin: 'A', reviewer: 'A', viewer: 'A' }],
  ['SELECT parties / contract_parties', 'SELECT p.party_id FROM parties p LEFT JOIN contract_parties cp ON cp.party_id = p.party_id LIMIT 1', { admin: 'A', reviewer: 'A', viewer: 'A' }],
  ['SELECT obligations/deadlines', 'SELECT o.obligation_id FROM obligations o LEFT JOIN deadlines d ON d.contract_id = o.contract_id LIMIT 1', { admin: 'A', reviewer: 'A', viewer: 'A' }],
  ['SELECT view review2_contract_risk_summary_v', 'SELECT * FROM review2_contract_risk_summary_v LIMIT 1', { admin: 'A', reviewer: 'A', viewer: 'A' }],
  ['EXECUTE fn_contract_risk_score / fn_risk_level', 'SELECT fn_risk_level(fn_contract_risk_score(-1)) AS lvl', { admin: 'A', reviewer: 'A', viewer: 'A' }],
  ['CALL GetContractRiskSummary', 'CALL GetContractRiskSummary(-1)', { admin: 'A', reviewer: 'A', viewer: 'A' }],
  ['CALL GetContractUpcomingItems', 'CALL GetContractUpcomingItems(-1)', { admin: 'A', reviewer: 'A', viewer: 'A' }],
  ['INSERT contracts (upload)', "INSERT INTO contracts (title) SELECT 'privilege probe' FROM DUAL WHERE 1 = 0", { admin: 'A', reviewer: 'D', viewer: 'D' }],
  ['INSERT clauses (upload)', "INSERT INTO clauses (contract_id, clause_text) SELECT 0, 'probe' FROM DUAL WHERE 1 = 0", { admin: 'A', reviewer: 'D', viewer: 'D' }],
  ['INSERT risk_flags (risk generation)', 'INSERT INTO risk_flags (clause_id, pattern_id) SELECT 0, 0 FROM DUAL WHERE 1 = 0', { admin: 'A', reviewer: 'D', viewer: 'D' }],
  ['INSERT obligations', "INSERT INTO obligations (contract_id, description) SELECT 0, 'probe' FROM DUAL WHERE 1 = 0", { admin: 'A', reviewer: 'D', viewer: 'D' }],
  ['UPDATE clauses.vector_id (embeddings)', 'UPDATE clauses SET vector_id = vector_id WHERE clause_id = -1', { admin: 'A', reviewer: 'D', viewer: 'D' }],
  ['UPDATE risk_patterns.vector_id', 'UPDATE risk_patterns SET vector_id = vector_id WHERE pattern_id = -1', { admin: 'A', reviewer: 'D', viewer: 'D' }],
  ['UPDATE contracts.status', 'UPDATE contracts SET status = status WHERE contract_id = -1', { admin: 'A', reviewer: 'D', viewer: 'D' }],
  ['UPDATE risk_flags review columns', 'UPDATE risk_flags SET reviewed = reviewed, reviewer_id = reviewer_id WHERE flag_id = -1', { admin: 'A', reviewer: 'A', viewer: 'D' }],
  ['UPDATE risk_flags.similarity_score', 'UPDATE risk_flags SET similarity_score = similarity_score WHERE flag_id = -1', { admin: 'A', reviewer: 'D', viewer: 'D' }],
  ['DELETE contracts', 'DELETE FROM contracts WHERE contract_id = -1', { admin: 'A', reviewer: 'D', viewer: 'D' }],
  ['DELETE risk_flags', 'DELETE FROM risk_flags WHERE flag_id = -1', { admin: 'A', reviewer: 'D', viewer: 'D' }],
  ['INSERT users (app user admin)', "INSERT INTO users (name, email, password_hash) SELECT 'x', 'x', 'x' FROM DUAL WHERE 1 = 0", { admin: 'A', reviewer: 'D', viewer: 'D' }],
  ['UPDATE roles (app admin data)', 'UPDATE roles SET role_name = role_name WHERE role_id = -1', { admin: 'A', reviewer: 'D', viewer: 'D' }],
  ['CREATE TABLE (DDL)', 'CREATE TABLE cri_privilege_probe (id INT)', { admin: 'D', reviewer: 'D', viewer: 'D' }],
  ['ALTER TABLE (DDL)', 'ALTER TABLE cri_privilege_probe_missing ADD COLUMN x INT', { admin: 'D', reviewer: 'D', viewer: 'D' }],
  ['DROP TABLE (DDL)', 'DROP TABLE cri_privilege_probe_missing', { admin: 'D', reviewer: 'D', viewer: 'D' }],
  ['CREATE PROCEDURE', 'CREATE PROCEDURE cri_privilege_probe_proc() SELECT 1', { admin: 'D', reviewer: 'D', viewer: 'D' }],
  ['CREATE USER (MySQL admin)', "CREATE USER 'cri_privilege_probe'@'localhost'", { admin: 'D', reviewer: 'D', viewer: 'D' }],
  ['GRANT (no GRANT OPTION)', "GRANT SELECT ON contract_risk_db.contracts TO 'cri_viewer_role'", { admin: 'D', reviewer: 'D', viewer: 'D' }],
  ['SELECT mysql.user (no global privileges)', 'SELECT user FROM mysql.user LIMIT 1', { admin: 'D', reviewer: 'D', viewer: 'D' }],
];

let failures = 0;
function report(ok, message) {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${message}`);
}

async function probe(pool, sql) {
  try {
    await pool.query(sql);
    return { outcome: 'A' };
  } catch (error) {
    return { outcome: DENIED_ERRNOS.has(error.errno) ? 'D' : 'ERR', error };
  }
}

async function testAccount(key, account) {
  console.log(`\n=== ${key.toUpperCase()} (${account.user}) ===`);
  if (!account.password) {
    report(false, `DB_${key.toUpperCase()}_PASSWORD is not set`);
    return;
  }

  const badPool = createAccountPool(account.user, `${account.password}-wrong`);
  const bad = await badPool.query('SELECT 1').then(() => null, (error) => error);
  report(bad?.code === 'ER_ACCESS_DENIED_ERROR', `invalid password rejected by MySQL (${bad?.code || 'accepted!'})`);
  await badPool.end();

  const pool = createAccountPool(account.user, account.password);
  try {
    const [[identity]] = await pool.query('SELECT CURRENT_USER() AS cu, CURRENT_ROLE() AS cr');
    console.log(`  CURRENT_USER() = ${identity.cu}   CURRENT_ROLE() = ${identity.cr}`);
    report(identity.cu === `${account.user}@%`, `pool authenticates as ${account.user}@% (not root)`);
    report(identity.cr.includes(`\`${account.role}\``), `default role ${account.role} is active`);

    const [grants] = await pool.query('SHOW GRANTS');
    console.log('  SHOW GRANTS:');
    grants.forEach((row) => console.log(`    ${Object.values(row)[0]}`));
    const allGrants = grants.map((row) => Object.values(row)[0]).join('\n');
    report(!/ON \*\.\* TO/.test(allGrants.replace(/GRANT USAGE ON \*\.\* TO[^\n]*/g, '')), 'no global privileges (only USAGE on *.*)');
    report(!/WITH GRANT OPTION|ALL PRIVILEGES/.test(allGrants), 'no GRANT OPTION / ALL PRIVILEGES');

    for (const [description, sql, expected] of PROBES) {
      const result = await probe(pool, sql);
      const want = expected[key];
      const label = { A: 'allowed', D: 'denied', ERR: 'unexpected error' };
      report(
        result.outcome === want,
        `${description}: ${label[result.outcome]}${result.error ? ` (${result.error.code})` : ''}, expected ${label[want]}`
      );
    }
  } finally {
    await pool.end();
  }
}

function collectSourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return collectSourceFiles(full);
    return /\.(js|jsx|mjs)$/.test(name) ? [full] : [];
  });
}

async function testNoBypass() {
  console.log('\n=== CONNECTION CONFIGURATION (no root bypass) ===');
  const envRead = /process\.env(\.|\[\s*['"`])MYSQL_(USER|PASSWORD)\b/;
  const offending = collectSourceFiles('app').filter((file) => envRead.test(readFileSync(file, 'utf8')));
  report(offending.length === 0, `web app source never reads MYSQL_USER / MYSQL_PASSWORD${offending.length ? `: ${offending.join(', ')}` : ''}`);

  let threw = false;
  try { getDb(); } catch { threw = true; }
  report(threw, 'getDb() without a logged-in user throws (no shared/root fallback pool)');
  threw = false;
  try { getDb({ role_name: 'Admin' }); } catch { threw = true; }
  report(threw, 'getDb() with a forged user object (no bound session pool) throws');
}

for (const [key, account] of Object.entries(ACCOUNTS)) {
  await testAccount(key, account);
}
await testNoBypass();

console.log(`\n${failures === 0 ? 'ALL PRIVILEGE TESTS PASSED' : `${failures} FAILURE(S)`}`);
process.exitCode = failures === 0 ? 0 : 1;
