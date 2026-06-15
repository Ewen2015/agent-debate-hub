import type { Source } from '@/types';

export const SEARCH_CORPUS: Source[] = [
  {
    title: '麦肯锡 2026 全球 AI 采用报告：62% 企业反馈 ROI 低于预期',
    url: 'https://www.mckinsey.com/featured-insights/ai-adoption-2026',
    snippet:
      '调查显示 AI 项目的实际投资回报率呈现明显两极分化，约 62% 的企业反馈在 18 个月内未达到预设的 KPI。',
    domain: 'mckinsey.com',
  },
  {
    title: 'Stanford HAI：多 Agent 协作系统的对齐风险研究',
    url: 'https://arxiv.org/abs/2603.04117',
    snippet:
      '当多个具备不同目标函数的 Agent 共同决策时，群体对齐失败率随 Agent 数量指数级上升。',
    domain: 'arxiv.org',
  },
  {
    title: 'The Verge：欧盟 AI Act 第二阶段生效，强制高风险系统人工监督',
    url: 'https://www.theverge.com/2026/02/eu-ai-act-phase-two',
    snippet:
      '新规要求高风险 AI 部署必须保留"人类在环"机制，并提供可解释性报告。',
    domain: 'theverge.com',
  },
  {
    title: 'HBR：跨职能决策中"魔鬼代言人"角色对群体智慧的影响',
    url: 'https://hbr.org/2025/12/devils-advocate-team-decisions',
    snippet:
      '实验显示结构化对抗角色可将群体决策质量提升 23%，但过度对抗会破坏心理安全感。',
    domain: 'hbr.org',
  },
  {
    title: 'MIT Tech Review：检索增强生成（RAG）让辩论模型的事实性提升 41%',
    url: 'https://www.technologyreview.com/2026/01/rag-debate-models',
    snippet:
      '对比实验表明，允许辩论 Agent 在发言前进行网络检索可显著降低虚构论据比例。',
    domain: 'technologyreview.com',
  },
  {
    title: 'Nature Human Behaviour：群体极化与议事结构的相关性',
    url: 'https://www.nature.com/articles/s41562-025-02277-8',
    snippet:
      '当议事流程引入"暂停 / 人类介入"节点时，群体极化指数下降约 18%。',
    domain: 'nature.com',
  },
  {
    title: 'a16z：2026 企业级 AI Agent 落地七大失败模式',
    url: 'https://a16z.com/2026-agent-failure-modes',
    snippet:
      '最常见的失败不是模型能力，而是上下文丢失、权限混乱、缺乏可解释性与可审计性。',
    domain: 'a16z.com',
  },
  {
    title: 'MIT Sloan：决策中"足够好"原则 vs 完美主义陷阱',
    url: 'https://sloanreview.mit.edu/article/satisficing-vs-maximizing-2025',
    snippet:
      '研究显示"足够好"原则在不确定环境下比最优化策略创造更多长期价值。',
    domain: 'mit.edu',
  },
  {
    title: 'FT：DeepSeek-V4 推理能力追平 GPT-5，但训练成本低 80%',
    url: 'https://www.ft.com/content/deepseek-v4-benchmark-2026',
    snippet:
      '第三方评测显示在多步推理与长上下文任务上 V4 已与一线闭源模型持平。',
    domain: 'ft.com',
  },
  {
    title: 'IEEE Spectrum：实时网络检索的延迟与辩论节奏的权衡',
    url: 'https://spectrum.ieee.org/realtime-search-debate-2026',
    snippet:
      '研究建议辩论场景下检索应异步进行并以"补丁"形式注入，避免打断发言节奏。',
    domain: 'ieee.org',
  },
  {
    title: 'Anthropic：Claude 4.5 在多角色辩论中的角色稳定性测试',
    url: 'https://www.anthropic.com/news/claude-4-5-persona-stability',
    snippet:
      '测试显示 Claude 4.5 在 8 轮辩论中保持一致人设与立场漂移率低于 4%。',
    domain: 'anthropic.com',
  },
  {
    title: 'Bloomberg：2026 年企业 AI 预算平均上调 34%，但 KPI 收紧',
    url: 'https://www.bloomberg.com/news/ai-budgets-2026',
    snippet:
      '预算增长的同时，CFO 们正在要求更严格的投入产出度量与季度审计。',
    domain: 'bloomberg.com',
  },
  {
    title: 'Wired：人类主持人 vs AI 主持人：会议效率对比研究',
    url: 'https://www.wired.com/story/human-vs-ai-moderator-2026',
    snippet:
      'AI 主持人在结构化会议中效率提升 28%，但冲突调解场景下人类仍占优。',
    domain: 'wired.com',
  },
  {
    title: 'Carnegie Endowment：AI 决策中的"解释性债务"风险',
    url: 'https://carnegieendowment.org/2026/01/explainability-debt',
    snippet:
      '未在部署初期投入可解释性的项目，后期补足成本平均增加 4.6 倍。',
    domain: 'carnegieendowment.org',
  },
  {
    title: 'Fast Company：远程异步辩论如何重塑分布式团队决策',
    url: 'https://www.fastcompany.com/90652189/async-debate-teams',
    snippet:
      '异步结构使 8 个不同时区的团队决策速度提升 2.1 倍，决策质量评分上升 12%。',
    domain: 'fastcompany.com',
  },
  {
    title: 'ACM Queue：LLM Agent 间"信息不对称"的博弈分析',
    url: 'https://queue.acm.org/detail.cfm?id=3621147',
    snippet:
      '当 Agent 拥有不同的私有信息时，需设计显式的"信息共享协议"以避免子博弈纳什均衡失效。',
    domain: 'acm.org',
  },
  {
    title: 'WSJ：2026 年最被高估的 AI 应用场景 Top 10',
    url: 'https://www.wsj.com/tech/ai/overhyped-ai-use-cases-2026',
    snippet:
      '全自主 AI 主持会议、AI 自动法律文书等场景被广泛认为短期落地困难。',
    domain: 'wsj.com',
  },
  {
    title: 'New York Times：当 AI 接手"苏格拉底式对话"',
    url: 'https://www.nytimes.com/2026/03/socratic-ai-dialogue',
    snippet:
      '哲学课与法律课堂上，教师开始将辩论任务交由多个 AI 角色执行，引发教育反思。',
    domain: 'nytimes.com',
  },
  {
    title: 'Reuters：欧盟拟强制大型 AI 系统提交"群体对齐"审计',
    url: 'https://www.reuters.com/technology/eu-multi-agent-audit-2026-03-15',
    snippet:
      '新规要求超过 3 个 Agent 协同的部署必须提交群体对齐报告与失败恢复预案。',
    domain: 'reuters.com',
  },
  {
    title: 'The Economist：群体决策中的"信息瀑布"与"反向独断"',
    url: 'https://www.economist.com/leadership/2026/02/information-cascade',
    snippet:
      '决策学研究显示结构化的"反向独断"环节可有效打破信息瀑布，提升少数派观点权重。',
    domain: 'economist.com',
  },
  {
    title: 'NeurIPS 2025：辩论作为模型自训练信号的可行性',
    url: 'https://papers.nips.cc/paper_files/paper/2025/hash/9b1c-debate-sft',
    snippet:
      '使用 Agent 间辩论的胜负信号进行 SFT 在数学与编程任务上平均提升 7.2%。',
    domain: 'nips.cc',
  },
  {
    title: 'Forbes：AI 议事厅的伦理边界：谁拥有最终结论的署名权？',
    url: 'https://www.forbes.com/sites/ai-ethics-2026/attribution',
    snippet:
      '法律学者正在讨论"AI 协调产生的报告"是否应被认定为可署名智力成果。',
    domain: 'forbes.com',
  },
  {
    title: 'Boston Consulting Group：AI 项目的"第二年陷阱"',
    url: 'https://www.bcg.com/publications/2026/ai-second-year-trap',
    snippet:
      '首批 AI 项目在第二年常因效果衰减、数据漂移、组织疲劳而失败。',
    domain: 'bcg.com',
  },
  {
    title: 'Science：群体智慧中的"特立独行者价值"实证',
    url: 'https://www.science.org/doi/10.1126/science.adm3344',
    snippet:
      '群体决策中 1-2 个高特异性的少数派意见可使整体准确率提升 15%。',
    domain: 'science.org',
  },
  {
    title: 'IEEE Transactions on AI：当辩论陷入"无限循环"时的终止策略',
    url: 'https://ieeexplore.ieee.org/document/10334412',
    snippet:
      '研究提出基于"边际收益递减"的多轮辩论终止条件。',
    domain: 'ieee.org',
  },
  {
    title: 'TechCrunch：Anthropic 推出原生多 Agent 编排协议',
    url: 'https://techcrunch.com/2026/03/anthropic-multi-agent-protocol',
    snippet:
      '新协议支持 Agent 间状态共享、议价与冲突仲裁。',
    domain: 'techcrunch.com',
  },
  {
    title: '人民日报：AI 治理的"中国方案"强调以人为本',
    url: 'https://example-people-cn.test/ai-governance-china-2026',
    snippet:
      '专家解读强调 AI 决策必须保留人类最终介入权，防范算法独断。',
    domain: 'people.cn',
  },
  {
    title: '财新：金融行业大模型落地的"幻觉率"与"可解释性"博弈',
    url: 'https://example-caixin.test/2026/finance-llm-hallucination',
    snippet:
      '监管要求金融 AI 决策保留可解释日志，影响模型选择与流程设计。',
    domain: 'caixin.com',
  },
  {
    title: 'MIT News：当 AI 学会"承认不知道"',
    url: 'https://news.mit.edu/2026/ai-epistemic-humility',
    snippet:
      '研究表明会主动表达不确定性的模型在长链推理中更受用户信任。',
    domain: 'mit.edu',
  },
  {
    title: 'Quanta Magazine：博弈论视角下的"AI 议价"研究',
    url: 'https://www.quantamagazine.org/ai-bargaining-2026',
    snippet:
      '当多个 LLM Agent 进行议价时，纳什均衡的收敛速度与提示词结构强相关。',
    domain: 'quantamagazine.org',
  },
];
