/**
 * 结构化运行日志 —— console 输出 + localStorage 持久化。
 *
 * 设计：
 *  - 每条日志带时间戳、级别、模块、消息、上下文快照
 *  - console 彩色输出，便于开发时实时查看
 *  - 持久化到 localStorage（最近 500 条），页面刷新后仍可查看
 *  - UI 可读取日志面板展示历史
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  ts: number;
  level: LogLevel;
  module: string;
  message: string;
  /** 附加上下文（轮次、Agent、错误堆栈等） */
  context?: Record<string, unknown>;
}

const STORAGE_KEY = 'debate-hub:logs';
const MAX_LOGS = 500;

const LEVEL_STYLE: Record<LogLevel, string> = {
  debug: 'color: #888',
  info: 'color: #5FE0C7',
  warn: 'color: #E8B14C',
  error: 'color: #D08877; font-weight: bold',
};

const LEVEL_PREFIX: Record<LogLevel, string> = {
  debug: 'DBG',
  info: 'INF',
  warn: 'WRN',
  error: 'ERR',
};

const inMemoryLogs: LogEntry[] = [];

/** 从 localStorage 加载历史日志 */
function loadFromStorage(): LogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 持久化日志到 localStorage */
function saveToStorage(logs: LogEntry[]) {
  try {
    const trimmed = logs.slice(-MAX_LOGS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage 满了也不影响主流程
  }
}

/** 生成简短唯一 ID */
const logId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/**
 * 写入一条日志。
 * @param level 日志级别
 * @param module 模块名（DebateEngine / LLMClient / chatWithTimeout 等）
 * @param message 日志消息
 * @param context 附加上下文
 */
export function log(
  level: LogLevel,
  module: string,
  message: string,
  context?: Record<string, unknown>,
) {
  const entry: LogEntry = {
    id: logId(),
    ts: Date.now(),
    level,
    module,
    message,
    context,
  };

  // 写入内存
  inMemoryLogs.push(entry);

  // 合并历史 + 内存，持久化
  const all = [...loadFromStorage(), ...inMemoryLogs].slice(-MAX_LOGS);
  saveToStorage(all);

  // console 彩色输出
  const time = new Date(entry.ts).toLocaleTimeString('zh-CN', { hour12: false });
  const prefix = `%c[${time}] ${LEVEL_PREFIX[level]} [${module}]`;
  const style = LEVEL_STYLE[level];

  if (context && Object.keys(context).length) {
    console.log(prefix, style, message, context);
  } else {
    console.log(prefix, style, message);
  }

  // error 级别额外输出堆栈
  if (level === 'error' && context?.error instanceof Error) {
    console.error(context.error);
  }
}

/** 便捷方法 */
export const logger = {
  debug: (module: string, message: string, context?: Record<string, unknown>) =>
    log('debug', module, message, context),
  info: (module: string, message: string, context?: Record<string, unknown>) =>
    log('info', module, message, context),
  warn: (module: string, message: string, context?: Record<string, unknown>) =>
    log('warn', module, message, context),
  error: (module: string, message: string, context?: Record<string, unknown>) =>
    log('error', module, message, context),
};

/**
 * 获取所有日志（内存 + localStorage 合并）。
 * 供 UI 日志面板调用。
 */
export function getAllLogs(): LogEntry[] {
  return [...loadFromStorage(), ...inMemoryLogs];
}

/**
 * 获取当前会话的日志（按时间戳过滤）。
 * @param sinceTs 仅返回此时间戳之后的日志
 */
export function getLogsSince(sinceTs: number): LogEntry[] {
  return getAllLogs().filter((l) => l.ts >= sinceTs);
}

/** 清空所有日志（内存 + localStorage） */
export function clearLogs() {
  inMemoryLogs.length = 0;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * 记录断点信息：当辩论被停止或出错时，调用此函数记录完整状态快照。
 */
export function logBreakpoint(
  module: string,
  reason: string,
  snapshot: {
    phase: string;
    round: number;
    maxRounds: number;
    currentAgentId?: string;
    currentAgentName?: string;
    sessionId?: string;
    speechesCount: number;
    eventsCount: number;
    error?: unknown;
  },
) {
  const error = snapshot.error;
  const errorInfo = error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack?.split('\n').slice(0, 5).join('\n') }
    : error ? String(error) : undefined;

  log('warn', module, `断点：${reason}`, {
    ...snapshot,
    error: errorInfo,
  });
}
