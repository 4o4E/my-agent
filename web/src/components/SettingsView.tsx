import { Fragment, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Activity, Database, Gauge, Moon, Palette, Plus, RefreshCw, Save, Shield, Sun, Wrench } from 'lucide-react';
import {
  createDatasource,
  createPermissionProfile,
  getDatasourceDetail,
  getThread,
  getToolSettings,
  getToolSettingsOptions,
  listDatasources,
  listThreads,
  scanShellCommandOptions,
  testDatasource,
  testDatasourceDraft,
  updateDatasource,
  updatePermissionProfile,
  updateToolSettings,
  type AgentEvent,
  type Datasource,
  type DatasourceAccount,
  type DatasourceInput,
  type DatasourceLease,
  type DatasourceStatus,
  type DatasourceTestResult,
  type DatasourceType,
  type PermissionMode,
  type PermissionProfile,
  type PermissionProfileInput,
  type ToolSettings,
  type ToolSettingsOptions,
  createReadonlyProfile,
} from '../api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useThemeCtx } from '@/theme';
import {
  DEFAULT_STATUS_FIELDS,
  STATUS_FIELD_LABELS,
  readStatusFields,
  writeStatusFields,
  type StatusField,
} from './StatusCard';

type SettingsPanel =
  | 'appearance'
  | 'status-card'
  | 'usage-stats'
  | 'tools-sandbox'
  | 'datasource-connection'
  | 'datasource-permissions'
  | 'datasource-pool'
  | 'datasource-leases';

type DatasourceSettingsPage = Extract<SettingsPanel, 'datasource-connection' | 'datasource-permissions' | 'datasource-pool' | 'datasource-leases'>;

interface UsagePoint {
  at: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  totalTokens: number;
}

interface UsageStats {
  threads: number;
  runs: number;
  points: UsagePoint[];
  totalInput: number;
  totalOutput: number;
  totalCached: number;
  totalTokens: number;
  peakTokens: number;
  averageTokens: number;
  daily: UsageDay[];
}

interface UsageDay {
  date: string;
  totalTokens: number;
  future: boolean;
}

interface DatasourceDetail {
  datasource: Datasource;
  profiles: PermissionProfile[];
  accounts: DatasourceAccount[];
  leases: DatasourceLease[];
}

interface DatasourceForm {
  name: string;
  type: DatasourceType;
  status: DatasourceStatus;
  host: string;
  port: string;
  database: string;
  adminConnectionUrl: string;
  maxPoolSize: string;
  leaseTtlSeconds: string;
}

interface ProfileForm {
  profileId: string | null;
  name: string;
  mode: PermissionMode;
  templateRole: string;
  maxPoolSize: string;
  leaseTtlSeconds: string;
}

function listToText(items: string[]): string {
  return items.join('\n');
}

