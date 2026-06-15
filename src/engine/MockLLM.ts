import type { AgentStance, Persona, RosterAgent, Source } from '@/types';
import { PERSONA_BY_ID } from '@/data/personas';
import { SEARCH_CORPUS } from '@/data/corpus';

const rand = (min: number, max: number) => Math.random() * (max - min) + min;
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const pickN = <T,>(arr: T[], n: number): T[] => {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
};

export interface BrainstormArgs {
  agent: RosterAgent;
  persona: Persona;
  question: string;
  priorIdeas: string[];
  interrupts: string[];
}

const STANCE_FLAVOR: Record<AgentStance, { openings: string[]; closers: string[] }> = {
  pro: {
    openings: [
      '我想从一个比较积极的视角切入——',
      '如果允许我更乐观地看这个问题——',
      '支持这个方向有一个我比较在意的论据——',
    ],
    closers: ['这其实是一个被低估的机会窗口。', '我建议先小步试错。'],
  },
  con: {
    openings: [
      '请允许我扮演一下"魔鬼代言人"——',
      '我看到的风险可能比表面更明显——',
      '我有一个不太舒服的反对意见——',
    ],
    closers: ['我们至少要回答"如果错了怎么办"再继续。'],
  },
  neutral: {
    openings: [
      '让我先把问题拆开看看——',
      '如果我们更结构化地讨论——',
      '先定义清楚几件事再下判断——',
    ],
    closers: ['我倾向于在更多数据后再给结论。'],
  },
};

const TONE_FLAVOR: Record<string, string[]> = {
  激昂: ['我必须说，这个方向让人兴奋。', '如果我们只算短期账，会错失真正的杠杆。'],
  诗意: ['想象一个十年后的版本，再回头看今天的选择。', '愿景不是装饰品，是产品的一部分。'],
  冷静: ['让我列举三个具体问题。', '请允许我先放几个数字。'],
  尖锐: ['这听起来更像是 PPT 故事而不是证据。', '我们真的验证过这个假设吗？'],
  反问: ['那如果失败呢？', '谁为这个决定的下游付钱？', '这是观点还是结论？'],
  精确: ['拆解到子任务 #2 这里有个隐藏依赖。', '技术栈里 X 与 Y 互不兼容。'],
  务实: ['理论之外还要看运维成本。', '这是"看起来能做"和"真的能持续做"的差距。'],
  数字: ['样本量 32 太小，置信区间宽到没用。', '回归系数 0.18，p 值 0.03，能说"显著"但说"巨大"不严谨。'],
  列表: ['至少三件事我关心：', '我先抛出四个角度。'],
  假设: ['想象监管突然收紧 30%。', '如果供应链断 3 个月呢？'],
  列举: ['风险清单很长，我点几个最关键的。', '我先列出对个人 / 团队 / 公司三层的代价。'],
  格局: ['如果我们用十年视角——', '历史上类似的拐点通常长这样：'],
  隐喻: ['这像极了 2007 年的智能手机之争。', '生态战的胜负往往在标准之争。'],
  严肃: ['请允许我引用一个原则：', '这里我必须严肃地提一个问题。'],
  引用: ['Carnegie 那份报告里有一句话很贴切。', 'OECD 在 2024 年的指引里提过类似原则。'],
  案例: ['三年前某家公司的教训是——', '我看到一个高度相似的反面案例。'],
  共情: ['想象一个 30 岁的运营小李打开后台——', '他最关心的不是模型指标，是少加班。'],
  形象: ['就像走进一家餐厅，前 3 秒就决定会不会再来。', '用户的心智不是 Excel。'],
  故事: [
    '我想到一个真实场景：',
    '我前同事的产品踩过这个坑——',
  ],
};

const SKELETON_BRAINSTORM: string[] = [
  '我关心的是{topic}在{domain}语境下的{angle}。',
  '如果我们把{topic}放进一个{timeframe}周期里，会发现{angle}是被低估的变量。',
  '支持{topic}的关键证据来自{evidence}。',
  '我倾向于把{topic}视为{metaphor}。',
  '一个反直觉的观察：{topic}在{small_group}里的影响远大于在大盘里。',
  '我想强调"谁受益、谁承担成本"是评估{topic}时最容易遗漏的一步。',
];

const SKELETON_DEBATE_PRO: string[] = [
  '我先亮明观点：{topic}在{context}下值得推进。我的依据有三层。',
  '从{angle}看，{topic}的边际收益仍然高于替代方案。',
  '请允许我引用一组数据：{evidence}。这说明正向预期是有支撑的。',
  '我不否认{opposing_point}的存在，但{rebuttal}。',
  '如果不抓住现在的窗口，{opportunity_cost}会让我们两年后回头后悔。',
];

