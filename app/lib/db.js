import mysql from 'mysql2/promise';

// Each authenticated session gets its own small pool that connects as the MySQL
// account the user logged in with, so MySQL itself enforces that account's
// privileges. The web app never uses the root/setup credentials
// (MYSQL_USER / MYSQL_PASSWORD); those are only read by the setup scripts.
const sessionPools = new WeakMap();

function connectionOptions(username, password) {
  return {
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    database: process.env.MYSQL_DATABASE,
    user: username,
    password,
    connectTimeout: 10000,
  };
}

// Opens one short-lived connection to prove the credentials are valid and to read
// the identity and active roles MySQL assigned to the account.
export async function verifyMySqlAccount(username, password) {
  const connection = await mysql.createConnection(connectionOptions(username, password));
  try {
    const [[identity]] = await connection.query(
      'SELECT CURRENT_USER() AS mysql_account, CURRENT_ROLE() AS mysql_roles'
    );
    return { connection, identity };
  } catch (error) {
    await connection.end().catch(() => {});
    throw error;
  }
}

export function createAccountPool(username, password) {
  return mysql.createPool({
    ...connectionOptions(username, password),
    connectionLimit: 5,
    maxIdle: 0, // idle sessions hold no MySQL connections after idleTimeout
    idleTimeout: 60000,
    enableKeepAlive: true,
  });
}

export function bindSessionPool(user, pool) {
  sessionPools.set(user, pool);
}

// Returns the pool of the logged-in MySQL account. There is deliberately no
// shared/root fallback: without a session there is no database access.
export function getDb(user) {
  const pool = user && sessionPools.get(user);
  if (!pool) {
    throw new Error('No MySQL session connection is available for this request.');
  }
  return pool;
}
