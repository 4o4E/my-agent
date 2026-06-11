import { config } from '../config.js';
import { runShellCommand } from './sandbox.js';
import type { Tool } from './types.js';

const isWindows = process.platform === 'win32';

export const shellTool: Tool = {
  name: 'shell',
  description: isWindows
    ? 'Execute a PowerShell command on the host (Windows) and return its stdout/stderr.'
    : 'Execute a shell command (/bin/sh) on the host and return its stdout/stderr.',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The command to execute (PowerShell on Windows, sh elsewhere)' },
      timeout_ms: { type: 'number', description: 'Timeout in milliseconds (default 60000)' },
    },
    required: ['command'],
  },
  async run(args) {
    const command = String(args.command ?? '');
    const timeout = Number(args.timeout_ms ?? 60000);
    try {
      const { stdout, stderr } = await runShellCommand(command, timeout, {
        policyMode: config.tools.sandbox,
        backend: config.tools.sandboxBackend,
        workspaceRoot: config.tools.workspaceRoot,
        allowCommands: config.tools.shellAllowCommands,
        shareNet: config.tools.shellShareNet,
      });
      return [stdout, stderr && `[stderr]\n${stderr}`].filter(Boolean).join('\n').trim() || '(no output)';
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; message?: string };
      return `Command failed: ${e.message}\n${e.stdout ?? ''}\n${e.stderr ?? ''}`.trim();
    }
  },
};