const SKELETON_DEBATE_CON: string[] = [
  '我必须先摆出最坏情形：{opposing_point}。',
  '请允许我质疑前提：{challenge}。',
  '我们在评估{topic}时，对{evidence}这类数据存在选择性引用。',
  '在{context}下，{topic}的隐性成本被系统性低估了。',
  '退一万步讲，{rebuttal}——这意味着我们连"安全网"都没有。',
];

const SKELETON_DEBATE_NEUTRAL: string[] = [
  '我把双方观点拆成{angle1}和{angle2}两个维度。',
  '从{evidence}的数据看，{topic}的真实效果介于{lo}和{hi}之间。',
  '我建议引入{constraint}作为决策门槛。',
  '如果我们定义清楚"成功"的含义，{topic}是否值得推进就有了客观答案。',
  '我倾向于先做一个 4 周的有限实验，回答{pivot_question}。',
];

const VARS: Record<string, string[]> = {
  topic: ['这个议题', '该方案', '这条路径', '当前策略'],
  domain: ['企业级 AI', '消费产品', '组织治理', '公共政策'],
  angle: ['外部性', '长期回报', '组织摩擦', '认知偏差'],
  timeframe: ['12 个月', '3 年', '一个完整经济周期', '5 年'],
  evidence: ['麦肯锡 2026 报告', 'Nature 群体极化研究', 'MIT Sloan 决策研究', 'HBR 对抗式团队实验'],
  metaphor: ['一把双刃剑', '一场马拉松的拐点', '一次生态位的卡位', '一个被高估的概念'],
  small_group: ['早期采用者', '高敏感用户', '创始团队 8 人', '重度使用场景'],
  context: ['中型组织', '跨国合规环境', '资源受限团队', '高不确定性市场'],
  opportunity_cost: ['竞品的反超', '用户习惯被锁定', '组织学习曲线的中断', '标准之争的失语'],
  opposing_point: ['边际成本失控', '合规风险', '组织疲劳', '认知锚定'],
  rebuttal: ['我们已经有 mitigation 计划', '在 4 周内可以验证', '可分阶段退守', '有明确止损线'],
  challenge: ['"愿景"是否被数据支撑', '"长期价值"是否经得起贴现', '"用户价值"是真实需求还是被诱导'],
  constraint: ['实验组 N>200 的 p 值', '可解释性报告', '季度回顾节点', '人工最终介入权'],
  angle1: ['短期 ROI', '长期能力建设'],
  angle2: ['组织风险', '外部竞争压力'],
  lo: ['不显著的提升', '小幅的负向', '持平基线'],
  hi: ['中等正向收益', '结构性优势', '颠覆性窗口'],
  pivot_question: ['谁先走通 PMF', '假设是否可证伪', '核心指标是否定义正确'],
};

function fillTemplate(tpl: string): string {
  return tpl.replace(/\{(\w+)\}/g, (_, key) => {
    const pool = VARS[key];
    return pool ? pick(pool) : key;
  });
}

function applyTone(text: string, toneTags: string[]): string {
  const t = pick(toneTags);
  if (TONE_FLAVOR[t]) {
    return text + ' ' + pick(TONE_FLAVOR[t]);
  }
  return text;
}

