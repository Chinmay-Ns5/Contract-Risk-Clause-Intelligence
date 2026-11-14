// End-to-end test of MySQL-account login, sessions and privilege enforcement
// through the running web application.
//
// Default mode is read-only: authorization is exercised with invalid / unknown-id
// requests that are rejected before any write. --with-upload also uploads one
// generated test PDF and cleans it up (disposable databases only).
// Table checksums and the Qdrant point count are compared before/after.
//
// Usage (server must be running, e.g. `next start -p 3100`):
//   node --env-file=.env.local --env-file=.env.mysql-accounts database/security/test_app_auth_e2e.js
//   node ... test_app_auth_e2e.js --expiry   (server started with a short AUTH_SESSION_MAX_AGE_SECONDS)
//   node ... test_app_auth_e2e.js --with-upload   (ALSO uploads a test PDF - disposable databases only)

import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { createAccountPool } from '../../app/lib/db.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3100';
const QDRANT = `${process.env.QDRANT_URL}/collections/${process.env.QDRANT_COLLECTION || 'risk_clauses'}`;
const ACCOUNTS = {
  admin: { user: process.env.DB_ADMIN_USER || 'cri_admin', password: process.env.DB_ADMIN_PASSWORD, role: 'Admin', mysqlRole: 'cri_admin_role' },
  reviewer: { user: process.env.DB_REVIEWER_USER || 'cri_reviewer', password: process.env.DB_REVIEWER_PASSWORD, role: 'Reviewer', mysqlRole: 'cri_reviewer_role' },
  viewer: { user: process.env.DB_VIEWER_USER || 'cri_viewer', password: process.env.DB_VIEWER_PASSWORD, role: 'Viewer', mysqlRole: 'cri_viewer_role' },
};
const TABLES = ['clauses', 'contract_parties', 'contracts', 'deadlines', 'obligations', 'parties', 'risk_categories', 'risk_flags', 'risk_patterns', 'roles', 'users'];

let failures = 0;
function check(ok, message) {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${message}`);
  return ok;
}

async function api(route, { method = 'GET', cookie, json, form, redirect = 'follow' } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  let body;
  if (json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(json);
  }
  if (form) body = form;
  const response = await fetch(`${BASE_URL}${route}`, { method, headers, body, redirect });
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* not JSON */ }
  return { status: response.status, data, text, headers: response.headers };
}

async function login(account) {
  const result = await api('/api/auth/login', { method: 'POST', json: { username: account.user, password: account.password } });
  const setCookie = result.headers.get('set-cookie') || '';
  const cookie = setCookie.split(';')[0];
  return { ...result, setCookie, cookie };
}

function buildTestPdf(marker) {
  const lines = [
    `MySQL privilege end-to-end test document ${marker}`,
    '1. Limitation of Liability. The Supplier shall have unlimited liability for all direct,',
    'indirect and consequential damages arising out of this Agreement.',
    '2. Indemnification. The Customer shall indemnify, defend and hold harmless the Supplier',
    'from any and all claims, losses, damages and expenses of any kind.',
    '3. Termination. The Supplier may terminate this Agreement at any time without notice',
    'and without any liability to the Customer.',
    '4. Automatic Renewal. This Agreement shall automatically renew for successive one year',
    'terms unless cancelled in writing ninety days before expiry.',
    '5. Governing Law. This Agreement is governed by the laws of the State of New York.',
  ];
  const stream = `BT /F1 10 Tf 14 TL 40 760 Td ${lines.map((l) => `(${l}) Tj T*`).join(' ')} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

function uploadForm(pdf, title) {
  const form = new FormData();
  form.set('file', new Blob([pdf], { type: 'application/pdf' }), 'privilege-test.pdf');
  form.set('title', title);
  return form;
}

async function snapshot() {
  // Admin: Reviewer/Viewer can no longer read every users column (CHECKSUM needs all).
  const pool = createAccountPool(ACCOUNTS.admin.user, ACCOUNTS.admin.password);
  try {
    const [rows] = await pool.query(`CHECKSUM TABLE ${TABLES.join(', ')}`);
    const result = Object.fromEntries(rows.map((r) => [r.Table.split('.')[1], String(r.Checksum)]));
    const count = await fetch(`${QDRANT}/points/count`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ exact: true }),
    }).then((r) => r.json());
    result.qdrant_points = count.result.count;
    return result;
  } finally {
    await pool.end();
  }
}

