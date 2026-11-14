// Creates the MySQL roles and login accounts used by the web application and
// grants their privileges. Idempotent: safe to re-run (re-syncs passwords from env).
//
// The created accounts and roles appear in MySQL Workbench under
// Administration → Users and Privileges.
//
// Credentials (never hardcoded, never committed):
//   MYSQL_USER / MYSQL_PASSWORD     setup (root) account - used ONLY by this script
//   DB_ADMIN_USER    / DB_ADMIN_PASSWORD     default user: cri_admin
//   DB_REVIEWER_USER / DB_REVIEWER_PASSWORD  default user: cri_reviewer
//   DB_VIEWER_USER   / DB_VIEWER_PASSWORD    default user: cri_viewer
//   DB_ACCOUNT_HOST  host part of the accounts (default '%': MySQL runs in Docker and
//                    sees clients through the Docker gateway IP)
//
// Usage:
//   node database/security/setup_mysql_accounts.js --write-env-file .env.mysql-accounts
//       (one-time) writes random strong passwords to a git-ignored env file
//   node --env-file=.env.local --env-file=.env.mysql-accounts database/security/setup_mysql_accounts.js

import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import mysql from 'mysql2/promise';

const DATABASE = process.env.MYSQL_DATABASE || 'contract_risk_db';
const ACCOUNT_HOST = process.env.DB_ACCOUNT_HOST || '%';
const NAME_PATTERN = /^[a-z_][a-z0-9_]{0,31}$/;

// Read-only routines used by the dashboard / contract detail pages.
// All read data only; fn_contract_risk_score and the procedures are SQL SECURITY INVOKER,
// so they can never read or change more than the caller's own privileges allow.
const READ_ONLY_ROUTINES = [
  ['PROCEDURE', 'GetContractRiskSummary'],
  ['PROCEDURE', 'GetContractUpcomingItems'],
  ['FUNCTION', 'fn_contract_risk_score'],
  ['FUNCTION', 'fn_risk_level'],
];

// users.password_hash (and email) must not be readable by Reviewer/Viewer. Instead of a
// database-wide SELECT they get SELECT on every other table/view plus column-level SELECT
// on the users columns the application reads (session link and reviewer names).
const USERS_READABLE_COLUMNS = ['user_id', 'name', 'role_id'];
function readGrants(db, tables) {
  return [
    ...tables.filter((t) => t !== 'users').map((t) => `GRANT SELECT ON \`${db}\`.\`${t}\` TO {grantee}`),
    `GRANT SELECT (${USERS_READABLE_COLUMNS.join(', ')}) ON \`${db}\`.\`users\` TO {grantee}`,
  ];
}

const ACCOUNTS = [
  {
    key: 'ADMIN',
    defaultUser: 'cri_admin',
    role: 'cri_admin_role',
    // Contract upload, clause extraction, embeddings (vector_id), risk flag
    // generation, obligations/deadlines, risk review. No DDL, no GRANT, no global privileges.
    grants: (db) => [
      `GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON \`${db}\`.* TO {grantee}`,
    ],
  },
  {
    key: 'REVIEWER',
    defaultUser: 'cri_reviewer',
    role: 'cri_reviewer_role',
    // Read all application data (users: only non-secret columns); may only change
    // the review columns of risk_flags.
    revokes: (db) => [`REVOKE IF EXISTS SELECT ON \`${db}\`.* FROM {grantee} IGNORE UNKNOWN USER`],
    grants: (db, routinesFound, tables) => [
      ...readGrants(db, tables),
      `GRANT UPDATE (reviewed, reviewer_id) ON \`${db}\`.\`risk_flags\` TO {grantee}`,
      ...routinesFound.map(([type, name]) => `GRANT EXECUTE ON ${type} \`${db}\`.\`${name}\` TO {grantee}`),
    ],
  },
  {
    key: 'VIEWER',
    defaultUser: 'cri_viewer',
    role: 'cri_viewer_role',
    // Read only (users: only non-secret columns).
    revokes: (db) => [`REVOKE IF EXISTS SELECT ON \`${db}\`.* FROM {grantee} IGNORE UNKNOWN USER`],
    grants: (db, routinesFound, tables) => [
      ...readGrants(db, tables),
      ...routinesFound.map(([type, name]) => `GRANT EXECUTE ON ${type} \`${db}\`.\`${name}\` TO {grantee}`),
    ],
  },
];

function generatePassword() {
  // ~144 bits of randomness plus guaranteed upper/lower/digit/symbol characters.
  return `${randomBytes(18).toString('base64url')}-Aa9`;
}

