import type { FinalReport, RosterAgent, Source, Speech } from '@/types';
import { resolvePersona } from '@/engine/MockLLM';
import { useRosterStore } from '@/store/staticStores';
import { chat, type LLMConfig, type ChatMessage } from '@/engine/LLMClient';

const personaName = (id: string): string => {
  if (id === 'human') return '人类主持人';
  if (id === 'system') return '系统';
  const a = useRosterStore.getState().agents.find((x) => x.id === id);
  if (!a) return '未名';
  return resolvePersona(a).name;
};

const stanceOf = (id: string) => {
  if (id === 'human' || id === 'system') return 'system' as const;
  const a = useRosterStore.getState().agents.find((x) => x.id === id);
  if (!a) return 'neutral' as const;
  return resolvePersona(a).stance;
};

interface ThemeGroup { theme: string; speeches: Speech[] }

const KEYWORD_CLUSTERS: { theme: string; pattern: RegExp }[] = [
  { theme: '机会与价值', pattern: /机会|价值|愿景|增长|护城河|优势|突破|长期|杠杆|收益|红利/ },
  { theme: '风险与边界', pattern: /风险|合规|失败|安全|代价|谨慎|止损|衰减|陷阱|下行/ },
  { theme: '用户与体验', pattern: /用户|体验|旅程|情感|场景|易用|故事|满意度|温度/ },
  { theme: '数据与证据', pattern: /数据|统计|指标|实验|样本|置信|回归|系数|趋势|规模/ },
  { theme: '战略与时机', pattern: /战略|竞品|生态|时机|博弈|格局|拐点|窗口|护城/ },
  { theme: '伦理与治理', pattern: /伦理|公平|隐私|权力|知情|监管|合规|可解释/ },
];

const cluster = (speeches: Speech[]): ThemeGroup[] => {
  const buckets: Record<string, Speech[]> = {};
  for (const c of KEYWORD_CLUSTERS) buckets[c.theme] = [];
  for (const s of speeches) {
    const lower = s.text;
    let placed = false;
    for (const c of KEYWORD_CLUSTERS) {
      if (c.pattern.test(lower)) {
        buckets[c.theme].push(s);
        placed = true;
        break;
      }
    }
    if (!placed) buckets['风险与边界'].push(s);
  }
  return KEYWORD_CLUSTERS.map((c) => ({ theme: c.theme, speeches: buckets[c.theme] })).filter(
    (g) => g.speeches.length > 0,
  );
};

const dedupStrings = (arr: string[]) => Array.from(new Set(arr));
const dedupSources = (arr: Source[]) => {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const s of arr) {
    if (!seen.has(s.url)) {
      seen.add(s.url);
      out.push(s);
    }
  }
  return out;
};

const buildTemplateReport = (
  sessionId: string,
  question: string,
  speeches: Speech[],
): FinalReport => {
  const debateSpeeches = speeches.filter((s) => s.round > 0);
  const groups = cluster(debateSpeeches);

  const arguments_ = groups.map((g) => {
    const supporters: string[] = [];
    const opposers: string[] = [];
    const evidence: Source[] = [];
    for (const sp of g.speeches) {
      const stance = stanceOf(sp.agentId);
      if (stance === 'pro') supporters.push(personaName(sp.agentId));
      else if (stance === 'con') opposers.push(personaName(sp.agentId));
      else supporters.push(personaName(sp.agentId));
      if (sp.sources) evidence.push(...sp.sources);
    }
    return {
      id: g.theme,
      point: `${g.theme}：${g.speeches.length} 位 Agent 的核心观察`,
      supporters: dedupStrings(supporters),
      opposers: dedupStrings(opposers),
      evidence: dedupSources(evidence),
    };
  });

  const totalAgents = useRosterStore.getState().agents.length;
  const thresholdSupport = Math.max(1, Math.round(totalAgents * 0.55));
  const thresholdOppose = Math.max(1, Math.round(totalAgents * 0.35));

  const consensus = arguments_
    .filter((a) => a.supporters.length >= thresholdSupport && a.opposers.length === 0)
    .map((a) => a.point);
  const disagreements = arguments_
    .filter((a) => a.opposers.length >= thresholdOppose)
    .map((a) => `「${a.point}」仍被 ${a.opposers.length} 位 Agent 反对`);

  if (consensus.length === 0)
    consensus.push('当前各论点均有反方声音，建议先收敛到 2-3 个最关键假设再决策。');
  if (disagreements.length === 0 && debateSpeeches.length > 0)
    disagreements.push('主要分歧已通过多轮辩论收敛，未出现强对抗。');

  const actions = [
    '在 2 周内发起一次 4 周有限实验，明确对照组与主要指标',
    '组织一次跨职能风险评估会，覆盖合规 / 安全 / 业务三方',
    '由数据导向的 Agent 主导产出 1 份"指标看板与决策阈值"',
    '建立每周一次的小时级议事回顾会',
  ];

  const tldr = `围绕「${question}」的多视角推演形成 ${consensus.length} 条共识与 ${disagreements.length} 处分歧。`;

  return {
    sessionId,
    generatedAt: Date.now(),
    tldr,
    consensus,
    disagreements,
    actions,
    arguments: arguments_,
  };
};

