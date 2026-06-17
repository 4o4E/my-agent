import { Router } from 'express';
import type { ShellCommandOptionItem, ToolSettingsOptionItem, ToolSettingsOptions } from '@my-agent/contracts';
import { getPageState, getToolSettings, savePageState, saveToolSettings, shellPathForSettings } from '../settings.js';
import { toolSchemas } from '../tools/registry.js';
import { findExecutable, scanExecutableNames } from '../tools/sandbox.js';
import { config } from '../config.js';

export const settingsApi = Router();

function uniq(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

export function toolOptions(): ToolSettingsOptionItem[] {
  return toolSchemas()
    .map((tool) => ({ name: tool.name, description: tool.description }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function shellCommandOptions(names: string[], envPath = process.env.PATH ?? ''): ShellCommandOptionItem[] {
  return uniq(names)
    .map((name) => {
      const path = findExecutable(name, envPath) ?? null;
      return { name, path, available: Boolean(path) };
    })
    .sort((a, b) => Number(b.available) - Number(a.available) || a.name.localeCompare(b.name));
}

export async function getToolSettingsOptions(): Promise<ToolSettingsOptions> {
  const settings = await getToolSettings();
  const envPath = shellPathForSettings(settings);
  return {
    tools: toolOptions(),
    shellCommands: shellCommandOptions([...config.tools.shellAllowCommands, ...settings.shellAllowCommands], envPath),
    systemPath: process.env.PATH ?? '',
  };
}

settingsApi.get('/tools', async (_req, res) => {
  res.json(await getToolSettings());
});

settingsApi.get('/tools/options', async (_req, res) => {
  res.json(await getToolSettingsOptions());
});

settingsApi.post('/tools/shell-commands/scan', async (req, res) => {
  const settings = await getToolSettings();
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
  const shellPathMode = body.shellPathMode === 'custom' ? 'custom' : 'system';
  const shellPath = typeof body.shellPath === 'string' ? body.shellPath : settings.shellPath;
  const include = Array.isArray(body.include) ? body.include.map(String) : settings.shellAllowCommands;
  const envPath = shellPathMode === 'custom' ? shellPath : process.env.PATH ?? '';
  res.json({
    path: envPath,
    shellCommands: shellCommandOptions([...include, ...scanExecutableNames(envPath)], envPath),
  });
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
