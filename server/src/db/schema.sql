-- Agent persistence schema (PostgreSQL)
-- Conversation hierarchy: thread → run → step → (messages, events)

CREATE TABLE IF NOT EXISTS threads (
  id          TEXT PRIMARY KEY,
  title       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One run = one user turn in a thread (input → agent works → output)
CREATE TABLE IF NOT EXISTS runs (
  id          TEXT PRIMARY KEY,
  thread_id   TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending',   -- pending | running | waiting_for_user | done | error | canceling | canceled
  input       TEXT NOT NULL,
  output      TEXT,
  error       TEXT,
  goal_state  JSONB,                             -- structured goal anchor (intent/plan/decisions/next)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Goal anchor (long-task design §3.2). Idempotent for existing DBs.
ALTER TABLE runs ADD COLUMN IF NOT EXISTS goal_state JSONB;

-- One step = one iteration of the agent loop (one LLM turn + its tool calls)
CREATE TABLE IF NOT EXISTS steps (
  id          TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  idx         INTEGER NOT NULL,                  -- 1-based step number within the run
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id          BIGSERIAL PRIMARY KEY,
  thread_id   TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  run_id      TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  step_id     TEXT REFERENCES steps(id) ON DELETE CASCADE,  -- null for the initial user message
  role        TEXT NOT NULL,                     -- user | assistant | tool
  content     TEXT,                              -- ALWAYS the original; compaction never overwrites it
  tool_calls  JSONB,                             -- assistant tool call requests
  tool_call_id TEXT,                             -- for role=tool
  collapsed   TEXT,                              -- null | 'masked' | 'summarized' (context compaction, durable)
  summary_of  BIGINT[],                          -- summary message folds these original message ids
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Durable context compaction (long-task design §4). Idempotent so re-running
-- migrate() on an existing DB adds the column without touching data.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS collapsed TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS summary_of BIGINT[];

CREATE TABLE IF NOT EXISTS events (
  id          BIGSERIAL PRIMARY KEY,
  run_id      TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  step_id     TEXT REFERENCES steps(id) ON DELETE CASCADE,
  idx         INTEGER NOT NULL DEFAULT 0,        -- step index this event belongs to
  type        TEXT NOT NULL,                     -- step_start | reasoning | reasoning_timing | llm_delta | tool_call | tool_result | compaction | final | error
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_runs_thread ON runs(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_steps_run ON steps(run_id, idx);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, id);
CREATE INDEX IF NOT EXISTS idx_messages_run ON messages(run_id, id);
CREATE INDEX IF NOT EXISTS idx_events_run ON events(run_id, id);
CREATE INDEX IF NOT EXISTS idx_threads_created ON threads(created_at DESC);

-- 应用配置表。env 只作为首次默认值/兜底,运行时配置从这里读取。
CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 数据源控制面。真实数据库管理凭证只允许存 secret 引用；本地开发可临时使用
-- admin_config.connectionUrl，生产环境应迁到 Vault/Akeyless/云 Secret Manager。
CREATE TABLE IF NOT EXISTS datasources (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('postgres', 'mysql', 'mongodb', 'hive')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  connection    JSONB NOT NULL DEFAULT '{}'::jsonb,
  admin_config  JSONB NOT NULL DEFAULT '{}'::jsonb,
  pool_config   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_datasources_name ON datasources(name);

-- 权限档位：例如 readonly / limited_write。账号池账号只绑定档位，不在 run
-- 开始时临时拼复杂授权，避免权限漂移。
CREATE TABLE IF NOT EXISTS datasource_permission_profiles (
  id            TEXT PRIMARY KEY,
  datasource_id TEXT NOT NULL REFERENCES datasources(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  mode          TEXT NOT NULL DEFAULT 'readonly' CHECK (mode IN ('readonly', 'limited_write', 'custom')),
  template_role TEXT,
  grants        JSONB NOT NULL DEFAULT '{}'::jsonb,
  pool_config   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (datasource_id, name)
);

-- 账号池账号。账号长期存在，run 开始时重置登录凭证并租出；run 结束后锁定
-- 或改废密码，再回到 idle。
CREATE TABLE IF NOT EXISTS datasource_accounts (
  id             TEXT PRIMARY KEY,
  datasource_id  TEXT NOT NULL REFERENCES datasources(id) ON DELETE CASCADE,
  profile_id     TEXT NOT NULL REFERENCES datasource_permission_profiles(id) ON DELETE CASCADE,
  username       TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'leased', 'cooling_down', 'disabled')),
  current_run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
  leased_until   TIMESTAMPTZ,
  last_lease_at  TIMESTAMPTZ,
  last_rotated_at TIMESTAMPTZ,
  failure_count  INTEGER NOT NULL DEFAULT 0,
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (datasource_id, username)
);

CREATE INDEX IF NOT EXISTS idx_datasource_accounts_pool ON datasource_accounts(datasource_id, profile_id, status);
CREATE INDEX IF NOT EXISTS idx_datasource_accounts_run ON datasource_accounts(current_run_id);

-- workload token 是 run 级别的代理凭证，只能换取本次 run 允许的数据源凭证。
-- 表里只存 hash，不保存明文 token。
CREATE TABLE IF NOT EXISTS workload_tokens (
  id                  TEXT PRIMARY KEY,
  token_hash          TEXT NOT NULL UNIQUE,
  run_id              TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  skill_id            TEXT,
  allowed_datasources TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  expires_at          TIMESTAMPTZ NOT NULL,
  revoked_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workload_tokens_run ON workload_tokens(run_id);
CREATE INDEX IF NOT EXISTS idx_workload_tokens_expiry ON workload_tokens(expires_at);

-- 凭证租约。用于审计和回收：run 结束、token 过期或 lease 过期时都能兜底清理。
CREATE TABLE IF NOT EXISTS datasource_account_leases (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL REFERENCES datasource_accounts(id) ON DELETE CASCADE,
  datasource_id TEXT NOT NULL REFERENCES datasources(id) ON DELETE CASCADE,
  profile_id    TEXT NOT NULL REFERENCES datasource_permission_profiles(id) ON DELETE CASCADE,
  run_id        TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  token_id      TEXT REFERENCES workload_tokens(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'leased' CHECK (status IN ('leased', 'released', 'expired', 'failed')),
  leased_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  released_at   TIMESTAMPTZ,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_datasource_leases_run ON datasource_account_leases(run_id, status);
CREATE INDEX IF NOT EXISTS idx_datasource_leases_expiry ON datasource_account_leases(status, expires_at);