function textToList(value: string): string[] {
  return value
    .split(/[,\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toggleListValue(items: string[], value: string, checked: boolean): string[] {
  const next = new Set(items);
  if (checked) next.add(value);
  else next.delete(value);
  return [...next].sort();
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}

function SectionButton({
  active,
  children,
  icon,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm transition-colors',
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </button>
  );
}

function NavGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <div className="px-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

function OptionList({
  empty,
  items,
  selected,
  renderMeta,
  onToggle,
}: {
  empty: string;
  items: Array<{ name: string; description?: string }>;
  selected: (name: string) => boolean;
  renderMeta?: (item: { name: string; description?: string }) => ReactNode;
  onToggle: (name: string, checked: boolean) => void;
}) {
  return (
    <div className="grid max-h-64 content-start gap-2 overflow-y-auto rounded-md border p-2">
      {items.length === 0 && <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">{empty}</div>}
      {items.map((item) => (
        <label
          key={item.name}
          className="grid min-h-11 grid-cols-[auto,minmax(0,1fr)] items-start gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent/60"
        >
          <Checkbox checked={selected(item.name)} onCheckedChange={(checked) => onToggle(item.name, checked === true)} className="mt-0.5" />
          <span className="grid min-w-0 gap-0.5">
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="min-w-0 break-all font-medium">{item.name}</span>
              <span className="shrink-0">{renderMeta?.(item)}</span>
            </span>
            {item.description && <span className="block break-words text-xs leading-5 text-muted-foreground">{item.description}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'active' || status === 'idle' || status === 'released') return 'secondary';
  if (status === 'leased') return 'default';
  if (status === 'disabled' || status === 'failed') return 'destructive';
  return 'outline';
}

function datasourceToForm(datasource?: Datasource): DatasourceForm {
  const connection = datasource?.connection ?? {};
  const poolConfig = datasource?.pool_config ?? {};
  return {
    name: datasource?.name ?? '',
    type: datasource?.type ?? 'postgres',
    status: datasource?.status ?? 'active',
    host: stringField(connection.host),
    port: stringField(connection.port, datasource?.type === 'hive' ? '10000' : datasource?.type === 'mongodb' ? '27017' : datasource?.type === 'mysql' ? '3306' : '5432'),
    database: stringField(connection.database),
    adminConnectionUrl: '',
    maxPoolSize: stringField(poolConfig.maxPoolSize, '20'),
    leaseTtlSeconds: stringField(poolConfig.leaseTtlSeconds, '1800'),
  };
}

function emptyProfileForm(): ProfileForm {
  return {
    profileId: null,
    name: 'readonly',
    mode: 'readonly',
    templateRole: '',
    maxPoolSize: '',
    leaseTtlSeconds: '',
  };
}

function profileToForm(profile: PermissionProfile): ProfileForm {
  const poolConfig = profile.pool_config ?? {};
  return {
    profileId: profile.id,
    name: profile.name,
    mode: profile.mode,
    templateRole: profile.template_role ?? '',
    maxPoolSize: stringField(poolConfig.maxPoolSize),
    leaseTtlSeconds: stringField(poolConfig.leaseTtlSeconds),
  };
}

function stringField(value: unknown, fallback = ''): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') return value;
  return fallback;
}

function positiveNumber(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} 必须是正数`);
  return Math.floor(parsed);
}

function optionalPositiveNumber(value: string, label: string): number | undefined {
  if (!value.trim()) return undefined;
  return positiveNumber(value, label);
}

function accountProfileName(account: DatasourceAccount, profiles: PermissionProfile[]): string {
  return profiles.find((profile) => profile.id === account.profile_id)?.name ?? account.profile_id.slice(0, 8);
}

function shortTime(value: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function numberField(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function usagePointFromEvent(event: AgentEvent, at: string): UsagePoint | null {
  if (event.type !== 'usage_update') return null;
  const inputTokens = numberField(event.inputTokens);
  const outputTokens = numberField(event.outputTokens);
  const cachedInputTokens = numberField(event.cachedInputTokens);
  const totalTokens = inputTokens + outputTokens;
  if (totalTokens <= 0 && cachedInputTokens <= 0) return null;
  return { at, inputTokens, outputTokens, cachedInputTokens, totalTokens };
}

function buildUsageStats(details: Awaited<ReturnType<typeof getThread>>[]): UsageStats {
  const points: UsagePoint[] = [];
  let runs = 0;
  for (const detail of details) {
    runs += detail.runs.length;
    for (const run of detail.runs) {
      for (const event of run.events) {
        const point = usagePointFromEvent(event, run.updated_at || run.created_at);
        if (point) points.push(point);
      }
    }
  }
  const dailyMap = new Map<string, number>();
  for (const point of points) {
    const date = new Date(point.at);
    if (!Number.isNaN(date.getTime())) {
      const key = localDateKey(date);
      dailyMap.set(key, (dailyMap.get(key) ?? 0) + point.totalTokens);
    }
  }
  const today = startOfLocalDay(new Date());
  const end = new Date(today);
  end.setDate(today.getDate() + (6 - today.getDay()));
  const start = new Date(end);
  start.setDate(end.getDate() - 83);
  const daily = Array.from({ length: 84 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = localDateKey(date);
    return { date: key, totalTokens: dailyMap.get(key) ?? 0, future: date > today };
  });
  const totalInput = points.reduce((sum, point) => sum + point.inputTokens, 0);
  const totalOutput = points.reduce((sum, point) => sum + point.outputTokens, 0);
  const totalCached = points.reduce((sum, point) => sum + point.cachedInputTokens, 0);
  const totalTokens = totalInput + totalOutput;
  const peakTokens = points.reduce((peak, point) => Math.max(peak, point.totalTokens), 0);
  const averageTokens = points.length ? Math.round(totalTokens / points.length) : 0;
  return {
    threads: details.length,
    runs,
    points,
    totalInput,
    totalOutput,
    totalCached,
    totalTokens,
    peakTokens,
    averageTokens,
    daily,
  };
}

function formatMetric(value: number): string {
  return value.toLocaleString();
}

function AppearanceSettingsPanel() {
  const { theme, setTheme } = useThemeCtx();

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-lg font-semibold">外观</h2>
        <p className="mt-1 text-sm text-muted-foreground">浅色、深色和界面显示偏好</p>
      </div>

      <Card className="rounded-lg shadow-sm">
        <CardHeader>
          <CardTitle>颜色模式</CardTitle>
          <CardDescription>设置会立即应用，并保存在当前浏览器中</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setTheme('light')}
            className={cn(
              'flex min-h-24 items-center gap-3 rounded-md border p-4 text-left transition-colors hover:bg-accent/60',
              theme === 'light' && 'border-primary bg-primary/5 ring-1 ring-primary/30',
            )}
          >
            <Sun className="size-5 shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm font-medium">浅色模式</span>
              <span className="mt-1 block text-xs text-muted-foreground">适合明亮环境，页面对比更轻。</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={cn(
              'flex min-h-24 items-center gap-3 rounded-md border p-4 text-left transition-colors hover:bg-accent/60',
              theme === 'dark' && 'border-primary bg-primary/5 ring-1 ring-primary/30',
            )}
          >
            <Moon className="size-5 shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm font-medium">深色模式</span>
              <span className="mt-1 block text-xs text-muted-foreground">适合低光环境，降低大面积亮度。</span>
            </span>
          </button>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusCardSettingsPanel() {
  const [fields, setFields] = useState<StatusField[]>(readStatusFields);

  const toggleField = (field: StatusField) => {
    setFields((current) => {
      const next = current.includes(field) ? current.filter((item) => item !== field) : [...current, field];
      return writeStatusFields(next);
    });
  };

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-lg font-semibold">状态卡片</h2>
        <p className="mt-1 text-sm text-muted-foreground">控制聊天页状态卡片展示哪些运行信息</p>
      </div>

      <Card className="rounded-lg shadow-sm">
        <CardHeader>
          <CardTitle>状态卡片字段</CardTitle>
          <CardDescription>至少保留一项；全部取消时会自动恢复默认字段</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {DEFAULT_STATUS_FIELDS.map((field) => (
            <label
              key={field}
              className="flex min-h-12 items-center gap-3 rounded-md border p-3 text-sm transition-colors hover:bg-accent/60"
            >
              <Checkbox checked={fields.includes(field)} onCheckedChange={() => toggleField(field)} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{STATUS_FIELD_LABELS[field]}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {field === 'tokens'
                    ? '输入、输出 token'
                    : field === 'cache'
                      ? '缓存命中 token 占比'
                      : field === 'shell'
                        ? 'Shell 和子任务资源'
                        : field === 'plan'
                          ? '当前计划进度'
                          : '运行状态和消息数量'}
                </span>
              </span>
            </label>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function UsageStatsSettingsPanel() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const refreshStats = () => {
    setLoading(true);
    setMessage('');
    listThreads()
      .then(async (threads) => {
        const details = await Promise.all(threads.map((thread) => getThread(thread.id)));
        setStats(buildUsageStats(details));
      })
      .catch((err) => setMessage(`读取用量失败：${(err as Error).message}`))
      .finally(() => setLoading(false));
  };

  useEffect(refreshStats, []);

  const dailyUsage = stats?.daily ?? Array.from({ length: 84 }, () => ({ date: '', totalTokens: 0, future: false }));
  const heatmapWeeks = Array.from({ length: 12 }, (_, week) => dailyUsage.slice(week * 7, week * 7 + 7));
  const maxDaily = Math.max(1, ...dailyUsage.map((day) => day.totalTokens));

  return (
    <div className="flex min-h-[34rem] flex-col gap-4">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">用量统计</h2>
          <p className="mt-1 text-sm text-muted-foreground">按历史 run 事件统计 token 消耗、峰值、平均值和日热力图</p>
        </div>
        <div className="flex items-center gap-3">
          {message && <span className="max-w-md truncate text-sm text-muted-foreground">{message}</span>}
          <Button variant="outline" onClick={refreshStats} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
            {loading ? '刷新中' : '刷新'}
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-3 md:grid-cols-3 xl:grid-cols-4">
        <Card className="rounded-lg shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>总消耗</CardDescription>
            <CardTitle>{formatMetric(stats?.totalTokens ?? 0)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            输入 {formatMetric(stats?.totalInput ?? 0)} · 输出 {formatMetric(stats?.totalOutput ?? 0)}
          </CardContent>
        </Card>
        <Card className="rounded-lg shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>峰值</CardDescription>
            <CardTitle>{formatMetric(stats?.peakTokens ?? 0)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">单次 usage_update 的最高 token 消耗</CardContent>
        </Card>
        <Card className="rounded-lg shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>平均</CardDescription>
            <CardTitle>{formatMetric(stats?.averageTokens ?? 0)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">按 usage_update 条数平均</CardContent>
        </Card>
        <Card className="rounded-lg shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>缓存命中</CardDescription>
            <CardTitle>{formatMetric(stats?.totalCached ?? 0)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {formatMetric(stats?.threads ?? 0)} 个会话 · {formatMetric(stats?.runs ?? 0)} 个 run
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-lg shadow-sm">
        <CardHeader>
          <CardTitle>日热力图</CardTitle>
          <CardDescription>最近 12 周每日 token 消耗，颜色越深表示当天消耗越高</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 overflow-x-auto">
          <div className="grid w-max grid-cols-[auto_repeat(12,0.875rem)] gap-1">
            <div />
            {heatmapWeeks.map((week, index) => (
              <div key={`week-${index}`} className="h-3 text-[10px] tabular-nums text-muted-foreground">
                {index % 3 === 0 ? week[0]?.date.slice(5) : ''}
              </div>
            ))}
            {['日', '一', '二', '三', '四', '五', '六'].map((weekday, row) => (
              <Fragment key={`weekday-${weekday}`}>
                <div className="flex h-3 items-center pr-1 text-[10px] text-muted-foreground">
                  {row % 2 === 1 ? weekday : ''}
                </div>
                {heatmapWeeks.map((week, column) => {
                  const day = week[row] ?? { date: '', totalTokens: 0, future: false };
                  const ratio = day.totalTokens / maxDaily;
                  return (
                    <div
                      key={`${day.date || column}-${row}`}
                      className={cn('size-3 rounded-[2px] border border-border/60', day.future && 'opacity-35')}
                      style={{
                        backgroundColor:
                          day.future
                            ? 'transparent'
                            : day.totalTokens > 0
                              ? `hsl(var(--primary) / ${Math.max(0.18, ratio).toFixed(2)})`
                              : 'hsl(var(--muted))',
                      }}
                      title={day.date ? `${day.date} · ${day.future ? '未到日期' : `${formatMetric(day.totalTokens)} token`}` : '暂无数据'}
                    />
                  );
                })}
              </Fragment>
            ))}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>少</span>
            {[0.15, 0.35, 0.6, 0.85, 1].map((opacity) => (
              <span
                key={opacity}
                className="size-3 rounded-[2px] border border-border/60"
                style={{ backgroundColor: `hsl(var(--primary) / ${opacity})` }}
              />
            ))}
            <span>多</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ToolsSettingsPanel({
  onWorkspaceChanged,
}: {
  onWorkspaceChanged: () => void;
}) {
  const [settings, setSettings] = useState<ToolSettings | null>(null);
  const [options, setOptions] = useState<ToolSettingsOptions | null>(null);
  const [shellDenyText, setShellDenyText] = useState('');
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let canceled = false;
    Promise.all([getToolSettings(), getToolSettingsOptions()])
      .then(([data, nextOptions]) => {
        if (canceled) return;
        setSettings(data);
        setOptions(nextOptions);
        setShellDenyText(listToText(data.shellDeny));
      })
      .catch((err) => {
        if (!canceled) setMessage(`读取配置失败：${(err as Error).message}`);
      });
    return () => {
      canceled = true;
    };
  }, []);

  const prepared = useMemo<ToolSettings | null>(() => {
    if (!settings) return null;
    return {
      ...settings,
      deny: settings.toolAccessMode === 'deny' ? settings.deny : [],
      allow: settings.toolAccessMode === 'allow' ? settings.allow : [],
      shellDeny: textToList(shellDenyText),
      maxOutput: Math.max(1000, Math.floor(Number(settings.maxOutput) || 1000)),
    };
  }, [settings, shellDenyText]);

  const toolOptions = options?.tools ?? [];
  const shellCommandOptions = options?.shellCommands ?? [];
  const allToolNames = useMemo(() => toolOptions.map((tool) => tool.name), [toolOptions]);
  const selectedToolSet = useMemo(
    () => new Set(settings?.toolAccessMode === 'allow' ? settings.allow : settings?.deny ?? []),
    [settings?.allow, settings?.deny, settings?.toolAccessMode],
  );
  const shellCommandSet = useMemo(() => new Set(settings?.shellAllowCommands ?? []), [settings?.shellAllowCommands]);

  function setToolMode(mode: ToolSettings['toolAccessMode']) {
    if (!settings) return;
    if (mode === settings.toolAccessMode) return;
    if (mode === 'allow') {
      const denied = new Set(settings.deny);
      setSettings({ ...settings, toolAccessMode: 'allow', allow: allToolNames.filter((name) => !denied.has(name)), deny: [] });
      return;
    }
    const allowed = new Set(settings.allow);
    setSettings({ ...settings, toolAccessMode: 'deny', allow: [], deny: allToolNames.filter((name) => !allowed.has(name)) });
  }

  function setToolSelected(name: string, checked: boolean) {
    if (!settings) return;
    if (settings.toolAccessMode === 'allow') {
      setSettings({ ...settings, allow: toggleListValue(settings.allow, name, checked), deny: [] });
      return;
    }
    setSettings({ ...settings, allow: [], deny: toggleListValue(settings.deny, name, checked) });
  }

  function setAllTools(checked: boolean) {
    if (!settings) return;
    if (settings.toolAccessMode === 'allow') {
      setSettings({ ...settings, allow: checked ? allToolNames : [], deny: [] });
      return;
    }
    setSettings({ ...settings, allow: [], deny: checked ? allToolNames : [] });
  }

  function resetTools() {
    if (!settings) return;
    setSettings({ ...settings, toolAccessMode: 'deny', allow: [], deny: [] });
  }

  function setShellCommand(name: string, checked: boolean) {
    if (!settings) return;
    setSettings({ ...settings, shellAllowCommands: toggleListValue(settings.shellAllowCommands, name, checked) });
  }

  async function scanShellCommands() {
    if (!settings || !options) return;
    setScanning(true);
    setMessage('');
    try {
      const result = await scanShellCommandOptions({
        shellPathMode: settings.shellPathMode,
        shellPath: settings.shellPath,
        include: settings.shellAllowCommands,
      });
      setOptions({ ...options, shellCommands: result.shellCommands });
      setMessage(`已扫描 PATH：发现 ${result.shellCommands.length} 个候选指令`);
    } catch (err) {
      setMessage(`扫描失败：${(err as Error).message}`);
    } finally {
      setScanning(false);
    }
  }

  async function save() {
    if (!prepared) return;
    setSaving(true);
    setMessage('');
    try {
      const next = await updateToolSettings(prepared);
      setSettings(next);
      setOptions(await getToolSettingsOptions());
      setShellDenyText(listToText(next.shellDeny));
      onWorkspaceChanged();
      setMessage('已保存');
    } catch (err) {
      setMessage(`保存失败：${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  if (!settings || !options) {
    return <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">正在读取配置...</div>;
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">沙箱</h2>
          <p className="mt-1 text-sm text-muted-foreground">路径限制、网络开关、工具准入和 shell 运行边界</p>
        </div>
        <div className="flex items-center gap-3">
          {message && <span className="text-sm text-muted-foreground">{message}</span>}
          <Button onClick={() => void save()} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? '保存中' : '保存'}
          </Button>
        </div>
      </div>

      <Card className="rounded-lg shadow-sm">
        <CardHeader>
          <CardTitle>工具沙箱</CardTitle>
          <CardDescription>路径限制、bwrap 后端和网络开关</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Field label="沙箱模式">
            <Select value={settings.sandbox} onValueChange={(value) => setSettings({ ...settings, sandbox: value as ToolSettings['sandbox'] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="off">off</SelectItem>
                <SelectItem value="enforce">enforce</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="沙箱后端">
            <Select
              value={settings.sandboxBackend}
              onValueChange={(value) => setSettings({ ...settings, sandboxBackend: value as ToolSettings['sandboxBackend'] })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">auto</SelectItem>
                <SelectItem value="none">none</SelectItem>
                <SelectItem value="bwrap">bwrap</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="网络">
            <Select value={settings.network} onValueChange={(value) => setSettings({ ...settings, network: value as ToolSettings['network'] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="disabled">disabled</SelectItem>
                <SelectItem value="enabled">enabled</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="md:col-span-3">
            <Field label="工作区根目录">
              <Input value={settings.workspaceRoot} onChange={(event) => setSettings({ ...settings, workspaceRoot: event.target.value })} />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-lg shadow-sm">
        <CardHeader>
          <CardTitle>工具准入</CardTitle>
          <CardDescription>工具候选由后端真实注册表下发；白名单只允许选中项，黑名单拒绝选中项</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),auto] md:items-end">
            <Field label="准入模式">
              <Select value={settings.toolAccessMode} onValueChange={(value) => setToolMode(value as ToolSettings['toolAccessMode'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="allow">白名单</SelectItem>
                  <SelectItem value="deny">黑名单</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setAllTools(true)}>全选</Button>
              <Button variant="outline" size="sm" onClick={() => setAllTools(false)}>全不选</Button>
              <Button variant="outline" size="sm" onClick={resetTools}>重置</Button>
            </div>
          </div>
          <div className="grid gap-2">
            <div className="text-sm font-medium">{settings.toolAccessMode === 'allow' ? '白名单工具' : '黑名单工具'}</div>
            <OptionList
              empty="后端没有下发工具候选"
              items={toolOptions}
              selected={(name) => selectedToolSet.has(name)}
              onToggle={setToolSelected}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-lg shadow-sm">
        <CardHeader>
          <CardTitle>Shell</CardTitle>
          <CardDescription>可见指令由后端按当前配置和 PATH 下发，命令 deny 仍支持正则</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
            <Field label="Shell 执行方式">
              <Select
                value={settings.shellUseHostPath ? 'host' : 'sandbox'}
                onValueChange={(value) => setSettings({ ...settings, shellUseHostPath: value === 'host' })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="host">宿主执行</SelectItem>
                  <SelectItem value="sandbox">沙箱投射</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="单条工具结果上限">
              <Input
                type="number"
                min={1000}
                value={settings.maxOutput}
                onChange={(event) => setSettings({ ...settings, maxOutput: Number(event.target.value) })}
              />
            </Field>
            <Field label="PATH 来源">
              <Select
                value={settings.shellPathMode}
                onValueChange={(value) => setSettings({ ...settings, shellPathMode: value as ToolSettings['shellPathMode'] })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">使用系统 PATH</SelectItem>
                  <SelectItem value="custom">手动输入 PATH</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="PATH">
              <Input
                value={settings.shellPathMode === 'system' ? options.systemPath : settings.shellPath}
                disabled={settings.shellPathMode === 'system'}
                onChange={(event) => setSettings({ ...settings, shellPath: event.target.value })}
              />
            </Field>
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium">可见指令</div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSettings({ ...settings, shellAllowCommands: shellCommandOptions.map((command) => command.name) })}>
                    全选
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setSettings({ ...settings, shellAllowCommands: [] })}>
                    全不选
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void scanShellCommands()} disabled={scanning}>
                    <RefreshCw className={cn('h-4 w-4', scanning && 'animate-spin')} />
                    {scanning ? '扫描中' : '扫描'}
                  </Button>
                </div>
              </div>
              <OptionList
                empty="后端没有下发可见指令候选"
                items={shellCommandOptions.map((command) => ({
                  name: command.name,
                  description: command.path ?? '当前 PATH 未找到，保存后也不会被 bwrap 投射',
                }))}
                selected={(name) => shellCommandSet.has(name)}
                renderMeta={(item) => {
                  const command = shellCommandOptions.find((option) => option.name === item.name);
                  return command?.available ? null : <Badge variant="outline">未找到</Badge>;
                }}
                onToggle={setShellCommand}
              />
            </div>
            <Field label="Shell deny 正则">
              <Textarea rows={8} value={shellDenyText} onChange={(event) => setShellDenyText(event.target.value)} />
            </Field>
        </CardContent>
      </Card>
    </div>
  );
}

function DatasourceSettingsPanel({ page }: { page: DatasourceSettingsPage }) {
  const [datasources, setDatasources] = useState<Datasource[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DatasourceDetail | null>(null);
  const [datasourceForm, setDatasourceForm] = useState<DatasourceForm>(() => datasourceToForm());
  const [profileForm, setProfileForm] = useState<ProfileForm>(() => emptyProfileForm());
  const [loading, setLoading] = useState(false);
  const [savingDatasource, setSavingDatasource] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [creatingReadonlyProfile, setCreatingReadonlyProfile] = useState(false);
  const [testingDatasource, setTestingDatasource] = useState(false);
  const [testResult, setTestResult] = useState<DatasourceTestResult | null>(null);
  const [message, setMessage] = useState('');

  const selectedDatasource = detail?.datasource ?? datasources.find((item) => item.id === selectedId) ?? null;

  async function refreshList(nextSelectedId = selectedId) {
    const result = await listDatasources();
    setDatasources(result.datasources);
    const targetId = nextSelectedId ?? result.datasources[0]?.id ?? null;
    setSelectedId(targetId);
    if (targetId) await refreshDetail(targetId);
    else {
      setDetail(null);
      setDatasourceForm(datasourceToForm());
      setProfileForm(emptyProfileForm());
    }
  }

  async function refreshDetail(id: string) {
    setLoading(true);
    try {
      const next = await getDatasourceDetail(id);
      setDetail(next);
      setDatasourceForm(datasourceToForm(next.datasource));
      setProfileForm(next.profiles[0] ? profileToForm(next.profiles[0]) : emptyProfileForm());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let canceled = false;
    listDatasources()
      .then(async (result) => {
        if (canceled) return;
        setDatasources(result.datasources);
        const first = result.datasources[0]?.id ?? null;
        setSelectedId(first);
        if (first) {
          const next = await getDatasourceDetail(first);
          if (canceled) return;
          setDetail(next);
          setDatasourceForm(datasourceToForm(next.datasource));
          setProfileForm(next.profiles[0] ? profileToForm(next.profiles[0]) : emptyProfileForm());
        }
      })
      .catch((err) => {
        if (!canceled) setMessage(`读取数据源失败：${(err as Error).message}`);
      });
    return () => {
      canceled = true;
    };
  }, []);

  function newDatasource() {
    setSelectedId(null);
    setDetail(null);
    setDatasourceForm(datasourceToForm());
    setProfileForm(emptyProfileForm());
    setTestResult(null);
    setMessage('');
  }

  async function selectDatasource(id: string) {
    setSelectedId(id);
    setTestResult(null);
    setMessage('');
    await refreshDetail(id);
  }

  function datasourceInputFromForm(): DatasourceInput {
    const connection = {
      ...(selectedDatasource?.connection ?? {}),
      host: datasourceForm.host.trim(),
      port: positiveNumber(datasourceForm.port, '端口'),
      database: datasourceForm.database.trim(),
    };
    const poolConfig = {
      ...(selectedDatasource?.pool_config ?? {}),
      maxPoolSize: positiveNumber(datasourceForm.maxPoolSize, '最大账号数'),
      leaseTtlSeconds: positiveNumber(datasourceForm.leaseTtlSeconds, '租约有效期'),
    };
    const input: DatasourceInput = {
      name: datasourceForm.name.trim(),
      type: datasourceForm.type,
      status: datasourceForm.status,
      connection,
      poolConfig,
    };
    if (datasourceForm.adminConnectionUrl.trim()) {
      input.adminConfig = { connectionUrl: datasourceForm.adminConnectionUrl.trim() };
    }
    return input;
  }

  async function saveDatasource() {
    setSavingDatasource(true);
    setMessage('');
    try {
      const input = datasourceInputFromForm();

      const result = selectedDatasource
        ? await updateDatasource(selectedDatasource.id, input)
        : await createDatasource(input);
      setMessage('数据源已保存');
      await refreshList(result.datasource.id);
    } catch (err) {
      setMessage(`保存数据源失败：${(err as Error).message}`);
    } finally {
      setSavingDatasource(false);
    }
  }

  async function testCurrentDatasource() {
    setTestingDatasource(true);
    setMessage('');
    setTestResult(null);
    try {
      const input = datasourceInputFromForm();
      const result = selectedDatasource
        ? await testDatasource(selectedDatasource.id, datasourceForm.adminConnectionUrl.trim() ? { adminConfig: input.adminConfig } : {})
        : await testDatasourceDraft(input);
      setTestResult(result);
      setMessage(`连接成功，发现 ${result.tableCount} 张表`);
    } catch (err) {
      setMessage(`测试连接失败：${(err as Error).message}`);
    } finally {
      setTestingDatasource(false);
    }
  }

  async function saveProfile() {
    if (!selectedDatasource) return;
    setSavingProfile(true);
    setMessage('');
    try {
      const poolConfig = {
        ...(detail?.profiles.find((profile) => profile.id === profileForm.profileId)?.pool_config ?? {}),
      };
      const maxPoolSize = optionalPositiveNumber(profileForm.maxPoolSize, '最大账号数');
      const leaseTtlSeconds = optionalPositiveNumber(profileForm.leaseTtlSeconds, '租约有效期');
      if (maxPoolSize != null) poolConfig.maxPoolSize = maxPoolSize;
      else delete poolConfig.maxPoolSize;
      if (leaseTtlSeconds != null) poolConfig.leaseTtlSeconds = leaseTtlSeconds;
      else delete poolConfig.leaseTtlSeconds;

      const input: PermissionProfileInput = {
        name: profileForm.name.trim(),
        mode: profileForm.mode,
        templateRole: profileForm.templateRole.trim() || undefined,
        grants: detail?.profiles.find((profile) => profile.id === profileForm.profileId)?.grants ?? {},
        poolConfig,
      };
      if (profileForm.profileId) await updatePermissionProfile(selectedDatasource.id, profileForm.profileId, input);
      else await createPermissionProfile(selectedDatasource.id, input);
      setMessage('权限档位已保存');
      await refreshDetail(selectedDatasource.id);
    } catch (err) {
      setMessage(`保存权限档位失败：${(err as Error).message}`);
    } finally {
      setSavingProfile(false);
    }
  }

  async function createDefaultReadonlyProfile() {
    if (!selectedDatasource) return;
    setCreatingReadonlyProfile(true);
    setMessage('');
    try {
      await createReadonlyProfile(selectedDatasource.id);
      setMessage('只读档位已创建');
      await refreshDetail(selectedDatasource.id);
    } catch (err) {
      setMessage(`创建只读档位失败：${(err as Error).message}`);
    } finally {
      setCreatingReadonlyProfile(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {page === 'datasource-connection'
              ? '数据源连接'
              : page === 'datasource-permissions'
                ? '数据源权限'
                : page === 'datasource-pool'
                  ? '数据源账号池'
                  : '数据源租约'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {page === 'datasource-connection'
              ? '配置数据库入口和管理连接'
              : page === 'datasource-permissions'
                ? '维护账号池继承的权限档位'
                : page === 'datasource-pool'
                  ? '查看短期数据库凭证账号状态'
                  : '查看账号池租约记录和到期状态'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {message && <span className="max-w-md truncate text-sm text-muted-foreground">{message}</span>}
          <Button variant="outline" onClick={() => void refreshList()} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
            刷新
          </Button>
          <Button onClick={newDatasource}>
            <Plus className="h-4 w-4" />
            新建数据源
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 items-stretch gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Card className="flex h-full min-h-0 flex-col rounded-lg shadow-sm">
          <CardHeader className="shrink-0">
            <CardTitle className="text-base">数据源</CardTitle>
            <CardDescription>{datasources.length} 个连接入口</CardDescription>
          </CardHeader>
          <CardContent className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto">
            {datasources.length === 0 && <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">暂无数据源</div>}
            {datasources.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void selectDatasource(item.id)}
                className={cn(
                  'grid gap-1 rounded-md border p-3 text-left transition-colors',
                  item.id === selectedId ? 'border-primary bg-primary/5' : 'hover:bg-accent/60',
                )}
              >
                <span className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{item.name}</span>
                  <Badge variant={statusVariant(item.status)}>{item.status}</Badge>
                </span>
                <span className="text-xs text-muted-foreground">{item.type}</span>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="h-full min-h-0">
          {page === 'datasource-connection' && (
            <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pr-1">
              <Card className="shrink-0 rounded-lg shadow-sm">
                <CardHeader className="shrink-0">
                  <CardTitle className="text-base">连接配置</CardTitle>
                  <CardDescription>
                    {selectedDatasource?.hasAdminConfig ? '已保存管理配置；留空不会覆盖' : '尚未保存管理配置'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <Field label="名称">
                    <Input value={datasourceForm.name} onChange={(event) => setDatasourceForm({ ...datasourceForm, name: event.target.value })} />
                  </Field>
                  <Field label="类型">
                    <Select
                      value={datasourceForm.type}
                      onValueChange={(value) => setDatasourceForm({ ...datasourceForm, type: value as DatasourceType })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="postgres">postgres</SelectItem>
                        <SelectItem value="mysql">mysql</SelectItem>
                        <SelectItem value="mongodb">mongodb</SelectItem>
                        <SelectItem value="hive">hive</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="状态">
                    <Select
                      value={datasourceForm.status}
                      onValueChange={(value) => setDatasourceForm({ ...datasourceForm, status: value as DatasourceStatus })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">active</SelectItem>
                        <SelectItem value="disabled">disabled</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="主机">
                    <Input value={datasourceForm.host} onChange={(event) => setDatasourceForm({ ...datasourceForm, host: event.target.value })} />
                  </Field>
                  <Field label="端口">
                    <Input
                      type="number"
                      min={1}
                      value={datasourceForm.port}
                      onChange={(event) => setDatasourceForm({ ...datasourceForm, port: event.target.value })}
                    />
                  </Field>
                  <Field label="数据库名">
                    <Input value={datasourceForm.database} onChange={(event) => setDatasourceForm({ ...datasourceForm, database: event.target.value })} />
                  </Field>
                  <Field label="最大账号数">
                    <Input
                      type="number"
                      min={1}
                      value={datasourceForm.maxPoolSize}
                      onChange={(event) => setDatasourceForm({ ...datasourceForm, maxPoolSize: event.target.value })}
                    />
                  </Field>
                  <Field label="租约有效期（秒）">
                    <Input
                      type="number"
                      min={1}
                      value={datasourceForm.leaseTtlSeconds}
                      onChange={(event) => setDatasourceForm({ ...datasourceForm, leaseTtlSeconds: event.target.value })}
                    />
                  </Field>
                  <div className="md:col-span-2">
                    <Field label="管理连接 URL">
                      <Input
                        type="password"
                        value={datasourceForm.adminConnectionUrl}
                        placeholder={selectedDatasource?.hasAdminConfig ? '已保存；留空不覆盖' : 'postgres://agent_admin:password@host:5432/db'}
                        onChange={(event) => setDatasourceForm({ ...datasourceForm, adminConnectionUrl: event.target.value })}
                      />
                    </Field>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground md:col-span-2">
                    当前 PostgreSQL 适配器使用管理连接 URL 创建、改密和锁定池账号；MySQL、MongoDB、Hive 适配器后续接入后会复用这些字段。
                  </div>
                  <div className="md:col-span-2">
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => void testCurrentDatasource()} disabled={testingDatasource || !datasourceForm.name.trim()}>
                        <RefreshCw className="h-4 w-4" />
                        {testingDatasource ? '测试中' : '测试连接'}
                      </Button>
                      <Button onClick={() => void saveDatasource()} disabled={savingDatasource || !datasourceForm.name.trim()}>
                        <Save className="h-4 w-4" />
                        {savingDatasource ? '保存中' : '保存数据源'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {testResult && (
                <Card className="flex min-h-80 shrink-0 flex-col rounded-lg shadow-sm">
                  <CardHeader className="shrink-0">
                    <CardTitle className="text-base">连接测试结果</CardTitle>
                    <CardDescription>
                      {testResult.database ? `${testResult.database} · ` : ''}
                      {testResult.tableCount} 张表
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid max-h-80 gap-2 overflow-y-auto">
                    {testResult.tables.length === 0 && (
                      <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">连接成功，但没有发现用户表</div>
                    )}
                    {testResult.tables.map((table) => (
                      <div key={`${table.schema}.${table.name}`} className="rounded-md border">
                        <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{table.schema}.{table.name}</div>
                            <div className="text-xs text-muted-foreground">{table.type}</div>
                          </div>
                          <Badge variant="outline">{table.columns.length} 列</Badge>
                        </div>
                        <div className="grid gap-1 p-3">
                          {table.columns.slice(0, 12).map((column) => (
                            <div key={column.name} className="grid gap-1 text-xs sm:grid-cols-[minmax(0,1fr)_10rem_4rem] sm:gap-2">
                              <span className="truncate font-medium">{column.name}</span>
                              <span className="truncate text-muted-foreground">{column.type}</span>
                              <span className="text-muted-foreground">{column.nullable ? 'NULL' : 'NOT NULL'}</span>
                            </div>
                          ))}
                          {table.columns.length > 12 && (
                            <div className="text-xs text-muted-foreground">还有 {table.columns.length - 12} 列未展开</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {page === 'datasource-permissions' && <Card className="flex h-full min-h-0 flex-col rounded-lg shadow-sm">
            <CardHeader className="shrink-0">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">权限档位</CardTitle>
                  <CardDescription>账号池账号继承模板角色</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void createDefaultReadonlyProfile()}
                    disabled={!selectedDatasource || creatingReadonlyProfile}
                  >
                    <Shield className="h-4 w-4" />
                    {creatingReadonlyProfile ? '创建中' : '创建只读档位'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setProfileForm(emptyProfileForm())} disabled={!selectedDatasource}>
                    <Plus className="h-4 w-4" />
                    新建档位
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto">
              {detail?.profiles.length ? (
                <div className="flex max-h-28 flex-wrap content-start gap-2 overflow-y-auto rounded-md border bg-muted/20 p-2">
                  {detail.profiles.map((profile) => (
                    <Button
                      key={profile.id}
                      type="button"
                      variant={profileForm.profileId === profile.id ? 'secondary' : 'outline'}
                      size="sm"
                      onClick={() => setProfileForm(profileToForm(profile))}
                    >
                      <Shield className="h-4 w-4" />
                      {profile.name}
                    </Button>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">暂无权限档位</div>
              )}
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="档位名称">
                  <Input value={profileForm.name} onChange={(event) => setProfileForm({ ...profileForm, name: event.target.value })} />
                </Field>
                <Field label="模式">
                  <Select value={profileForm.mode} onValueChange={(value) => setProfileForm({ ...profileForm, mode: value as PermissionMode })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="readonly">readonly</SelectItem>
                      <SelectItem value="limited_write">limited_write</SelectItem>
                      <SelectItem value="custom">custom</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="模板角色">
                  <Input value={profileForm.templateRole} onChange={(event) => setProfileForm({ ...profileForm, templateRole: event.target.value })} />
                </Field>
                <Field label="最大账号数">
                  <Input
                    type="number"
                    min={1}
                    value={profileForm.maxPoolSize}
                    placeholder="继承数据源配置"
                    onChange={(event) => setProfileForm({ ...profileForm, maxPoolSize: event.target.value })}
                  />
                </Field>
                <Field label="租约有效期（秒）">
                  <Input
                    type="number"
                    min={1}
                    value={profileForm.leaseTtlSeconds}
                    placeholder="继承数据源配置"
                    onChange={(event) => setProfileForm({ ...profileForm, leaseTtlSeconds: event.target.value })}
                  />
                </Field>
                <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground md:col-span-3">
                  表、列、行级权限应由数据库模板角色或 Ranger 兜底；这个档位只绑定模板角色和账号池覆盖参数。
                </div>
              </div>
              <Button onClick={() => void saveProfile()} disabled={savingProfile || !selectedDatasource || !profileForm.name.trim()}>
                <Save className="h-4 w-4" />
                {savingProfile ? '保存中' : '保存权限档位'}
              </Button>
            </CardContent>
          </Card>}

          {page === 'datasource-pool' && (
            <Card className="flex h-full min-h-0 flex-col rounded-lg shadow-sm">
              <CardHeader className="shrink-0">
                <CardTitle className="text-base">账号池</CardTitle>
                <CardDescription>{detail?.accounts.length ?? 0} 个账号</CardDescription>
              </CardHeader>
              <CardContent className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto">
                {!detail?.accounts.length && <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">暂无池账号</div>}
                {detail?.accounts.map((account) => (
                  <div key={account.id} className="grid gap-1 rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{account.username}</span>
                      <Badge variant={statusVariant(account.status)}>{account.status}</Badge>
                    </div>
                    <div className="grid gap-1 text-xs text-muted-foreground">
                      <span>档位：{accountProfileName(account, detail.profiles)}</span>
                      <span>run：{account.current_run_id ?? '-'}</span>
                      <span>租约到期：{shortTime(account.leased_until)}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {page === 'datasource-leases' && (
            <Card className="flex h-full min-h-0 flex-col rounded-lg shadow-sm">
              <CardHeader className="shrink-0">
                <CardTitle className="text-base">最近租约</CardTitle>
                <CardDescription>{detail?.leases.length ?? 0} 条记录</CardDescription>
              </CardHeader>
              <CardContent className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto">
                {!detail?.leases.length && <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">暂无租约</div>}
                {detail?.leases.map((lease) => (
                  <div key={lease.id} className="grid gap-1 rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{lease.id}</span>
                      <Badge variant={statusVariant(lease.status)}>{lease.status}</Badge>
                    </div>
                    <div className="grid gap-1 text-xs text-muted-foreground">
                      <span>run：{lease.run_id}</span>
                      <span>租出：{shortTime(lease.leased_at)}</span>
                      <span>到期：{shortTime(lease.expires_at)}</span>
                      {lease.error && <span className="text-destructive">错误：{lease.error}</span>}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export function SettingsView({ embedded = false, onWorkspaceChanged }: { embedded?: boolean; onWorkspaceChanged: () => void }) {
  const [panel, setPanel] = useState<SettingsPanel>('appearance');
  const datasourcePanel =
    panel === 'datasource-connection' ||
    panel === 'datasource-permissions' ||
    panel === 'datasource-pool' ||
    panel === 'datasource-leases';

  return (
    <main className={cn(embedded ? 'min-h-0 flex-1 bg-background' : 'app-main-surface h-full flex-1 overflow-y-auto')}>
      <div className={cn('mx-auto flex max-w-7xl flex-col gap-4 px-6 py-5', embedded && 'h-full min-h-0 w-full')}>
        {!embedded && <div>
          <h1 className="text-xl font-semibold">设置</h1>
          <p className="mt-1 text-sm text-muted-foreground">外观、用量展示、运行策略和数据源</p>
        </div>}

        <div className={cn('grid items-start gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]', embedded && 'h-full min-h-0 flex-1')}>
          <Card className={cn('rounded-lg shadow-sm', embedded ? 'h-full min-h-0 overflow-hidden' : 'h-fit')}>
            <CardContent className={cn('grid gap-2 p-3', embedded && 'max-h-full overflow-y-auto')}>
              <NavGroup label="外观">
                <SectionButton active={panel === 'appearance'} icon={<Palette className="h-4 w-4" />} onClick={() => setPanel('appearance')}>
                  外观
                </SectionButton>
                <SectionButton active={panel === 'status-card'} icon={<Gauge className="h-4 w-4" />} onClick={() => setPanel('status-card')}>
                  状态卡片
                </SectionButton>
              </NavGroup>
              <NavGroup label="用量">
                <SectionButton active={panel === 'usage-stats'} icon={<Activity className="h-4 w-4" />} onClick={() => setPanel('usage-stats')}>
                  用量统计
                </SectionButton>
              </NavGroup>
              <NavGroup label="工具">
                <SectionButton active={panel === 'tools-sandbox'} icon={<Wrench className="h-4 w-4" />} onClick={() => setPanel('tools-sandbox')}>
                  沙箱
                </SectionButton>
              </NavGroup>
              <NavGroup label="数据源">
                <SectionButton active={panel === 'datasource-connection'} icon={<Database className="h-4 w-4" />} onClick={() => setPanel('datasource-connection')}>
                  连接
                </SectionButton>
                <SectionButton active={panel === 'datasource-permissions'} icon={<Shield className="h-4 w-4" />} onClick={() => setPanel('datasource-permissions')}>
                  权限
                </SectionButton>
                <SectionButton active={panel === 'datasource-pool'} icon={<Database className="h-4 w-4" />} onClick={() => setPanel('datasource-pool')}>
                  账号池
                </SectionButton>
                <SectionButton active={panel === 'datasource-leases'} icon={<Database className="h-4 w-4" />} onClick={() => setPanel('datasource-leases')}>
                  租约
                </SectionButton>
              </NavGroup>
            </CardContent>
          </Card>

          <div className={cn('min-w-0', embedded && 'h-full min-h-0 pr-1', embedded && (datasourcePanel ? 'overflow-hidden' : 'overflow-y-auto'))}>
            {panel === 'appearance' && <AppearanceSettingsPanel />}
            {panel === 'status-card' && <StatusCardSettingsPanel />}
            {panel === 'usage-stats' && <UsageStatsSettingsPanel />}
            {panel === 'tools-sandbox' && <ToolsSettingsPanel onWorkspaceChanged={onWorkspaceChanged} />}
            {datasourcePanel && <DatasourceSettingsPanel page={panel} />}
          </div>
        </div>
      </div>
    </main>
  );
}
