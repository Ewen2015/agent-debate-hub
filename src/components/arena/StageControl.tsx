import { Lightbulb, Swords, Pause, Play, RotateCcw, FileText, Settings2, Users, Loader2, Sun, Moon, AlertCircle } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { Chip } from '@/components/shared/Chip';
import { useSessionStore } from '@/store/sessionStore';
import { useUIStore } from '@/store/staticStores';
import { useThemeStore } from '@/store/themeStore';
import { useGatewayStore } from '@/store/staticStores';
import { DebateEngine, validateLLMConfig } from '@/engine/DebateEngine';
import { ReportBuilder } from '@/engine/ReportBuilder';
import { useState } from 'react';

const getLLMConfig = () => {
  const store = useGatewayStore.getState();
  const cur = store.providers.find((p) => p.id === store.activeProviderId);
  if (!cur) return null;
  const envKey = (import.meta as any).env?.VITE_LLM_API_KEY as string | undefined;
  const envBase = (import.meta as any).env?.VITE_LLM_BASE_URL as string | undefined;
  const envModel = (import.meta as any).env?.VITE_LLM_MODEL as string | undefined;
  return {
    baseUrl: envBase || cur.baseUrl,
    apiKey: envKey || cur.apiKey,
    model: envModel || cur.model,
    temperature: cur.temperature,
    maxTokens: cur.maxTokens,
    enableSearch: cur.enableSearch,
  };
};

export function StageControl() {
  const session = useSessionStore((s) => s.session);
  const report = useSessionStore((s) => s.report);
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
    <div className="glass rounded-2xl px-5 py-3.5 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2 mr-2">
        <div className="w-1 h-7 bg-[var(--accent-gold)] rounded-full" />
        <div>
          <div className="font-display text-base text-[var(--text-primary)] leading-none">指挥台</div>
          <div className="text-[10px] tracking-widish uppercase text-[var(--text-muted)] mt-1">
            {phaseLabel}
          </div>
        </div>
      </div>

      <div className="h-7 w-px bg-[var(--border-soft)]" />

      {!llmReady && session.phase === 'idle' && (
        <div className="flex items-center gap-2 text-[11px] text-[var(--accent-rose)]/90 bg-[var(--accent-rose)]/10 rounded-lg px-3 py-1.5">
          <AlertCircle size={13} className="flex-shrink-0" />
          <span className="flex-1">未配置 LLM — 请在 Gateway 中填入 API Key</span>
          <button
            onClick={() => setGateway(true)}
            className="text-[10px] tracking-widish uppercase text-[var(--accent-rose)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0"
          >
            去配置 →
          </button>
        </div>
      )}

      {session.phase === 'idle' && !brainstormDone && (
        <Button
          variant="primary"
          size="md"
          icon={busy === 'brainstorm' ? <Loader2 size={14} className="animate-spin" /> : <Lightbulb size={14} />}
          onClick={handleStart}
          disabled={!canStart || !!busy || !llmReady}
        >
          开始 Brainstorm
        </Button>
      )}

      {session.phase === 'idle' && brainstormDone && (
        <>
          <Button
            variant="secondary"
            size="md"
            icon={<RotateCcw size={14} />}
            onClick={handleStart}
            disabled={!!busy}
            title="清空当前结果，重新做一轮 Brainstorm"
          >
            重新 Brainstorm
          </Button>
          <Button
            variant="primary"
            size="md"
            icon={busy === 'debate' ? <Loader2 size={14} className="animate-spin" /> : <Swords size={14} />}
            onClick={handleEnterDebate}
            disabled={!!busy || !llmReady}
          >
            进入 Debate →
          </Button>
          <Chip tone="gold">
            {session.speeches.filter((s) => s.round === 0).length} 个 brainstorm 观点已就绪
          </Chip>
        </>
      )}

      {isRunning && (
        <>
          {session.paused ? (
            <Button
              variant="primary"
              size="md"
              icon={<Play size={14} />}
              onClick={handleResume}
            >
              继续
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="md"
              icon={<Pause size={14} />}
              onClick={handlePause}
            >
              暂停
            </Button>
          )}
          <Button
            variant="danger"
            size="md"
            icon={<RotateCcw size={14} />}
            onClick={handleStop}
          >
            强制结束
          </Button>
        </>
      )}

      {session.phase !== 'idle' && (
        <Button
          variant="primary"
          size="md"
          icon={busy === 'report' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
          onClick={handleGenerate}
          disabled={session.speeches.length === 0 || !!busy}
        >
          {busy === 'report' ? '生成中' : '生成报告'}
        </Button>
      )}

      {session.phase === 'idle' && !brainstormDone && session.speeches.length > 0 && (
        <Button
          variant="secondary"
          size="md"
          icon={<RotateCcw size={14} />}
          onClick={handleReset}
        >
          清空
        </Button>
      )}

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <Chip tone="mute">
          R{Math.max(session.maxRounds, session.currentRound)}/{session.maxRounds}
        </Chip>
        <button
          onClick={toggleTheme}
          title={theme === 'light' ? '切换到深色' : '切换到浅色'}
          className="w-8 h-8 rounded-md border border-[var(--border-soft)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-strong)] text-[var(--text-soft)] hover:text-[var(--text-primary)] flex items-center justify-center transition-colors"
        >
          {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
        </button>
        <div className="hidden md:flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={<Users size={13} />}
            onClick={() => setRoster(true)}
          >
            Roster
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Settings2 size={13} />}
            onClick={() => setGateway(true)}
          >
            Gateway
          </Button>
        </div>
      </div>

      {report && session.phase === 'report' && (
        <Chip tone="gold">报告已就绪</Chip>
      )}
    </div>
  );
}
