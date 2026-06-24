import type { FinalReport, RosterAgent, RoundSummary, Source, Speech } from '@/types';
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
  roundSummaries: RoundSummary[] = [],
): FinalReport => {
  const debateSpeeches = speeches.filter((s) => s.round > 0);
  const groups = cluster(debateSpeeches);

  const arguments_ = groups.map((g) => {
    const supporters: string[] = [];
    const opposers: string[] = [];
    const evidence: Source[] = [];
    const proTexts: string[] = [];
    const conTexts: string[] = [];

    for (const sp of g.speeches) {
      const stance = stanceOf(sp.agentId);
      const name = personaName(sp.agentId);
      if (stance === 'pro') {
        supporters.push(name);
        proTexts.push(sp.text);
      } else if (stance === 'con') {
        opposers.push(name);
        conTexts.push(sp.text);
      } else {
        supporters.push(name);
      }
      if (sp.sources) evidence.push(...sp.sources);
    }

    const proExcerpt = proTexts[0]?.split(/。|！|？/)[0]?.trim();
    const conExcerpt = conTexts[0]?.split(/。|！|？/)[0]?.trim();
    const snippets: string[] = [];
    if (proExcerpt) snippets.push(`支持方认为“${proExcerpt}”`);
    if (conExcerpt) snippets.push(`反对方认为“${conExcerpt}”`);
    const point = snippets.length
      ? `${g.theme}：${snippets.join('，')}`
      : `${g.theme}：该主题下出现了 ${g.speeches.length} 条不同观点。`;

    return {
      id: g.theme,
      point,
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
    .map((a) => {
      const detail = a.point.split('：').slice(1).join('：');
      return `多数参与者在「${a.id}」上达成共识，核心观点为「${detail}」。`;
    });
  const disagreements = arguments_
    .filter((a) => a.supporters.length > 0 && a.opposers.length > 0)
    .map((a) => {
      const detail = a.point.split('：').slice(1).join('：');
      return `在「${a.id}」上，支持方与反对方围绕「${detail}」存在明显分歧。`;
    });

  if (consensus.length === 0)
    consensus.push('当前各论点尚未出现无异议的一致结论，建议先收敛到 2-3 个最关键假设再决策。');
  if (disagreements.length === 0 && debateSpeeches.length > 0)
    disagreements.push('目前分歧较少，主要观点已趋于收敛。');

  const themes = groups.map((g) => g.theme).join('、');
  const summary = `本次讨论围绕「${question}」展开，触及 ${themes} 等核心维度。支持方侧重于机会和价值，反对方更多强调风险与成本，讨论已开始形成可继续验证的假设。`;
  const evaluation: string[] = [];
  if (consensus.length > 0) {
    evaluation.push(`讨论中已有 ${consensus.length} 条议题出现明显一致点，可作为下一步方案设计的基础。`);
  }
  if (disagreements.length > 0) {
    evaluation.push(`仍存在 ${disagreements.length} 处核心分歧，建议优先针对这些观点进行量化验证。`);
  } else {
    evaluation.push('当前分歧较少，讨论已朝向共识方向收敛，适合进入落地评估阶段。');
  }
  if (debateSpeeches.length < 4) {
    evaluation.push('当前讨论样本偏少，后续可补充更多事实与证据，以提升判断可靠性。');
  }
  if (groups.some((g) => g.theme === '风险与边界')) {
    evaluation.push('反对方对“风险与边界”提出了明确担忧，需避免过早忽略潜在负面影响。');
  }

  const actions = [
    '在 1 周内整理出“主要共识点”和“核心分歧点”，形成一页决策备忘。',
    '组织一次跨部门评审会，邀请支持方说明收益假设，邀请反对方说明风险边界。',
    '针对已有证据最多的观点，补充 1-2 个可量化指标，明确验证标准。',
    '将两处及以上关键分歧转化为可验证假设，并在下一次评审前完成验证方案。',
  ];

  const convRounds = roundSummaries.filter((rs) => typeof rs.convergence === 'number');
  let convDesc = '';
  if (convRounds.length >= 2) {
    const initial = convRounds[0].convergence;
    const final = convRounds[convRounds.length - 1].convergence;
    const delta = final - initial;
    const trend = delta > 0.08 ? '上升' : delta < -0.08 ? '下降' : '基本持平';
    convDesc = `经 ${convRounds.length} 轮辩论，收敛度从 ${(initial * 100).toFixed(0)}% ${trend}至 ${(final * 100).toFixed(0)}%，`;
  } else if (convRounds.length === 1) {
    convDesc = `本轮收敛度为 ${(convRounds[0].convergence * 100).toFixed(0)}%，`;
  }
  const tldr = `围绕「${question}」，${convDesc}讨论形成 ${consensus.length} 条共识，同时存在 ${disagreements.length} 处分歧，需要围绕风险与收益进一步验证。`;

  return {
    sessionId,
    generatedAt: Date.now(),
    tldr,
    summary,
    evaluation,
    consensus,
    disagreements,
    actions,
    arguments: arguments_,
    roundSummaries,
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

  const convRounds = (base.roundSummaries || []).filter((rs) => typeof rs.convergence === 'number');
  let convergenceInfo = '';
  if (convRounds.length >= 2) {
    const initial = convRounds[0].convergence;
    const final = convRounds[convRounds.length - 1].convergence;
    const delta = final - initial;
    const trend = delta > 0.08 ? '上升' : delta < -0.08 ? '下降' : '基本持平';
    convergenceInfo = `\n收敛数据：经 ${convRounds.length} 轮辩论，收敛度从 ${(initial * 100).toFixed(0)}% ${trend}至 ${(final * 100).toFixed(0)}%（0=发散，1=收敛）。\n`;
  } else if (convRounds.length === 1) {
    convergenceInfo = `\n收敛数据：本轮收敛度为 ${(convRounds[0].convergence * 100).toFixed(0)}%（0=发散，1=收敛）。\n`;
  }

  const sysPrompt = `你是资深议事总结者，擅长将多方议论转化为可执行的报告。请根据下方多 Agent 辩论记录，输出结构化 JSON。`;

  const userPrompt = `议题：「${question}」

以下是议事厅完整记录：

${transcript}
${convergenceInfo}
请输出严格 JSON（不要用 markdown 代码块包裹），结构：
{
  "tldr": "1-2 句 TL;DR 总结，须包含收敛度变化情况",
  "summary": "1-2 句对讨论内容与辩论观点的综合概括",
  "consensus": ["共识 1", "共识 2", ...],
  "disagreements": ["分歧 1（含支持方或反对方的观点）", ...],
  "evaluation": ["简要评述 1", "简要评述 2"],
  "actions": ["行动建议 1", "行动建议 2", ...]
}

要求：
- tldr 须简要概述本次辩论的收敛情况（收敛度变化趋势），并结合共识与分歧数量给出整体判断
- summary 要直接概括讨论中的核心观点和各方立场，不要只写结构性说明
- consensus 仅写全场公认无争议的结论
- disagreements 必须包含具体观点差异和立场对立，不要泛泛而谈
- evaluation 需给出简明评述，指出讨论亮点和风险
- actions 要可落地、含时间窗口，如"1 周内""下周""3 个工作日内"
- 避免常见模板语句，尽量贴合具体发言内容
- 只输出 JSON，且不要解释过程`;

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
      summary: typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary : base.summary,
      evaluation: Array.isArray(parsed.evaluation) && parsed.evaluation.length ? parsed.evaluation : base.evaluation,
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
    args: { sessionId: string; question: string; speeches: Speech[]; roundSummaries?: RoundSummary[] },
    cfg?: LLMConfig | null,
  ): Promise<FinalReport> {
    const base = buildTemplateReport(args.sessionId, args.question, args.speeches, args.roundSummaries);
    if (!cfg || !cfg.apiKey) return base;
    try {
      return await buildLLMReport(base, args.question, args.speeches, cfg);
    } catch {
      return base;
    }
  },

  buildSync(
    args: { sessionId: string; question: string; speeches: Speech[]; roundSummaries?: RoundSummary[] },
  ): FinalReport {
    return buildTemplateReport(args.sessionId, args.question, args.speeches, args.roundSummaries);
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
    lines.push(`## 总结与评述`);
    lines.push(report.summary);
    report.evaluation.forEach((line) => lines.push(`- ${line}`));
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
    if (report.roundSummaries && report.roundSummaries.length) {
      lines.push(`## 观点演进 (${report.roundSummaries.length})`);
      report.roundSummaries.forEach((rs) => {
        lines.push(`### ${rs.title}`);
        lines.push(`- 本轮总结：${rs.digest}`);
        if (typeof rs.convergence === 'number') {
          lines.push(`- 议题收敛度：${(rs.convergence * 100).toFixed(0)}%`);
        }
        rs.viewpoints.forEach((v) => {
          lines.push(`- **${v.name}**（${v.stance}）：${v.viewpoint}${v.evidenceCount ? `（${v.evidenceCount} 证据）` : ''}`);
        });
        lines.push('');
      });
      const conv = report.roundSummaries
        .filter((rs) => typeof rs.convergence === 'number')
        .map((rs) => `${rs.title}: ${(rs.convergence! * 100).toFixed(0)}%`);
      if (conv.length) {
        lines.push(`## 议题收敛曲线`);
        lines.push(conv.join('  →  '));
        lines.push('');
      }
    }
    lines.push(`## 行动建议`);
    report.actions.forEach((a, i) => lines.push(`${i + 1}. ${a}`));
    lines.push('');
    return lines.join('\n');
  },

  /**
   * 生成自包含 HTML 报告（内联 CSS + SVG 收敛曲线），离线打开样式完整。
   */
  toHTML(report: FinalReport, question: string): string {
    const esc = (s: string) =>
      (s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    const stanceLabel = { pro: '支持', con: '反对', neutral: '中立' } as const;
    const stanceColor = { pro: '#B8A878', con: '#D08877', neutral: '#6FB3A8' } as const;

    const convergenceSVG = (() => {
      const pts = (report.roundSummaries || []).filter((rs) => typeof rs.convergence === 'number');
      if (pts.length === 0) return '';
      const W = 520, H = 160, padX = 40, padTop = 18, padBottom = 34;
      const innerW = W - padX - 16, innerH = H - padTop - padBottom;
      const x = (i: number) => padX + (pts.length === 1 ? innerW / 2 : (i / (pts.length - 1)) * innerW);
      const y = (v: number) => padTop + (1 - v) * innerH;
      const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.convergence!).toFixed(1)}`).join(' ');
      const areaD = `${pathD} L ${x(pts.length - 1).toFixed(1)} ${(padTop + innerH).toFixed(1)} L ${x(0).toFixed(1)} ${(padTop + innerH).toFixed(1)} Z`;
      const grid = [0, 0.5, 1].map((g) => `
        <line x1="${padX}" x2="${W - 16}" y1="${y(g)}" y2="${y(g)}" stroke="#ddd" stroke-width="1" ${g === 0 || g === 1 ? '' : 'stroke-dasharray="3 3"'} />
        <text x="${padX - 6}" y="${y(g) + 3}" text-anchor="end" font-size="9" fill="#888">${g.toFixed(1)}</text>`).join('');
      const dots = pts.map((p, i) => `
        <circle cx="${x(i)}" cy="${y(p.convergence!)}" r="3" fill="#B8A878" stroke="#fff" stroke-width="1.5" />
        <text x="${x(i)}" y="${y(p.convergence!) - 7}" text-anchor="middle" font-size="9" font-weight="600" fill="#333">${(p.convergence! * 100).toFixed(0)}%</text>
        <text x="${x(i)}" y="${H - 10}" text-anchor="middle" font-size="8.5" fill="#888">${esc(p.title)}</text>`).join('');
      return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;font-family:inherit;font-size:9px">${grid}<path d="${areaD}" fill="#B8A878" opacity="0.1" /><path d="${pathD}" fill="none" stroke="#B8A878" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />${dots}</svg>`;
    })();

    const args = report.arguments
      .map((a) => `
      <div class="arg">
        <h3>${esc(a.point)}</h3>
        <p>支持：${esc(a.supporters.join('、')) || '无'}　|　反对：${esc(a.opposers.join('、')) || '无'}</p>
        ${a.evidence.length ? `<ul>${a.evidence.map((e) => `<li><a href="${esc(e.url)}" target="_blank">${esc(e.title)}</a> <span class="domain">${esc(e.domain)}</span></li>`).join('')}</ul>` : ''}
      </div>`)
      .join('');

    const rounds = (report.roundSummaries || [])
      .map((rs) => `
      <div class="round">
        <h3>${esc(rs.title)}</h3>
        <p class="digest">${esc(rs.digest)}</p>
        ${typeof rs.convergence === 'number' ? `<p class="conv">议题收敛度：${(rs.convergence * 100).toFixed(0)}%</p>` : ''}
        <ul class="viewpoints">
          ${rs.viewpoints.map((v) => `<li><span class="bar" style="background:${stanceColor[v.stance]}"></span><b>${esc(v.name)}</b>（${stanceLabel[v.stance]}）：${esc(v.viewpoint)}${v.evidenceCount ? `<span class="evi">· ${v.evidenceCount} 证据</span>` : ''}</li>`).join('')}
        </ul>
      </div>`)
      .join('');

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>议事厅最终报告 — ${esc(question)}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; max-width: 820px; margin: 32px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.7; background: #fff; }
  h1 { font-size: 22px; border-bottom: 2px solid #B8A878; padding-bottom: 8px; }
  h2 { font-size: 16px; margin-top: 28px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
  h3 { font-size: 14px; margin: 14px 0 6px; }
  .meta { color: #888; font-size: 12px; margin: 4px 0; }
  .tldr { background: #faf7f0; border-left: 3px solid #B8A878; padding: 10px 14px; border-radius: 4px; font-size: 14px; }
  ul, ol { padding-left: 22px; font-size: 13px; }
  li { margin: 4px 0; }
  .arg { background: #fafafa; border: 1px solid #eee; border-radius: 8px; padding: 12px 16px; margin: 10px 0; }
  .arg a, .domain { font-size: 12px; }
  .arg a { color: #2C5F5D; }
  .domain { color: #aaa; margin-left: 4px; text-transform: uppercase; }
  .round { background: #fafafa; border: 1px solid #eee; border-radius: 8px; padding: 12px 16px; margin: 10px 0; }
  .digest { font-size: 13px; color: #333; }
  .conv { font-size: 12px; color: #B8A878; font-weight: 600; }
  .viewpoints { list-style: none; padding-left: 0; }
  .viewpoints li { position: relative; padding-left: 14px; font-size: 13px; }
  .viewpoints .bar { position: absolute; left: 0; top: 7px; width: 3px; height: 14px; border-radius: 2px; }
  .evi { color: #2C5F5D; font-size: 11px; margin-left: 4px; }
  .chart { margin: 10px 0; }
  .legend { font-size: 12px; color: #888; margin-bottom: 6px; }
</style>
</head>
<body>
  <h1>议事厅最终报告</h1>
  <p class="meta">议题：${esc(question)}</p>
  <p class="meta">生成时间：${esc(new Date(report.generatedAt).toLocaleString())}</p>

  <h2>TL;DR</h2>
  <div class="tldr">${esc(report.tldr)}</div>

  <h2>总结与评述</h2>
  <p>${esc(report.summary)}</p>
  <ul>${report.evaluation.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>

  <h2>共识点（${report.consensus.length}）</h2>
  <ol>${report.consensus.map((c) => `<li>${esc(c)}</li>`).join('')}</ol>

  <h2>关键分歧（${report.disagreements.length}）</h2>
  <ol>${report.disagreements.map((d) => `<li>${esc(d)}</li>`).join('')}</ol>

  <h2>论点明细</h2>
  ${args || '<p>无</p>'}

  ${report.roundSummaries && report.roundSummaries.length ? `<h2>观点演进（${report.roundSummaries.length}）</h2>${rounds}` : ''}

  ${convergenceSVG ? `<h2>议题收敛曲线</h2><div class="legend">0（发散）→ 1（收敛）</div><div class="chart">${convergenceSVG}</div>` : ''}

  <h2>行动建议</h2>
  <ol>${report.actions.map((a) => `<li>${esc(a)}</li>`).join('')}</ol>
</body>
</html>`;
  },
};
