export type SandboxBackendName = 'auto' | 'none' | 'bwrap';

export interface ToolSettings {
  sandbox: 'off' | 'enforce';
  sandboxBackend: SandboxBackendName;
  workspaceRoot: string;
  toolAccessMode: 'allow' | 'deny';
  allow: string[];
  deny: string[];
  shellEnabled: boolean;
  shellUseHostPath: boolean;
  shellPathMode: 'system' | 'custom';
  shellPath: string;
  shellAllowCommands: string[];
  network: 'enabled' | 'disabled';
  shellDeny: string[];
  maxOutput: number;
}

export interface ToolSettingsOptionItem {
  name: string;
  description: string;
}

export interface ShellCommandOptionItem {
  name: string;
  path: string | null;
  available: boolean;
}

export interface ToolSettingsOptions {
  tools: ToolSettingsOptionItem[];
  shellCommands: ShellCommandOptionItem[];
  systemPath: string;
}

export interface ShellCommandScanInput {
  shellPathMode: ToolSettings['shellPathMode'];
  shellPath: string;
  include: string[];
}

export interface ShellCommandScanResult {
  shellCommands: ShellCommandOptionItem[];
  path: string;
}

export type PageState = Record<string, unknown>;
