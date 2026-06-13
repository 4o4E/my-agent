import { Router } from 'express';
import {
  acquireCredential,
  createWorkloadToken,
  DatasourceError,
  releaseLease,
  releaseRunLeases,
  toPublicCredential,
  validateWorkloadToken,
} from '../datasources/accountPool.js';

export const runtimeApi = Router();

function bearerToken(header: unknown): string {
  const value = typeof header === 'string' ? header : '';
  const match = /^Bearer\s+(.+)$/i.exec(value);
  if (!match) throw new DatasourceError(401, '缺少 Authorization: Bearer <workload token>');
  return match[1].trim();
}

function handleError(res: import('express').Response, err: unknown) {
  if (err instanceof DatasourceError) return res.status(err.status).json({ error: err.message });
  return res.status(500).json({ error: (err as Error).message });
}

// 内部接口：为单次 run 签发 workload token。明文 token 只在这里返回一次。
runtimeApi.post('/workload-tokens', async (req, res) => {
  try {
    const created = await createWorkloadToken(req.body);
    res.status(201).json({
      token: created.token,
      id: created.row.id,
      runId: created.row.run_id,
      skillId: created.row.skill_id,
      allowedDatasourceIds: created.row.allowed_datasources,
      expiresAt: created.row.expires_at,
    });
  } catch (err) {
    handleError(res, err);
  }
});

// 容器脚本调用：用 workload token 换当前 run 独占的数据库临时凭证。
runtimeApi.post('/datasources/:id/credentials', async (req, res) => {
  try {
    const token = bearerToken(req.headers.authorization);
    const profileName = typeof req.body?.profile === 'string' && req.body.profile.trim() ? req.body.profile.trim() : 'readonly';
    const credential = await acquireCredential(token, req.params.id, profileName);
    res.status(201).json(toPublicCredential(credential));
  } catch (err) {
    handleError(res, err);
  }
});

runtimeApi.post('/leases/:id/release', async (req, res) => {
  try {
    const token = bearerToken(req.headers.authorization);
    const validated = await validateWorkloadToken(token);
    await releaseLease(req.params.id, validated.token.run_id);
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err);
  }
});

// 任务收尾兜底：撤销 run 的所有 workload token，并释放仍在租赁中的账号。
runtimeApi.post('/runs/:id/release-datasource-leases', async (req, res) => {
  try {
    const released = await releaseRunLeases(req.params.id);
    res.json({ ok: true, released });
  } catch (err) {
    handleError(res, err);
  }
});
