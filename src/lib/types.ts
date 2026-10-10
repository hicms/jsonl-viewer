export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface Line {
  index: number;
  raw: string;
  value: Json;
  parseError: string | null;
}
export interface ToolResult {
  output: Json;
  error?: boolean;
  sourceLine: number;
}
export interface TraceBlock {
  kind: 'text' | 'thinking' | 'tool-call' | 'tool-result' | 'image';
  text?: string;
  redacted?: boolean;
  id?: string | null;
  name?: string;
  input?: Json;
  output?: Json;
  error?: boolean;
  result?: ToolResult;
  sourceLine: number;
  data?: string;
  mimeType?: string;
}
export interface TraceItem {
  kind: string;
  role: string;
  sourceLine: number;
  sourceLines: number[];
  timestamp: string | null;
  model: string | null;
  provider: string | null;
  effort: string | null;
  label: string | null;
  eventType?: 'error' | 'turn_aborted' | 'compacted';
  blocks: TraceBlock[];
  searchText: string;
  usage: { input: number | null; output: number | null } | null;
}
export interface Trace {
  format: string;
  harness: string;
  title: string | null;
  id: string | null;
  cwd: string | null;
  model: string | null;
  traceType: string;
  parentThreadId: string | null;
  subagent?: { agentRole?: string; agentNickname?: string; agentPath?: string } | null;
  reasoningEffort: string | null;
  efforts: string[];
  items: TraceItem[];
  stats: {
    messages: number;
    toolCalls: number;
    toolResults: number;
    errors: number;
    inputTokens: number;
    outputTokens: number;
  };
}
export interface Snapshot {
  id: string;
  revision: number;
  path: string;
  name: string;
  sizeBytes: number;
  totalLines: number;
  lines: Line[];
  hasMore: boolean;
  trace: Trace | null;
}
export interface Entry {
  path: string;
  name: string;
  isDir: boolean;
  size: number;
  modified: number;
  trace: {
    id: string | null;
    format: string;
    traceType: string;
    parentThreadId: string | null;
    agentRole: string | null;
  } | null;
}
export interface Source {
  key: string;
  label: string;
  path: string;
  exists: boolean;
  files: Entry[];
}
export type View = 'table' | 'tree' | 'raw' | 'trace';
export interface FileUi {
  view: View;
  filter: string;
  selected: number | null;
  editMode: boolean;
  order: 'oldest' | 'newest';
  wide: boolean;
  expanded: boolean;
  follow: boolean;
  pending: number;
  live: boolean;
  changed: boolean;
}
export interface Patch {
  raw: string;
  value: Json;
  generation: number;
  original: string;
  parseError: string | null;
}
export interface Session {
  snapshot: Snapshot;
  edits: Record<number, Patch>;
  generation: number;
  ui: FileUi;
  busy: boolean;
}
export interface Workspace {
  sessions: Session[];
  activeId: string | null;
  closedIds: string[];
}