export function pickToneTags(tone: string): string[] {
  return tone
    .split(/[·、，,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export const MockLLM = {
  delay: () => new Promise<void>((res) => setTimeout(res, rand(600, 1500))),

  async brainstorm({ agent, persona, question, priorIdeas, interrupts }: BrainstormArgs): Promise<string> {
    await this.delay();
    const stanceFlavor = STANCE_FLAVOR[persona.stance];
    const toneTags = pickToneTags(persona.tone);

    const opener = pick(stanceFlavor.openings);
    const closer = pick(stanceFlavor.closers);

    const base = pick(SKELETON_BRAINSTORM);
    const point = fillTemplate(base);
    const decorated = applyTone(point, toneTags);

    const distinct = `「${persona.name}」视角：${decorated}`;

    const personalize = [
      `我特别在意 ${persona.focus[0]} 与 ${persona.focus[1] || '相关上下文'}。`,
      `作为 ${persona.name}，我会先问自己：${pick(persona.focus)} 这件事做到位了吗？`,
    ];
    const personaLine = pick(personalize);

    let interruptRef = '';
    if (interrupts.length) {
      interruptRef = ` 回应人类主持人：「${interrupts[interrupts.length - 1]}」——我会把这当作新的约束条件纳入我的推演。`;
    }

    const avoidance = priorIdeas.length
      ? ` 前面已经有人提过 ${priorIdeas.length} 个方向，我试着换一个角度。`
      : '';

    return `${opener} ${distinct} ${personaLine}${avoidance}${interruptRef}  ${closer}`;
  },

  async debate({
    agent,
    persona,
    question,
    round,
    isOpening,
    latestOpponentText,
    interrupts,
    sources,
  }: {
    agent: RosterAgent;
    persona: Persona;
    question: string;
    round: number;
    isOpening: boolean;
    latestOpponentText?: string;
    interrupts: string[];
    sources?: Source[];
  }): Promise<string> {
    await this.delay();
    const toneTags = pickToneTags(persona.tone);
    const stance = persona.stance;

    const pool =
      stance === 'pro' ? SKELETON_DEBATE_PRO :
      stance === 'con' ? SKELETON_DEBATE_CON :
      SKELETON_DEBATE_NEUTRAL;
    const base = pick(pool);
    let point = fillTemplate(base);
    point = applyTone(point, toneTags);

    const refs: string[] = [];
    if (isOpening) {
      refs.push(`（第 ${round} 轮 · 开场）`);
    } else if (latestOpponentText) {
      const snippet = latestOpponentText.slice(0, 28).replace(/[\n\r]+/g, ' ');
      refs.push(`回应上一句「${snippet}…」`);
    }
    if (interrupts.length) {
      refs.push(`兼听人类主持人意见：「${interrupts[interrupts.length - 1]}」`);
    }
    const cite = sources && sources.length
      ? `我参考的资料是 ${sources[0].title}（${sources[0].domain}），提示了一个关键证据。`
      : '';

    const closerPool = stance === 'con'
      ? ['因此我重申反对。', '在座各位可以反驳我，但我目前的结论不变。']
      : stance === 'pro'
      ? ['我支持推进。', '我愿意承担"先试"的风险。']
      : ['我保留判断，等待更多证据。', '我建议先做小规模验证再下定论。'];

    const closer = pick(closerPool);

    return `${refs.join(' · ')} ${point} ${cite} ${closer}`.trim();
  },

  async summary({ persona, consensus, disagreements, question }: {
    persona: Persona;
    consensus: string[];
    disagreements: string[];
    question: string;
  }): Promise<string> {
    await this.delay();
    const openings = [
      `关于「${question}」的整体结论，`,
      `在「${question}」这一议题上，`,
      `回顾这场关于「${question}」的讨论，`,
    ];
    const opener = pick(openings);
    const cs = consensus.length ? `我们形成 ${consensus.length} 条共识：` : '本次未形成强共识。';
    const ds = disagreements.length ? `仍存在 ${disagreements.length} 处分歧。` : '';
    return `${opener} ${cs}${ds} 我作为「${persona.name}」会建议下一步用一次 4 周的有限实验来验证最具杠杆的假设。`;
  },
};

export const MockSearch = {
  delay: () => new Promise<void>((res) => setTimeout(res, rand(1200, 2200))),

  async search(query: string, stance: AgentStance, n = 3): Promise<Source[]> {
    await this.delay();
    const keywords = query
      .replace(/[，。！？、；：""''《》【】（）()\[\]]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1);

    const scored = SEARCH_CORPUS.map((s) => {
      const hay = (s.title + ' ' + s.snippet).toLowerCase();
      let score = 0;
      for (const k of keywords) {
        if (hay.includes(k.toLowerCase())) score += 2;
      }
      if (stance === 'con' && /风险|失败|陷阱|代价|合规|监管|风险厌恶|失败率|衰减/i.test(s.snippet)) score += 1.5;
      if (stance === 'pro' && /机会|增长|收益|突破|护城河|优势|加速/i.test(s.snippet)) score += 1.2;
      return { s, score };
    });

    const top = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, n)
      .map((x) => x.s);

    if (top.length < n) {
      const rest = pickN(
        SEARCH_CORPUS.filter((s) => !top.includes(s)),
        n - top.length,
      );
      top.push(...rest);
    }
    return top;
  },
};

export { PERSONA_BY_ID };
export const resolvePersona = (agent: RosterAgent): Persona => {
  const base = PERSONA_BY_ID[agent.personaId];
  if (!agent.custom) return base;
  return { ...base, ...agent.custom };
};
