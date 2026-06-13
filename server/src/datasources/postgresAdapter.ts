import pg from 'pg';
import type { DatasourceAccountRow, DatasourceRow, PermissionProfileRow } from './types.js';

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function adminConnectionUrl(datasource: DatasourceRow): string {
  const url = stringField(datasource.admin_config.connectionUrl);
  if (!url) {
    throw new Error(`数据源 ${datasource.id} 缺少 admin_config.connectionUrl，无法管理 PostgreSQL 账号`);
  }
  return url;
}

function quoteIdent(value: string): string {
  if (!/^[\w.@-]+$/.test(value)) throw new Error(`不安全的 PostgreSQL 标识符：${value}`);
  return `"${value.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function withAdminClient<T>(datasource: DatasourceRow, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: adminConnectionUrl(datasource) });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function ensurePostgresAccount(
  datasource: DatasourceRow,
  profile: PermissionProfileRow,
  account: DatasourceAccountRow,
  password: string,
  expiresAt: Date,
): Promise<void> {
  if (datasource.type !== 'postgres') throw new Error(`数据源 ${datasource.id} 不是 PostgreSQL`);
  if (!profile.template_role) {
    throw new Error(`权限档位 ${profile.id} 缺少 template_role，无法给账号授权`);
  }

  const username = quoteIdent(account.username);
  const role = quoteIdent(profile.template_role);
  const passwordValue = quoteLiteral(password);
  const validUntil = quoteLiteral(expiresAt.toISOString());

  await withAdminClient(datasource, async (client) => {
    // 创建或重置账号。账号权限来自模板角色，避免每次 run 临时拼授权 SQL。
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${quoteLiteral(account.username)}) THEN
          CREATE ROLE ${username} LOGIN PASSWORD ${passwordValue} VALID UNTIL ${validUntil};
        ELSE
          ALTER ROLE ${username} WITH LOGIN PASSWORD ${passwordValue} VALID UNTIL ${validUntil};
        END IF;
      END
      $$;
    `);
    await client.query(`GRANT ${role} TO ${username}`);
  });
}

export async function disablePostgresAccount(datasource: DatasourceRow, account: DatasourceAccountRow, password: string): Promise<void> {
  if (datasource.type !== 'postgres') throw new Error(`数据源 ${datasource.id} 不是 PostgreSQL`);
  const username = quoteIdent(account.username);
  const passwordValue = quoteLiteral(password);

  await withAdminClient(datasource, async (client) => {
    // 先禁止新登录，再断开旧连接；下次租用前会重新 LOGIN 并重置密码。
    await client.query(`ALTER ROLE ${username} WITH NOLOGIN PASSWORD ${passwordValue} VALID UNTIL '1970-01-01T00:00:00Z'`);
    await client.query(
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE usename = $1 AND pid <> pg_backend_pid()`,
      [account.username],
    );
  });
}
