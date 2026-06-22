// 探测 Coding Plan 联网搜索的真实机制。
// 用法: set -a; . ./scripts/ark-key.local; set +a; node scripts/test-ark-mech.mjs
const KEY = process.env.ARK_API_KEY;
const MODEL = process.env.ARK_MODEL || 'deepseek-v4-flash';
const BASE = 'https://ark.cn-beijing.volces.com/api/coding/v1';
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` };

async function call(label, body) {
  console.log(`\n${'='.repeat(60)}\n${label}\n${'='.repeat(60)}`);
  try {
    const res = await fetch(`${BASE}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) });
    const txt = await res.text();
    if (!res.ok) { console.log(`HTTP ${res.status}: ${txt.slice(0, 300)}`); return null; }
    const data = JSON.parse(txt);
    const msg = data.choices?.[0]?.message;
    console.log('content:', JSON.stringify(msg?.content || '').slice(0, 400));
    console.log('tool_calls:', JSON.stringify(msg?.tool_calls, null, 2)?.slice(0, 500));
    console.log('reasoning:', JSON.stringify(msg?.reasoning_content || '').slice(0, 200));
    console.log('other message keys:', Object.keys(msg || {}));
    console.log('top-level keys:', Object.keys(data));
    if (data.citations || data.annotation || data.search_results) console.log('HAS NATIVE SEARCH FIELD:', JSON.stringify({citations:data.citations,annotation:data.annotation,search_results:data.search_results}).slice(0,300));
    return data;
  } catch (e) { console.log('err', e.message); return null; }
}

// 1. 完全不声明任何 tool，问需要联网的问题——看模型是否自带联网能力
await call('1. 无 tools · 问需联网问题（测原生联网）', {
  model: MODEL,
  messages: [{ role: 'user', content: '今天北京天气如何？请给出实时信息。' }],
});

// 2. 带 web_search function tool，看 tool_call 参数结构
await call('2. 带 web_search function tool（看调用参数）', {
  model: MODEL,
  messages: [{ role: 'user', content: '今天北京天气如何？' }],
  tools: [{ type: 'function', function: { name: 'web_search', description: '联网检索最新资料', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } }],
  tool_choice: 'auto',
});

// 3. 声明一个方舟可能的「内置联网」工具名（非 function），看是否被服务端识别
await call('3. tools=[{type:web_search}] 非 function 形式（测内置联网工具）', {
  model: MODEL,
  messages: [{ role: 'user', content: '今天北京天气如何？' }],
  tools: [{ type: 'web_search' }],
});

// 4. 顶层 web_search_options（方舟标准接口的联网开关）
await call('4. 顶层 web_search_options（标准方舟联网开关）', {
  model: MODEL,
  messages: [{ role: 'user', content: '今天北京天气如何？' }],
  web_search_options: { enable: true, search_query: true },
});
