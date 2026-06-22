// 探测火山 Ark Coding Plan Key 的联网搜索能力。
// 用法：
//   ARK_API_KEY=xxx ARK_MODEL=deepseek-v4-flash node scripts/test-ark-search.mjs
//
// 三档探测：
//  A. Chat Completions + Function Calling（项目当前路径，预期可用）
//  B. Coding Plan Responses API（/api/coding/v1/responses）+ 联网参数
//  C. 标准 Ark Responses API（/api/v3/responses）+ 联网参数
import assert from 'node:assert';

const KEY = process.env.ARK_API_KEY;
const MODEL = process.env.ARK_MODEL || 'deepseek-v4-flash';
const CODING_BASE = 'https://ark.cn-beijing.volces.com/api/coding/v1';
const STD_BASE = 'https://ark.cn-beijing.volces.com/api/v3';

assert(KEY, '请设置 ARK_API_KEY 环境变量');
console.log(`模型: ${MODEL}\nKey: ${KEY.slice(0, 6)}…${KEY.slice(-4)}\n`);

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${KEY}`,
};

function summarize(label, ok, info) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${label}`);
  console.log('='.repeat(60));
  console.log(`结果: ${ok ? '✅ 可用' : '❌ 不可用'}`);
  console.log(`详情: ${info}`);
}

// ── A. Chat Completions + Function Calling ──
async function testChatFunction() {
  const url = `${CODING_BASE}/chat/completions`;
  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: '你是助手。' },
      { role: 'user', content: '今天是几号？请用 web_search 工具联网确认。' },
    ],
    tools: [{
      type: 'function',
      function: {
        name: 'web_search',
        description: '在互联网上检索最新资料',
        parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      },
    }],
    tool_choice: 'auto',
  };
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const txt = await res.text();
    if (!res.ok) return summarize('A. Chat Completions + Function Calling', false, `HTTP ${res.status} | ${txt.slice(0, 300)}`);
    const data = JSON.parse(txt);
    const msg = data.choices?.[0]?.message;
    const called = msg?.tool_calls?.some((t) => t.function?.name === 'web_search');
    return summarize('A. Chat Completions + Function Calling', true, `模型${called ? '主动调用了 web_search ✅' : '未调用 web_search'} | content: ${(msg?.content || '').slice(0, 120)}`);
  } catch (e) {
    return summarize('A. Chat Completions + Function Calling', false, `异常: ${e.message}`);
  }
}

// ── B/C. Responses API + 联网 ──
// 方舟 Responses API 的联网参数有多种可能写法，逐一尝试：
//   - tools: [{ type: 'web_search' / 'web_search_preview' }]
//   - 顶层 web_search_options
async function testResponses(label, base) {
  const url = `${base}/responses`;
  const variants = [
    { name: 'tools=[{type:web_search}]', body: { model: MODEL, input: '今天是几号？请联网确认。', tools: [{ type: 'web_search' }] } },
    { name: 'tools=[{type:web_search_preview}]', body: { model: MODEL, input: '今天是几号？请联网确认。', tools: [{ type: 'web_search_preview' }] } },
    { name: 'web_search_options', body: { model: MODEL, input: '今天是几号？请联网确认。', web_search_options: { enable: true, search_query: true } } },
  ];
  let lastInfo = '所有变体均失败';
  for (const v of variants) {
    try {
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(v.body) });
      const txt = await res.text();
      if (res.ok) {
        const data = JSON.parse(txt);
        const hasCitation = JSON.stringify(data).includes('citation') || JSON.stringify(data).includes('url');
        return summarize(`${label}`, true, `变体「${v.name}」成功 ✅ | 含引用: ${hasCitation} | keys: ${Object.keys(data).join(',')} | 预览: ${txt.slice(0, 200)}`);
      }
      lastInfo = `${v.name} → HTTP ${res.status} | ${txt.slice(0, 200)}`;
      if (res.status === 404) {
        // 端点不存在，无需再试其它变体
        return summarize(`${label}`, false, `端点不存在(404) | ${txt.slice(0, 200)}`);
      }
    } catch (e) {
      lastInfo = `${v.name} → 异常: ${e.message}`;
    }
  }
  return summarize(`${label}`, false, lastInfo);
}

await testChatFunction();
await testResponses('B. Coding Plan Responses API (/api/coding/v1/responses)', CODING_BASE);
await testResponses('C. 标准 Ark Responses API (/api/v3/responses)', STD_BASE);

console.log('\n\n结论：若 A 可用但 B/C 不可用 → Coding Plan 只能靠 Function Calling 联网（需配 Tavily/Serper）；若 B 或 C 可用 → 可走原生联网，无需外部搜索 Key。');