async function qdrantPointIds() {
  const response = await fetch(`${QDRANT}/points/scroll`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ limit: 100000, with_payload: false, with_vector: false }),
  }).then((r) => r.json());
  return new Set(response.result.points.map((p) => Number(p.id)));
}

// The app stores clause vectors with point id = clause_id. Stale Qdrant points left by
// previously deleted clauses can occupy the ids the next uploaded clauses will get; an
// upload would overwrite them. Refuse to upload if any upcoming id is already taken.
async function upcomingClauseIdsCollide(existingPointIds) {
  const pool = createAccountPool(ACCOUNTS.viewer.user, ACCOUNTS.viewer.password);
  try {
    const connection = await pool.getConnection();
    try {
      await connection.query('SET SESSION information_schema_stats_expiry = 0');
      const [[row]] = await connection.query(
        "SELECT AUTO_INCREMENT AS next_id FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clauses'"
      );
      const nextId = Number(row.next_id);
      const collisions = [];
      for (let id = nextId; id < nextId + 50; id++) if (existingPointIds.has(id)) collisions.push(id);
      return { nextId, collisions };
    } finally {
      connection.release();
    }
  } finally {
    await pool.end();
  }
}

async function cleanupTestContract(contractId, filePath, preexistingPointIds) {
  const pool = createAccountPool(ACCOUNTS.admin.user, ACCOUNTS.admin.password);
  try {
    const [clauses] = await pool.query('SELECT clause_id FROM clauses WHERE contract_id = ?', [contractId]);
    // Never delete a point that existed before the test started.
    const ids = clauses.map((c) => c.clause_id).filter((id) => !preexistingPointIds.has(id));
    if (ids.length) {
      await fetch(`${QDRANT}/points/delete?wait=true`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ points: ids }),
      });
    }
    const [result] = await pool.query('DELETE FROM contracts WHERE contract_id = ?', [contractId]);
    console.log(`  cleanup: deleted test contract ${contractId} (${result.affectedRows} row, cascade to ${ids.length} clauses/flags/obligations/deadlines), ${ids.length} Qdrant clause points`);
  } finally {
    await pool.end();
  }
  if (filePath) await unlink(path.join(process.cwd(), 'uploads', path.basename(filePath))).catch(() => {});
}

// Mirrors the attribution rule in app/lib/auth.js: link only when the role has exactly one user.
async function expectedLinkedUserId(roleName) {
  const pool = createAccountPool(ACCOUNTS.admin.user, ACCOUNTS.admin.password);
  try {
    const [rows] = await pool.query(
      'SELECT u.user_id FROM users u JOIN roles r ON r.role_id = u.role_id WHERE LOWER(r.role_name) = LOWER(?)',
      [roleName]
    );
    return rows.length === 1 ? rows[0].user_id : null;
  } finally {
    await pool.end();
  }
}

async function testExpiry() {
  const maxAge = Number(process.env.AUTH_SESSION_MAX_AGE_SECONDS || 5);
  console.log(`\n=== SESSION EXPIRATION (server max age ${maxAge}s) ===`);
  const session = await login(ACCOUNTS.viewer);
  check(session.status === 200, `viewer login succeeds (${session.status})`);
  check(new RegExp(`Max-Age=${maxAge}\\b`, 'i').test(session.setCookie), `cookie Max-Age is ${maxAge}`);
  check((await api('/api/auth/session', { cookie: session.cookie })).status === 200, 'session valid immediately after login');
  await new Promise((resolve) => setTimeout(resolve, (maxAge + 2) * 1000));
  // Send the cookie even though the browser would have dropped it: the server must reject it too.
  check((await api('/api/auth/session', { cookie: session.cookie })).status === 401, 'session rejected by server after expiry');
  check((await api('/api/contracts', { cookie: session.cookie })).status === 401, 'data API rejected after expiry');
}

