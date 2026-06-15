const DATABASE_CLI_RE = /(^|[\s;&|()])(?:psql|mysql|mongosh|beeline|duckdb|sqlite3)\b|\$DATABASE_URL|\$\{DATABASE_URL[}:+-]?/;
const DATABASE_ACCESS_SCRIPT_RE = /(?:^|[\s"';&|()])(?:\.\/)?(?:\.agents\/skills\/database-access|server\/src\/skills\/builtin\/database-access)\/scripts\/(?:psql_query\.py|db_credential\.py|db_credential\.sh|dbCredential\.mjs)\b/;

/** 判断 shell 命令是否会访问数据库凭证或平台数据库 SDK。 */
export function requiresDatabaseAccess(command: string): boolean {
  return DATABASE_CLI_RE.test(command) || DATABASE_ACCESS_SCRIPT_RE.test(command);
}

