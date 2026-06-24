import { useState, useEffect, useCallback } from 'react';
import { Terminal, Trash2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { getAllLogs, clearLogs, type LogEntry, type LogLevel } from '@/engine/logger';
import { Button } from '@/components/shared/Button';
import { Chip } from '@/components/shared/Chip';

const LEVEL_TONE: Record<LogLevel, 'gold' | 'cyan' | 'rose' | 'mute' | 'violet'> = {
  debug: 'mute',
  info: 'cyan',
  warn: 'gold',
  error: 'rose',
};

const LEVEL_LABEL: Record<LogLevel, string> = {
  debug: 'DBG',
  info: 'INF',
  warn: 'WRN',
  error: 'ERR',
};

function formatTime(ts: number) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function LogItem({ entry }: { entry: LogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasContext = entry.context && Object.keys(entry.context).length > 0;

  return (
    <div
      className={`px-2.5 py-1.5 border-b border-[var(--border-soft)]/50 hover:bg-[var(--bg-card-soft)]/50 transition-colors ${
        entry.level === 'error' ? 'bg-[var(--accent-rose)]/5' : ''
      }`}
    >
      <div className="flex items-start gap-2 text-[11px] leading-relaxed">
        <span className="font-mono text-[var(--text-muted)] shrink-0 tabular-nums">
          {formatTime(entry.ts)}
        </span>
        <Chip tone={LEVEL_TONE[entry.level]} size="sm" className="shrink-0 !text-[9px] !px-1 !py-0">
          {LEVEL_LABEL[entry.level]}
        </Chip>
        <span className="text-[var(--accent-gold)]/80 shrink-0 font-medium">{entry.module}</span>
        <span className="text-[var(--text-primary)]/90 flex-1 min-w-0 break-words">{entry.message}</span>
        {hasContext && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] shrink-0"
          >
            {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
        )}
      </div>
      {expanded && hasContext && (
        <pre className="mt-1 ml-[88px] text-[10px] text-[var(--text-muted)] whitespace-pre-wrap break-all font-mono bg-[var(--bg-soft)] rounded p-1.5 max-h-[200px] overflow-y-auto">
          {JSON.stringify(entry.context, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function LogPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<LogLevel | 'all'>('all');

  const refresh = useCallback(() => {
    setLogs(getAllLogs());
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [refresh]);

  const handleClear = () => {
    clearLogs();
    refresh();
  };

  const filtered = filter === 'all' ? logs : logs.filter((l) => l.level === filter);
  const errorCount = logs.filter((l) => l.level === 'error').length;
  const warnCount = logs.filter((l) => l.level === 'warn').length;

  return (
    <div className="flex flex-col h-full">
      {/* 工具栏 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border-soft)] shrink-0">
        <Terminal size={14} className="text-[var(--accent-cyan)]" />
        <span className="font-display text-[13px] text-[var(--text-primary)]">运行日志</span>
        <Chip tone="mute" size="sm">{logs.length} 条</Chip>
        {errorCount > 0 && <Chip tone="rose" size="sm">{errorCount} 错误</Chip>}
        {warnCount > 0 && <Chip tone="gold" size="sm">{warnCount} 警告</Chip>}
        <div className="flex-1" />
        {/* 级别过滤 */}
        <div className="flex items-center gap-1">
          {(['all', 'info', 'warn', 'error'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                filter === f
                  ? 'bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {f === 'all' ? '全部' : LEVEL_LABEL[f]}
            </button>
          ))}
        </div>
        <button
          onClick={refresh}
          title="刷新"
          className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <RefreshCw size={13} />
        </button>
        <button
          onClick={handleClear}
          title="清空日志"
          className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--accent-rose)] transition-colors"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* 日志列表 */}
      <div className="flex-1 overflow-y-auto scroll-shadow">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[12px] text-[var(--text-muted)]">
            暂无日志。启动辩论后这里会显示运行轨迹。
          </div>
        ) : (
          <div>
            {filtered.map((entry) => (
              <LogItem key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
