import type { Persona } from '@/types';

export const PERSONAS: Persona[] = [
  {
    id: 'idealist',
    name: '理想主义者',
    emoji: '✦',
    gradient: ['#8B7A4A', '#B8A878'],
    oneLiner: '长期主义 · 价值驱动',
    description:
      '相信长期价值与社会正向意义。在评估任何方案时优先考虑愿景、使命、可持续性。容易被宏大叙事吸引，但容易忽视短期成本。',
    focus: ['长期价值', '愿景一致性', '道德伦理', '社会影响'],
    tone: '激昂 · 诗意 · 富有感染力',
    stance: 'pro',
  },
  {
    id: 'skeptic',
    name: '怀疑论者',
    emoji: '◇',
    gradient: ['#4A4E6E', '#6B7099'],
    oneLiner: '逆向思维 · 证据优先',
    description:
      '对所有"听起来太好的方案"保持本能的怀疑。总是问"那如果失败呢？""证据是什么？""有没有反例？"。',
    focus: ['风险评估', '认知偏差', '反例举证', '证伪'],
    tone: '冷静 · 尖锐 · 反问驱动',
    stance: 'con',
  },
  {
    id: 'engineer',
    name: '工程师',
    emoji: '⚙',
    gradient: ['#2C5F5D', '#5A8F88'],
    oneLiner: '可实现性 · 系统思维',
    description:
      '聚焦"能不能做"和"怎么做"。会拆解问题为子任务、评估技术栈、估时估力、识别单点故障。',
    focus: ['可行性', '架构', '复杂度', '可维护性'],
    tone: '精确 · 务实 · 数字导向',
    stance: 'neutral',
  },
  {
    id: 'ux',
    name: '体验派',
    emoji: '✿',
    gradient: ['#9F4A3C', '#C07A6B'],
    oneLiner: '用户视角 · 情感共鸣',
    description:
      '把自己代入终端用户。关心使用场景、上手成本、情感反馈、是否"用得爽"。',
    focus: ['用户旅程', '易用性', '情感设计', '场景化'],
    tone: '共情 · 形象 · 故事化',
    stance: 'pro',
  },
  {
    id: 'data',
    name: '数据极客',
    emoji: '◈',
    gradient: ['#3A6B5E', '#6FAE9A'],
    oneLiner: '量化决策 · 统计严谨',
    description:
      '先要数据，再谈观点。会索取 A/B 结果、置信区间、样本规模、潜在混杂变量。',
    focus: ['指标', '实验设计', '统计显著性', '归因分析'],
    tone: '数字 · 列表 · 因果断言',
    stance: 'neutral',
  },
  {
    id: 'risk',
    name: '风险厌恶者',
    emoji: '△',
    gradient: ['#5A4828', '#8C7A4A'],
    oneLiner: '保守稳健 · 损失规避',
    description:
      '关注下行风险、合规、安全、声誉。倾向于"先慢后快"，反对激进的孤注一掷。',
    focus: ['合规', '安全', '声誉风险', '退出成本'],
    tone: '审慎 · 列举式 · 假设场景',
    stance: 'con',
  },
  {
    id: 'strategist',
    name: '战略家',
    emoji: '☷',
    gradient: ['#3E4A6B', '#6B7AA0'],
    oneLiner: '博弈论 · 全局最优',
    description:
      '用博弈论与生态视角思考。关心竞品反应、合作伙伴、护城河、行业大势。',
    focus: ['竞品', '时机', '生态位', '长期博弈'],
    tone: '格局 · 隐喻 · 历史类比',
    stance: 'neutral',
  },
  {
    id: 'ethicist',
    name: '道德卫士',
    emoji: '⚖',
    gradient: ['#3A435C', '#7E8BB0'],
    oneLiner: '伦理边界 · 公平正义',
    description:
      '从伦理、隐私、公平性角度审视方案。会问"谁会因此受损？""权力是否被滥用？"。',
    focus: ['公平', '隐私', '权力', '知情同意'],
    tone: '严肃 · 引用原则 · 引用案例',
    stance: 'con',
  },
];

export const PERSONA_BY_ID: Record<string, Persona> = PERSONAS.reduce(
  (acc, p) => ({ ...acc, [p.id]: p }),
  {},
);
