import { Router } from 'express';
import { getPageState, getToolSettings, savePageState, saveToolSettings } from '../settings.js';

export const settingsApi = Router();

settingsApi.get('/tools', async (_req, res) => {
  res.json(await getToolSettings());
});

settingsApi.put('/tools', async (req, res) => {
  try {
    res.json(await saveToolSettings(req.body));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

settingsApi.get('/page-state', async (_req, res) => {
  res.json(await getPageState());
});

settingsApi.put('/page-state', async (req, res) => {
  try {
    res.json(await savePageState(req.body));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});