async function main() {
  for (const [key, account] of Object.entries(ACCOUNTS)) {
    if (!account.password) throw new Error(`DB_${key.toUpperCase()}_PASSWORD is not set.`);
  }
  if (process.argv.includes('--expiry')) return testExpiry();

  // Default mode performs NO writes. --with-upload additionally uploads one generated
  // test PDF (only for disposable databases; never run against project data).
  const withUpload = process.argv.includes('--with-upload');
  const before = await snapshot();
  const preexistingPointIds = await qdrantPointIds();
  if (withUpload) {
    const { nextId, collisions } = await upcomingClauseIdsCollide(preexistingPointIds);
    if (collisions.length) {
      throw new Error(`Aborting before any change: next clause ids (from ${nextId}) collide with existing Qdrant points ${collisions.join(', ')}.`);
    }
  }
  console.log(withUpload ? 'Mode: with test upload' : 'Mode: read-only (no uploads, no writes)');
  const marker = new Date().toISOString();
  const pdf = buildTestPdf(marker);
  let testContractId = null;
  let testFilePath = null;

  try {
    console.log('\n=== UNAUTHENTICATED REQUESTS ===');
    for (const [method, route] of [['GET', '/api/auth/session'], ['GET', '/api/contracts'], ['GET', '/api/contracts/1'], ['GET', '/api/risk-flags'], ['GET', '/api/obligations'], ['GET', '/api/deadlines'], ['GET', '/api/users']]) {
      const r = await api(route, { method });
      check(r.status === 401, `${method} ${route} -> ${r.status} (expected 401)`);
    }
    check((await api('/api/contracts', { method: 'POST', form: uploadForm(pdf, 'unauth') })).status === 401, 'POST /api/contracts upload without session -> 401');
    check((await api('/api/risk-flags/1', { method: 'PATCH', json: { reviewed: true } })).status === 401, 'PATCH /api/risk-flags/1 without session -> 401');
    check((await api('/api/obligations', { method: 'POST', json: { contract_id: 1, description: 'x' } })).status === 401, 'POST /api/obligations without session -> 401');
    check((await api('/api/contracts', { cookie: 'cri_session=forged-token-value' })).status === 401, 'forged session cookie -> 401');

    console.log('\n=== SIGNUP REMOVED ===');
    const signupApi = await api('/api/auth/signup', { method: 'POST', json: { name: 'x', email: 'x@example.com', password: 'password123' } });
    check(signupApi.status === 410, `POST /api/auth/signup -> ${signupApi.status} (expected 410 Gone)`);
    const signupPage = await api('/signup', { redirect: 'manual' });
    check([307, 308].includes(signupPage.status) && /\/login/.test(signupPage.headers.get('location') || ''), `GET /signup redirects to /login (${signupPage.status} ${signupPage.headers.get('location')})`);
    const loginPage = await api('/login');
    check(loginPage.status === 200 && !loginPage.text.includes('href="/signup"') && loginPage.text.includes('MySQL username'), 'login page has MySQL username field and no signup link');

    console.log('\n=== LOGIN REJECTIONS ===');
    for (const account of Object.values(ACCOUNTS)) {
      const r = await api('/api/auth/login', { method: 'POST', json: { username: account.user, password: `${account.password}x` } });
      check(r.status === 401 && !r.headers.get('set-cookie'), `${account.user} with invalid password -> ${r.status}, no cookie`);
    }
    check((await api('/api/auth/login', { method: 'POST', json: { username: 'no_such_mysql_user', password: 'whatever-password' } })).status === 401, 'unknown MySQL user -> 401');
    check((await api('/api/auth/login', { method: 'POST', json: { username: 'root', password: 'not-tried-against-mysql' } })).status === 403, 'root account refused by the app -> 403');
    check((await api('/api/auth/login', { method: 'POST', json: { username: '', password: '' } })).status === 400, 'missing credentials -> 400');

    const sessions = {};
    for (const [key, account] of Object.entries(ACCOUNTS)) {
      console.log(`\n=== ${key.toUpperCase()} LOGIN AND SESSION (${account.user}) ===`);
      const r = await login(account);
      sessions[key] = r.cookie;
      check(r.status === 200 && r.data?.user?.role_name === account.role, `login succeeds, role_name = ${r.data?.user?.role_name}`);
      check(!r.text.includes(account.password) && !r.setCookie.includes(account.password), 'password not present in response body or cookie');
      check(/HttpOnly/i.test(r.setCookie) && /SameSite=lax/i.test(r.setCookie), 'session cookie is HttpOnly + SameSite=Lax');
      check(!/password/i.test(JSON.stringify(r.data?.user || {})), 'user object has no password fields');
      const s = await api('/api/auth/session', { cookie: r.cookie });
      console.log(`  session: CURRENT_USER() = ${s.data?.database?.current_user_account}, CURRENT_ROLE() = ${s.data?.database?.current_role}, linked user_id = ${s.data?.user?.user_id}`);
      check(s.status === 200 && s.data?.database?.current_user_account === `${account.user}@%`, `app session pool is connected to MySQL as ${account.user}@%`);
      check(String(s.data?.database?.current_role || '').includes(`\`${account.mysqlRole}\``), `active MySQL role ${account.mysqlRole}`);
      const expectedUserId = await expectedLinkedUserId(account.role);
      check(s.data?.user?.user_id === expectedUserId, `attribution: linked user_id ${s.data?.user?.user_id} (expected ${expectedUserId}: only when the role has exactly one app user)`);

      const contracts = await api('/api/contracts', { cookie: r.cookie });
      check(contracts.status === 200 && Array.isArray(contracts.data) && contracts.data.length > 0, `GET /api/contracts -> ${contracts.status}, ${contracts.data?.length} contracts`);
      check(contracts.data?.every((c) => c.risk_level !== undefined), 'stored functions fn_contract_risk_score / fn_risk_level executed');
      const firstId = contracts.data?.[contracts.data.length - 1]?.contract_id;
      const detail = await api(`/api/contracts/${firstId}`, { cookie: r.cookie });
      check(detail.status === 200 && Array.isArray(detail.data?.clauses) && detail.data?.risk_summary, `GET /api/contracts/${firstId} -> ${detail.status}, ${detail.data?.clauses?.length} clauses, stored procedure summary present`);
      const flags = await api('/api/risk-flags', { cookie: r.cookie });
      check(flags.status === 200 && flags.data?.success, `GET /api/risk-flags -> ${flags.status}, ${flags.data?.count} flags`);
      check((await api('/api/obligations', { cookie: r.cookie })).status === 200, 'GET /api/obligations -> 200');
      check((await api('/api/deadlines', { cookie: r.cookie })).status === 200, 'GET /api/deadlines -> 200');
    }

    if (!withUpload) {
    console.log('\n=== ADMIN OPERATIONS (authorized, no writes) ===');
    const missing = 999999999;
    check((await api('/api/users', { cookie: sessions.admin })).status === 200, 'GET /api/users (admin user list) -> 200');
    check((await api('/api/contracts', { method: 'POST', cookie: sessions.admin, form: new FormData() })).status === 400, 'upload endpoint authorizes admin (no file -> 400, nothing written)');
    check((await api('/api/contracts', { method: 'POST', cookie: sessions.admin, json: {} })).status === 400, 'create contract authorizes admin (no title -> 400)');
    check((await api('/api/obligations', { method: 'POST', cookie: sessions.admin, json: {} })).status === 400, 'create obligation authorizes admin (missing fields -> 400)');
    check((await api('/api/deadlines', { method: 'POST', cookie: sessions.admin, json: {} })).status === 400, 'create deadline authorizes admin (missing fields -> 400)');
    check((await api(`/api/risk-flags/${missing}`, { method: 'PATCH', cookie: sessions.admin, json: { reviewed: true } })).status === 404, 'review endpoint authorizes admin (unknown flag -> 404)');

    console.log('\n=== REVIEWER OPERATIONS ===');
    check((await api('/api/users', { cookie: sessions.reviewer })).status === 403, 'GET /api/users -> 403');
    check((await api('/api/contracts', { method: 'POST', cookie: sessions.reviewer, form: uploadForm(pdf, 'reviewer upload') })).status === 403, 'upload contract -> 403');
    check((await api('/api/contracts', { method: 'POST', cookie: sessions.reviewer, json: { title: 'reviewer contract' } })).status === 403, 'create contract via JSON -> 403');
    check((await api(`/api/contracts/${missing}/analysis`, { method: 'POST', cookie: sessions.reviewer })).status === 403, 'run analysis -> 403');
    check((await api('/api/obligations', { method: 'POST', cookie: sessions.reviewer, json: { contract_id: missing, description: 'x' } })).status === 403, 'create obligation -> 403');
    check((await api('/api/deadlines', { method: 'POST', cookie: sessions.reviewer, json: { contract_id: missing, deadline_type: 'x', deadline_date: '2030-01-01' } })).status === 403, 'create deadline -> 403');
    check((await api(`/api/risk-flags/${missing}`, { method: 'PATCH', cookie: sessions.reviewer, json: { reviewed: true, similarity_score: 0 } })).status === 400, 'PATCH risk flag with extra fields -> 400');
    check((await api(`/api/risk-flags/${missing}`, { method: 'PATCH', cookie: sessions.reviewer, json: { reviewed: true } })).status === 404, 'review endpoint authorizes reviewer (unknown flag -> 404, nothing written)');

    console.log('\n=== VIEWER OPERATIONS ===');
    check((await api('/api/users', { cookie: sessions.viewer })).status === 403, 'GET /api/users -> 403');
    check((await api('/api/contracts', { method: 'POST', cookie: sessions.viewer, form: uploadForm(pdf, 'viewer upload') })).status === 403, 'upload contract -> 403');
    check((await api('/api/contracts', { method: 'POST', cookie: sessions.viewer, json: { title: 'viewer contract' } })).status === 403, 'create contract via JSON -> 403');
    check((await api('/api/risk-flags/1', { method: 'PATCH', cookie: sessions.viewer, json: { reviewed: true } })).status === 403, 'review existing risk flag 1 -> 403');
    check((await api('/api/obligations', { method: 'POST', cookie: sessions.viewer, json: { contract_id: missing, description: 'x' } })).status === 403, 'create obligation -> 403');
    check((await api('/api/deadlines', { method: 'POST', cookie: sessions.viewer, json: { contract_id: missing, deadline_type: 'x', deadline_date: '2030-01-01' } })).status === 403, 'create deadline -> 403');
    check((await api(`/api/contracts/${missing}/analysis`, { method: 'POST', cookie: sessions.viewer })).status === 403, 'run analysis -> 403');

    } else {
    console.log('\n=== ADMIN OPERATIONS ===');
    check((await api('/api/users', { cookie: sessions.admin })).status === 200, 'GET /api/users (admin user list) -> 200');
    const upload = await api('/api/contracts', { method: 'POST', cookie: sessions.admin, form: uploadForm(pdf, `ZZ MySQL privilege test ${marker} (auto-deleted)`) });
    testContractId = upload.data?.contract_id ?? null;
    testFilePath = upload.data?.file_path ?? null;
    check(upload.status === 201 && upload.data?.success, `PDF upload -> ${upload.status} ${upload.data?.error || ''}`);
    console.log(`  upload: contract ${testContractId}, clauses ${upload.data?.clauses_created}, embeddings ${upload.data?.embeddings_stored}, patterns embedded ${upload.data?.patterns_embedded}, new flags ${upload.data?.analysis?.new_flags}`);
    check(upload.data?.clauses_created > 0 && upload.data?.embeddings_stored === true, 'clause extraction + embedding generation stored in Qdrant');
    check(upload.data?.analysis?.new_flags > 0, 'Qdrant similarity search generated risk flags');
    const reanalysis = await api(`/api/contracts/${testContractId}/analysis`, { method: 'POST', cookie: sessions.admin });
    check(reanalysis.status === 200 && reanalysis.data?.result?.new_flags === 0, `re-run analysis -> ${reanalysis.status}, duplicates prevented (${reanalysis.data?.result?.existing_flags} existing)`);
    check((await api('/api/obligations', { method: 'POST', cookie: sessions.admin, json: { contract_id: testContractId, description: 'Privilege test obligation', due_date: '2030-01-01' } })).status === 201, 'create obligation on test contract -> 201');
    check((await api('/api/deadlines', { method: 'POST', cookie: sessions.admin, json: { contract_id: testContractId, deadline_type: 'renewal', deadline_date: '2030-01-01' } })).status === 201, 'create deadline on test contract -> 201');

    const testFlags = (await api(`/api/risk-flags?contractId=${testContractId}`, { cookie: sessions.admin })).data?.flags || [];
    const [flagForReviewer, flagForViewer, flagForAdmin] = testFlags.map((f) => f.flag_id);

    console.log('\n=== REVIEWER OPERATIONS ===');
    check((await api('/api/users', { cookie: sessions.reviewer })).status === 403, 'GET /api/users -> 403');
    check((await api('/api/contracts', { method: 'POST', cookie: sessions.reviewer, form: uploadForm(pdf, 'reviewer upload') })).status === 403, 'upload contract -> 403');
    check((await api('/api/contracts', { method: 'POST', cookie: sessions.reviewer, json: { title: 'reviewer contract' } })).status === 403, 'create contract via JSON -> 403');
    check((await api(`/api/contracts/${testContractId}/analysis`, { method: 'POST', cookie: sessions.reviewer })).status === 403, 'run analysis -> 403');
    check((await api('/api/obligations', { method: 'POST', cookie: sessions.reviewer, json: { contract_id: testContractId, description: 'x' } })).status === 403, 'create obligation -> 403');
    check((await api(`/api/risk-flags/${flagForReviewer}`, { method: 'PATCH', cookie: sessions.reviewer, json: { reviewed: true, similarity_score: 0 } })).status === 400, 'PATCH risk flag with extra fields -> 400');
    if (flagForReviewer) {
      const review = await api(`/api/risk-flags/${flagForReviewer}`, { method: 'PATCH', cookie: sessions.reviewer, json: { reviewed: true } });
      check(review.status === 200 && review.data?.reviewer_id != null, `review test flag ${flagForReviewer} -> ${review.status}, reviewer_id ${review.data?.reviewer_id} (${review.data?.reviewer_name})`);
    } else {
      check(false, 'no test flag available for reviewer review test');
    }

    console.log('\n=== VIEWER OPERATIONS ===');
    check((await api('/api/users', { cookie: sessions.viewer })).status === 403, 'GET /api/users -> 403');
    check((await api('/api/contracts', { method: 'POST', cookie: sessions.viewer, form: uploadForm(pdf, 'viewer upload') })).status === 403, 'upload contract -> 403');
    check((await api(`/api/risk-flags/${flagForViewer || flagForReviewer}`, { method: 'PATCH', cookie: sessions.viewer, json: { reviewed: true } })).status === 403, 'review risk flag -> 403');
    check((await api('/api/obligations', { method: 'POST', cookie: sessions.viewer, json: { contract_id: testContractId, description: 'x' } })).status === 403, 'create obligation -> 403');
    check((await api('/api/deadlines', { method: 'POST', cookie: sessions.viewer, json: { contract_id: testContractId, deadline_type: 'x', deadline_date: '2030-01-01' } })).status === 403, 'create deadline -> 403');
    check((await api(`/api/contracts/${testContractId}/analysis`, { method: 'POST', cookie: sessions.viewer })).status === 403, 'run analysis -> 403');

    if (flagForAdmin) {
      const adminReview = await api(`/api/risk-flags/${flagForAdmin}`, { method: 'PATCH', cookie: sessions.admin, json: { reviewed: true } });
      check(adminReview.status === 200, `admin reviews test flag ${flagForAdmin} -> ${adminReview.status}`);
    }

    }

    console.log('\n=== LOGOUT ===');
    for (const [key, cookie] of Object.entries(sessions)) {
      check((await api('/api/auth/logout', { method: 'POST', cookie })).status === 200, `${key} logout -> 200`);
      check((await api('/api/auth/session', { cookie })).status === 401, `${key} old session cookie rejected after logout`);
      check((await api('/api/risk-flags', { cookie })).status === 401, `${key} data API rejected after logout`);
    }
  } finally {
    console.log('\n=== CLEANUP AND DATA INTEGRITY ===');
    if (testContractId) await cleanupTestContract(testContractId, testFilePath, preexistingPointIds);
    const after = await snapshot();
    for (const key of Object.keys(before)) {
      check(before[key] === after[key], `${key}: ${before[key]} -> ${after[key]} unchanged`);
    }
  }

  console.log(`\n${failures === 0 ? 'ALL END-TO-END TESTS PASSED' : `${failures} FAILURE(S)`}`);
}

main().catch((error) => {
  console.error('E2E test crashed:', error);
  failures++;
}).finally(() => {
  process.exitCode = failures === 0 ? 0 : 1;
});