function writeEnvFile(path) {
  if (existsSync(path)) {
    console.error(`Refusing to overwrite existing file ${path}.`);
    process.exit(1);
  }
  const lines = [
    '# MySQL application accounts (git-ignored). Used by database/security/*.js.',
    '# Log in to the website with these usernames and passwords.',
    `DB_ACCOUNT_HOST=${ACCOUNT_HOST}`,
    ...ACCOUNTS.flatMap(({ key, defaultUser }) => [
      `DB_${key}_USER=${defaultUser}`,
      `DB_${key}_PASSWORD=${generatePassword()}`,
    ]),
    '',
  ];
  writeFileSync(path, lines.join('\n'), { flag: 'wx', mode: 0o600 });
  console.log(`Wrote random passwords to ${path} (values not printed).`);
}

async function main() {
  const envFileFlag = process.argv.indexOf('--write-env-file');
  if (envFileFlag !== -1) {
    writeEnvFile(process.argv[envFileFlag + 1] || '.env.mysql-accounts');
    return;
  }

  const accounts = ACCOUNTS.map((account) => ({
    ...account,
    user: process.env[`DB_${account.key}_USER`] || account.defaultUser,
    password: process.env[`DB_${account.key}_PASSWORD`],
  }));
  for (const account of accounts) {
    if (!NAME_PATTERN.test(account.user)) throw new Error(`Invalid account name for ${account.key}.`);
    if (!account.password || account.password.length < 12) {
      throw new Error(`DB_${account.key}_PASSWORD must be set (at least 12 characters).`);
    }
  }
  if (!/^[A-Za-z0-9.%_-]{1,255}$/.test(ACCOUNT_HOST)) throw new Error('Invalid DB_ACCOUNT_HOST.');

  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: DATABASE,
  });

  try {
    const [routineRows] = await db.query(
      'SELECT ROUTINE_TYPE, ROUTINE_NAME FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ?',
      [DATABASE]
    );
    const existing = new Set(routineRows.map((r) => `${r.ROUTINE_TYPE}:${r.ROUTINE_NAME}`));
    const routinesFound = READ_ONLY_ROUTINES.filter(([type, name]) => existing.has(`${type}:${name}`));
    const [tableRows] = await db.query(
      'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME',
      [DATABASE]
    );
    const tables = tableRows.map((r) => r.TABLE_NAME);
    for (const [type, name] of READ_ONLY_ROUTINES) {
      if (!existing.has(`${type}:${name}`)) console.warn(`Skipping EXECUTE grant: ${type} ${name} not installed.`);
    }

    // Only for statements without secrets; passwords are passed as escaped parameters below.
    const run = async (sql) => {
      await db.query(sql);
      console.log(`  ${sql}`);
    };

    for (const account of accounts) {
      const role = db.escape(account.role);
      const user = `${db.escape(account.user)}@${db.escape(ACCOUNT_HOST)}`;
      console.log(`\n== ${account.key}: ${account.user}@${ACCOUNT_HOST} (role ${account.role})`);

      await run(`CREATE ROLE IF NOT EXISTS ${role}`);
      await db.query(
        `CREATE USER IF NOT EXISTS ${user} IDENTIFIED WITH caching_sha2_password BY ?`,
        [account.password]
      );
      // Sync password from env, never expire it (demo accounts; immune to a global
      // default_password_lifetime), and protect against password guessing via the login form.
      await db.query(
        `ALTER USER ${user} IDENTIFIED WITH caching_sha2_password BY ? PASSWORD EXPIRE NEVER FAILED_LOGIN_ATTEMPTS 5 PASSWORD_LOCK_TIME 1`,
        [account.password]
      );
      console.log(`  CREATE/ALTER USER ${account.user}@${ACCOUNT_HOST} IDENTIFIED WITH caching_sha2_password BY *** PASSWORD EXPIRE NEVER FAILED_LOGIN_ATTEMPTS 5 PASSWORD_LOCK_TIME 1`);

      // Privileges are defined on the role (the MySQL 8 way, reusable for new accounts)
      // and mirrored directly on the account, because MySQL Workbench's
      // "Users and Privileges" screen only displays privileges granted directly.
      for (const template of account.grants(DATABASE, routinesFound, tables)) {
        await run(template.replace('{grantee}', role));
        await run(template.replace('{grantee}', user));
      }
      for (const template of account.revokes?.(DATABASE) || []) {
        await run(template.replace('{grantee}', role));
        await run(template.replace('{grantee}', user));
      }
      await run(`GRANT ${role} TO ${user}`);
      await run(`SET DEFAULT ROLE ${role} TO ${user}`);
    }

    console.log('\nResulting grants:');
    for (const account of accounts) {
      const [rows] = await db.query(`SHOW GRANTS FOR ${db.escape(account.user)}@${db.escape(ACCOUNT_HOST)}`);
      console.log(`\n${account.user}@${ACCOUNT_HOST}`);
      rows.forEach((row) => console.log(`  ${Object.values(row)[0]}`));
    }
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error('Account setup failed:', error.code || '', error.message);
  process.exitCode = 1;
});
