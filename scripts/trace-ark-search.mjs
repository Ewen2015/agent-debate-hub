// 复现项目 chatWithTools 链路，观测「联网查今天上海天气」如何联网。
// 逐跳打印：① 模型 tool_call ② 是否配置了外部搜索器 ③ 搜索结果 ④ 回灌后最终回答
// 用法: set -a; . ./scripts/ark-key.local; set +a; node scripts/trace-ark-search.mjs
const KEY = process.env.ARK_API_KEY;
const MODEL = process.env.ARK_MODEL || 'deepseek-v4-flash';
const BASE = 'https://ark.cn-beijing.volces.com/api/coding/v1';
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` };

const SEARCH_TOOL = { type: 'function', function: {
  name: 'web_search',
  description: '在互联网上检索最新资料、报告、案例或数据',
  parameters: { type: 'object', properties: { query: { type: 'string' }, recency_days: { type: 'number' } }, required: ['query'] },
}};

async function chat(messages, withTools) {
  const body = { model: MODEL, messages, temperature: 0.6, max_tokens: 800 };
  if (withTools) { body.tools = [SEARCH_TOOL]; body.tool_choice = 'auto'; }
  const res = await fetch(`${BASE}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) });
  const txt = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${txt.slice(0,300)}`);
  return JSON.parse(txt).choices[0].message;
}

console.log('任务：「联网查一下今天上海的天气」\n');
let messages = [{ role: 'user', content: '联网查一下今天上海的天气。' }];

// ── 第1跳：模型是否发起 tool_call ──
console.log('─'.repeat(50), '\n① 第1跳：模型决策');
const m1 = await chat(messages, true);
console.log('reasoning:', (m1.reasoning_content||'').slice(0,150));
console.log('content:', JSON.stringify(m1.content||'').slice(0,150));
console.log('tool_calls:', JSON.stringify(m1.tool_calls||null, null, 2));

if (!m1.tool_calls?.length) {
  console.log('\n模型未调用 web_search —— 直接结束（无联网）。');
  process.exit(0);
}

const tc = m1.tool_calls[0];
const args = JSON.parse(tc.function.arguments);
console.log(`\n→ 模型发起 web_search，query="${args.query}"`);

// ── 第2跳：检查外部搜索器是否配置 ──
// 项目里 resolveSource 走 Tavily/Serper。这里直接探测环境是否给了搜索 Key。
console.log('\n', '─'.repeat(50), '\n② 第2跳：外部搜索器配置检查');
const TAVILY = process.env.TAVILY_API_KEY || process.env.VITE_TAVILY_API_KEY;
const SERPER = process.env.SERPER_API_KEY || process.env.VITE_SERPER_API_KEY;
console.log('Tavily Key:', TAVILY ? '已配置 ✅' : '未配置 ❌');
console.log('Serper Key:', SERPER ? '已配置 ✅' : '未配置 ❌');

// ── 第3跳：执行搜索（若配置了搜索器） ──
let toolResult = '';
let realSources = [];
if (TAVILY) {
  console.log('\n', '─'.repeat(50), '\n③ 第3跳：Tavily 执行真实检索');
  const r = await fetch('https://api.tavily.com/search', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ api_key: TAVILY, query: args.query, max_results: 3 }) });
  const d = await r.json();
  realSources = d.results || [];
  toolResult = realSources.map(s=>`【${s.title}】 ${s.url}\n摘要：${(s.content||'').slice(0,180)}`).join('\n\n');
  console.log('检索到', realSources.length, '条结果');
  realSources.slice(0,2).forEach((s,i)=>console.log(`  [${i+1}] ${s.title} — ${s.url}`));
} else if (SERPER) {
  console.log('\n', '─'.repeat(50), '\n③ 第3跳：Serper 执行真实检索');
  const r = await fetch('https://google.serper.dev/search', { method:'POST', headers:{'X-API-KEY':SERPER,'Content-Type':'application/json'}, body: JSON.stringify({ q: args.query }) });
  const d = await r.json();
  realSources = (d.organic||[]).slice(0,3);
  toolResult = realSources.map(s=>`【${s.title}】 ${s.link}\n摘要：${(s.snippet||'').slice(0,180)}`).join('\n\n');
  console.log('检索到', realSources.length, '条结果');
  realSources.slice(0,2).forEach((s,i)=>console.log(`  [${i+1}] ${s.title} — ${s.link}`));
} else {
  console.log('\n', '─'.repeat(50), '\n③ 第3跳：未配置搜索器，无法执行检索（项目里会走「未配置搜索 Key，跳过联网检索」分支）');
  toolResult = '（未配置联网搜索 Key，无法检索）';
}

// ── 第4跳：回灌搜索结果，模型作答 ──
console.log('\n', '─'.repeat(50), '\n④ 第4跳：回灌结果，模型最终回答');
messages = [
  ...messages,
  { role: 'assistant', content: m1.content||'', tool_calls: m1.tool_calls },
  { role: 'tool', tool_call_id: tc.id, name: 'web_search', content: toolResult || '（无结果）' },
];
const m2 = await chat(messages, false);
console.log('最终回答:\n', (m2.content||'').slice(0,500));
console.log('\n引用来源数:', realSources.length);