/**
 * 用真实 LLM 总结辩论内容。返回增强版 FinalReport。
 * 失败时回退到模板版。
 */
const buildLLMReport = async (
  base: FinalReport,
  question: string,
  speeches: Speech[],
  cfg: LLMConfig,
): Promise<FinalReport> => {
  const transcript = speeches
    .map((s) => {
      const name = personaName(s.agentId);
      const src = s.sources?.length ? `\n引用：${s.sources.map((x) => x.title).join('；')}` : '';
      return `【${s.round === 0 ? 'Brainstorm' : `R${s.round}`} · ${name}】\n${s.text}${src}`;
    })
    .join('\n\n');

  const sysPrompt = `你是资深议事总结者。请根据下方多 Agent 辩论记录，输出结构化 JSON。`;

  const userPrompt = `议题：「${question}」

以下是议事厅完整记录：

${transcript}

请输出严格 JSON（不要用 markdown 代码块包裹），结构：
{
  "tldr": "1-2 句 TL;DR 总结",
  "consensus": ["共识 1", "共识 2", ...],
  "disagreements": ["分歧 1（含哪两位谁反对谁）", ...],
  "actions": ["行动建议 1", "行动建议 2", ...]
}

要求：
- consensus 仅写全场公认无争议的结论
- disagreements 必须包含具体是谁反对什么
- actions 可落地、含时间窗口
- 用中文，简洁有力`;

  const messages: ChatMessage[] = [
    { role: 'system', content: sysPrompt },
    { role: 'user', content: userPrompt },
  ];
  const resp = await chat(cfg, messages, { signal: new AbortController().signal });
  const text = resp.content;
  // 提取 JSON
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return base;
  try {
    const parsed = JSON.parse(match[0]);
    return {
      ...base,
      tldr: parsed.tldr || base.tldr,
      consensus: Array.isArray(parsed.consensus) ? parsed.consensus : base.consensus,
      disagreements: Array.isArray(parsed.disagreements) ? parsed.disagreements : base.disagreements,
      actions: Array.isArray(parsed.actions) ? parsed.actions : base.actions,
    };
  } catch {
    return base;
  }
};

export const ReportBuilder = {
  async build(
    args: { sessionId: string; question: string; speeches: Speech[] },
    cfg?: LLMConfig | null,
  ): Promise<FinalReport> {
    const base = buildTemplateReport(args.sessionId, args.question, args.speeches);
    if (!cfg || !cfg.apiKey) return base;
    try {
      return await buildLLMReport(base, args.question, args.speeches, cfg);
    } catch {
      return base;
    }
  },

  buildSync(
    args: { sessionId: string; question: string; speeches: Speech[] },
  ): FinalReport {
    return buildTemplateReport(args.sessionId, args.question, args.speeches);
  },

  toMarkdown(report: FinalReport, question: string): string {
    const lines: string[] = [];
    lines.push(`# 议事厅最终报告`);
    lines.push('');
    lines.push(`> 议题：${question}`);
    lines.push(`> 生成时间：${new Date(report.generatedAt).toLocaleString()}`);
    lines.push('');
    lines.push(`## TL;DR`);
    lines.push(report.tldr);
    lines.push('');
    lines.push(`## 共识点 (${report.consensus.length})`);
    report.consensus.forEach((c, i) => lines.push(`${i + 1}. ${c}`));
    lines.push('');
    lines.push(`## 关键分歧 (${report.disagreements.length})`);
    report.disagreements.forEach((d, i) => lines.push(`${i + 1}. ${d}`));
    lines.push('');
    lines.push(`## 论点明细`);
    report.arguments.forEach((a) => {
      lines.push(`### ${a.point}`);
      lines.push(`- **支持**：${a.supporters.join('、') || '无'}`);
      lines.push(`- **反对**：${a.opposers.join('、') || '无'}`);
      if (a.evidence.length) {
        lines.push(`- **证据**：`);
        a.evidence.forEach((e) => lines.push(`  - [${e.title}](${e.url}) — _${e.domain}_`));
      }
      lines.push('');
    });
    lines.push(`## 行动建议`);
    report.actions.forEach((a, i) => lines.push(`${i + 1}. ${a}`));
    lines.push('');
    return lines.join('\n');
  },
};
