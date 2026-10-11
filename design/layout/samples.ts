import type { FileUi, Json, Line, Trace } from '../../src/lib/types';

export const initialUi: FileUi = {
  view: 'table',
  filter: '',
  selected: null,
  editMode: false,
  order: 'oldest',
  wide: false,
  expanded: false,
  follow: true,
  pending: 0,
  live: false,
  changed: false,
};

export function toLines(values: Json[]): Line[] {
  return values.map((value, index) => ({
    index,
    raw: JSON.stringify(value),
    value,
    parseError: null,
  }));
}

export const logs = toLines([
  {
    level: 'info',
    time: '2026-10-11T10:00:00.123Z',
    message: 'Application started',
    service: 'api',
  },
  {
    level: 'debug',
    time: '2026-10-11T10:00:05.456Z',
    message: 'Loading configuration from config.json',
    service: 'core',
  },
  { level: 'info', time: '2026-10-11T10:01:12.789Z', message: 'Request completed', service: 'api' },
  {
    level: 'warn',
    time: '2026-10-11T10:02:33.111Z',
    message: "Cache miss for key 'user:12345'",
    service: 'cache',
  },
  {
    level: 'error',
    time: '2026-10-11T10:03:21.654Z',
    message: 'Failed to connect to database: timeout',
    service: 'db',
  },
  {
    level: 'info',
    time: '2026-10-11T10:03:22.001Z',
    message: 'Retry scheduled in 5 seconds',
    service: 'worker',
  },
  {
    level: 'debug',
    time: '2026-10-11T10:04:10.333Z',
    message: 'Background job processed successfully',
    service: 'worker',
  },
]);

export const trace: Trace = {
  format: 'codex',
  harness: 'Codex',
  title: '检查服务启动日志',
  id: 'session-demo',
  cwd: 'D:/data',
  model: null,
  traceType: 'main',
  parentThreadId: null,
  reasoningEffort: null,
  efforts: [],
  stats: { messages: 3, toolCalls: 0, toolResults: 0, errors: 0, inputTokens: 0, outputTokens: 0 },
  items: [
    ['user', '帮我检查服务启动日志，找出连接失败的原因。'],
    ['assistant', '我会先检查启动日志中的错误和重试记录。'],
    ['assistant', '数据库连接在启动时超时，随后安排了重试。建议检查数据库连接配置和服务可用性。'],
  ].map(([kind, text], index) => ({
    kind,
    role: kind,
    sourceLine: index,
    sourceLines: [index],
    timestamp: null,
    model: null,
    provider: null,
    effort: null,
    label: null,
    usage: null,
    blocks: [{ kind: 'text', text, sourceLine: index }],
    searchText: text,
  })),
};

export const samples = [
  { name: 'logs.jsonl', lines: logs, trace: null },
  {
    name: 'session.jsonl',
    lines: toLines(trace.items.map((item) => ({ role: item.role, message: item.searchText }))),
    trace,
  },
  {
    name: 'events.ndjson',
    lines: toLines([
      { event: 'job.started', id: 'job-001', payload: { queue: 'default', attempts: 1 } },
      { event: 'job.completed', id: 'job-001', payload: { elapsed: 240, success: true } },
    ]),
    trace: null,
  },
];

export type DemoFile = {
  name: string;
  lines: Line[];
  trace: Trace | null;
  ui: FileUi;
  dirty: boolean;
};

export function sampleFile(name: string): DemoFile {
  const sample = samples.find((file) => file.name === name) ?? samples[0];
  return { ...sample, ui: { ...initialUi, view: sample.trace ? 'trace' : 'table' }, dirty: false };
}
