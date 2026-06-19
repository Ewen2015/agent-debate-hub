import { Lightbulb, Swords, Pause, Play, RotateCcw, FileText, Settings2, Users, Loader2, Sun, Moon, AlertCircle, Plus } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { Chip } from '@/components/shared/Chip';
import { useSessionStore } from '@/store/sessionStore';
import { useUIStore } from '@/store/staticStores';
import { useThemeStore } from '@/store/themeStore';
import { DebateEngine, validateLLMConfig } from '@/engine/DebateEngine';
import { resolveLLMConfig } from '@/engine/LLMConfig';
import { ReportBuilder } from '@/engine/ReportBuilder';
import { useState } from 'react';

const getLLMConfig = () => {
  return resolveLLMConfig();
};

export function StageControl() {
  const session = useSessionStore((s) => s.session);
  const report = useSessionStore((s) => s.report);
  const createChannel = useSessionStore((s) => s.createChannel);
  const setRoster = useUIStore((s) => s.setRosterDrawer);
  const setGateway = useUIStore((s) => s.setGatewayDrawer);
  const setReportDrawer = useUIStore((s) => s.setReportDrawer);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const [busy, setBusy] = useState<string | null>(null);

  const canStart = session.question.trim().length > 4 && session.phase === 'idle';
  const brainstormDone = session.phase === 'idle' && session.speeches.some((s) => s.round === 0);
  const isRunning = session.phase === 'brainstorm' || session.phase === 'debate';
  const llmCheck = validateLLMConfig();
  const llmReady = llmCheck.ok;

  const handleStart = async () => {
    if (!canStart) return;
    setBusy('brainstorm');
    try {
      await DebateEngine.startBrainstorm();
    } finally {
      setBusy(null);
    }
  };

  const handleEnterDebate = async () => {
    setBusy('debate');
    try {
      await DebateEngine.enterDebate();
    } finally {
      setBusy(null);
    }
  };

  const handlePause = () => DebateEngine.pause();
  const handleResume = () => DebateEngine.resume();
  const handleStop = () => DebateEngine.stop();

  const handleGenerate = async () => {
    if (session.speeches.length === 0) return;
    setBusy('report');
    try {
      const r = await ReportBuilder.build(
        { sessionId: session.id, question: session.question, speeches: session.speeches },
        getLLMConfig(),
      );
      useSessionStore.getState().setReport(r);
      useSessionStore.getState().setPhase('report');
      setReportDrawer(true);
    } catch (e: any) {
      useSessionStore.getState().pushEvent({
        id: 'sys-' + Date.now(),
        ts: Date.now(),
        agentId: 'system',
        type: 'system',
        payload: { text: `报告生成失败：${e?.message || '未知错误'}` },
      });
    } finally {
      setBusy(null);
    }
  };

  const handleReset = () => {
    DebateEngine.stop();
    useSessionStore.getState().reset();
  };

  const phaseLabel = (() => {
    if (session.phase === 'idle') {
      return brainstormDone ? 'Brainstorm 已就绪 · 可进入 Debate' : '待开始';
    }
    if (session.phase === 'brainstorm') {
      return session.paused ? '已暂停 · Brainstorm' : 'Brainstorm 进行中';
    }
    if (session.phase === 'debate') {
      return session.paused
        ? '已暂停 · Debate'
        : `Debate 进行中 · R${session.currentRound}/${session.maxRounds}`;
    }
    return '报告已生成';
  })();

  return (
    <div className="glass rounded-2xl px-2.5 py-2 flex flex-wrap items-center gap-1.5 text-[12px]">
      <div className="flex items-start gap-1.5 mr-2 min-w-[160px]">
        <div className="w-1.5 h-6 bg-[var(--accent-gold)] rounded-full mt-1" />
        <div>
          <div className="font-display text-xs text-[var(--text-primary)] leading-none">指挥台</div>
          <div className="text-[9px] uppercase tracking-widish text-[var(--text-muted)] mt-0.5">
            {phaseLabel}
          </div>
        </div>
      </div>

      <div className="h-4 w-px bg-[var(--border-soft)]" />

      {!llmReady && session.phase === 'idle' && (
        <div className="flex items-center gap-2 text-[10.5px] text-[var(--accent-rose)]/90 bg-[var(--accent-rose)]/10 rounded-lg px-2.5 py-1">
          <AlertCircle size={13} className="flex-shrink-0" />
          <span className="flex-1">未配置 LLM — 请在 Gateway 中填入 API Key</span>
          <button
            onClick={() => setGateway(true)}
            className="text-[9px] tracking-widish uppercase text-[var(--accent-rose)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0"
          >
            去配置 →
          </button>
        </div>
      )}

      {session.phase === 'idle' && !brainstormDone && (
        <Button
          variant="primary"
          size="sm"
          icon={busy === 'brainstorm' ? <Loader2 size={14} className="animate-spin" /> : <Lightbulb size={14} />}
          onClick={handleStart}
          disabled={!canStart || !!busy || !llmReady}
        >
          启动
        </Button>
      )}

      {session.phase === 'idle' && brainstormDone && (
        <>
          <Button
            variant="secondary"
            size="sm"
            icon={<RotateCcw size={14} />}
            onClick={handleStart}
            disabled={!!busy}
            title="清空当前结果，重新做一轮 Brainstorm"
          >
            重新
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={busy === 'debate' ? <Loader2 size={14} className="animate-spin" /> : <Swords size={14} />}
            onClick={handleEnterDebate}
            disabled={!!busy || !llmReady}
          >
            Debate
          </Button>
          <Chip tone="gold" size="sm">
            {session.speeches.filter((s) => s.round === 0).length} 条观点
          </Chip>
        </>
      )}

      {isRunning && (
        <>
          {session.paused ? (
            <Button
              variant="primary"
              size="sm"
              icon={<Play size={14} />}
              onClick={handleResume}
            >
              继续
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              icon={<Pause size={14} />}
              onClick={handlePause}
            >
              暂停
            </Button>
          )}
          <Button
            variant="danger"
            size="sm"
            icon={<RotateCcw size={14} />}
            onClick={handleStop}
          >
            结束
          </Button>
        </>
      )}

      {session.phase !== 'idle' && (
        <Button
          variant="primary"
          size="sm"
          icon={busy === 'report' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
          onClick={handleGenerate}
          disabled={session.speeches.length === 0 || !!busy}
        >
          报告
        </Button>
      )}

      {session.phase === 'idle' && (
        <Button
          variant="secondary"
          size="sm"
          icon={<Plus size={14} />}
          onClick={createChannel}
          disabled={!!busy}
        >
          新建频道
        </Button>
      )}

      {session.phase === 'idle' && !brainstormDone && session.speeches.length > 0 && (
        <Button
          variant="secondary"
          size="sm"
          icon={<RotateCcw size={14} />}
          onClick={handleReset}
        >
          清空
        </Button>
      )}

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <Chip tone="mute" size="sm">
          R{Math.max(session.maxRounds, session.currentRound)}/{session.maxRounds}
        </Chip>
        <button
          onClick={toggleTheme}
          title={theme === 'light' ? '切换到深色' : '切换到浅色'}
          className="w-8 h-8 rounded-md border border-[var(--border-soft)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-strong)] text-[var(--text-soft)] hover:text-[var(--text-primary)] flex items-center justify-center transition-colors"
        >
          {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
        </button>
        <div className="hidden md:flex items-center gap-1">
          <button
            type="button"
            onClick={() => setRoster(true)}
            className="rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card)] px-2 py-1 text-[10px] text-[var(--text-primary)] hover:bg-[var(--bg-card-strong)] transition-colors"
          >
            Roster
          </button>
          <button
            type="button"
            onClick={() => setGateway(true)}
            className="rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card)] px-2 py-1 text-[10px] text-[var(--text-primary)] hover:bg-[var(--bg-card-strong)] transition-colors"
          >
            Gateway
          </button>
        </div>
      </div>

      {report && session.phase === 'report' && (
        <Chip tone="gold">报告已就绪</Chip>
      )}
    </div>
  );
}
