/**
 * 真实 LLM 客户端
 * 支持：
 *  - OpenAI Chat Completions（OpenAI / DeepSeek / Moonshot / 自定义）
 *  - Ark Coding Plan（火山引擎）— 原生联网 + thinking
 *  - Anthropic Messages（Claude 系列）— 原生 web_search + thinking
 *
 * 联网策略：
 *  - Anthropic：使用原生 web_search_20250305 服务端工具，模型自主搜索
 *  - Ark：使用 enable_search 原生联网
 *  - 其他 OpenAI 兼容：声明 web_search function tool，由 chatWithTools 执行
 *
 * 关键原则：
 *  - 每个 Agent 独立维护 message[] 历史，每次发言都把全部历史带回服务端。
 *  - 所有请求走 /llm-proxy（dev 代理），绕开浏览器 CORS 限制。
 */

import { buildProxiedUrl } from './proxyUrl';

export type ProviderKind = 'openai' | 'anthropic' | 'ark-coding';

export interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  enableSearch: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
  /** 用于回传 assistant 的工具调用，便于多轮 function calling */
  tool_calls?: {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }[];
  /** 思考过程，仅做 UI 展示，不会回传给服务端（避免污染上下文） */
  reasoning?: string;
}

export interface LLMResponse {
  content: string;
  reasoning?: string;
  toolCalls?: {
    id: string;
    name: string;
    arguments: Record<string, any>;
  }[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    reasoningTokens?: number;
  };
  /** 联网搜索实际产生的来源（原生搜索或 function tool 均会填充） */
  sources?: { title: string; url: string; domain: string; snippet?: string }[];
}

export class LLMError extends Error {
  constructor(public status: number, public body: string, msg: string) {
    super(msg);
  }
}

const WEB_SEARCH_TOOL_OPENAI = {
  type: 'function' as const,
  function: {
    name: 'web_search',
    description:
      '在互联网上检索与当前议题或论证相关的最新资料、报告、案例或数据，用于强化论点或挑战对方主张。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '检索关键词或问题，简洁具体。',
        },
        recency_days: {
          type: 'number',
          description: '希望资料的新鲜度（天数），默认 365。',
        },
      },
      required: ['query'],
    },
  },
};

const detectKind = (baseUrl: string): ProviderKind => {
  if (baseUrl.includes('ark.cn-beijing.volces.com')) return 'ark-coding';
  if (baseUrl.includes('anthropic.com')) return 'anthropic';
  return 'openai';
};

const domainOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/**
 * 调用一次 LLM，支持联网工具。
 * - Anthropic / Ark：原生联网，返回中直接含 sources
 * - 其他：返回 toolCalls，由 chatWithTools 执行
 */
export async function chat(
  cfg: LLMConfig,
  messages: ChatMessage[],
  opts: { signal?: AbortSignal; onReasoning?: (r: string) => void } = {},
): Promise<LLMResponse> {
  const kind = detectKind(cfg.baseUrl);
  if (kind === 'anthropic') {
    return chatAnthropic(cfg, messages, opts);
  }
  return chatOpenAI(cfg, messages, opts, kind);
}

// ─────────────────────────────────────────────────────────────
// OpenAI 协议（含 Ark Coding Plan / DeepSeek / Moonshot / 自定义）
// ─────────────────────────────────────────────────────────────

async function chatOpenAI(
  cfg: LLMConfig,
  messages: ChatMessage[],
  opts: { signal?: AbortSignal; onReasoning?: (r: string) => void },
  kind: ProviderKind,
): Promise<LLMResponse> {
  const { url, proxyHeaders } = buildProxiedUrl(cfg.baseUrl, '/chat/completions');

  // 把 reasoning 字段从 messages 中过滤，避免污染上下文
  const sanitized: any[] = messages.map((m) => {
    const { reasoning, ...rest } = m;
    return rest;
  });

  const body: any = {
    model: cfg.model,
    messages: sanitized,
    temperature: cfg.temperature,
    max_tokens: cfg.maxTokens,
  };

  const isArk = kind === 'ark-coding';

  // Ark Coding Plan：启用 thinking + 原生联网
  if (isArk) {
    body.thinking = { type: 'enabled' };
    if (cfg.enableSearch) {
      // Ark 原生联网：模型自主搜索，不需要 function tool
      body.enable_search = true;
    }
  } else if (cfg.enableSearch) {
    // 其他 OpenAI 兼容：声明 function tool，由 chatWithTools 执行
    body.tools = [WEB_SEARCH_TOOL_OPENAI];
    body.tool_choice = 'auto';
  }

  const res = await fetch(url, {
    method: 'POST',
    signal: opts.signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
      ...proxyHeaders,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new LLMError(res.status, txt, `LLM 调用失败: ${res.status}`);
  }
  const rawText = await res.text();
  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch (parseErr: any) {
    throw new LLMError(
      500,
      rawText.slice(0, 500),
      `LLM 响应不是合法 JSON（可能 baseUrl 路径错误或被拦截）：${parseErr?.message || ''} | 响应前 200 字符：${rawText.slice(0, 200)}`,
    );
  }
  const choice = data.choices?.[0];
  if (!choice) throw new LLMError(500, JSON.stringify(data), 'LLM 响应无 choice');

  const msg = choice.message ?? {};
  const reasoning: string | undefined = msg.reasoning_content || undefined;
  if (reasoning) opts.onReasoning?.(reasoning);

  const toolCalls = msg.tool_calls
    ?.map((tc: any) => ({
      id: tc.id,
      name: tc.function?.name,
      arguments: safeParseArgs(tc.function?.arguments),
    }))
    .filter((x: any) => x.name);

  // Ark 原生联网的搜索结果可能在 search_results 或 citations 字段
  const sources: { title: string; url: string; domain: string; snippet?: string }[] = [];
  if (isArk && cfg.enableSearch) {
    const searchResults = choice.search_results || data.search_results || [];
    for (const s of searchResults) {
      if (s.url || s.link) {
        sources.push({
          title: s.title || s.name || '',
          url: s.url || s.link || '',
          domain: domainOf(s.url || s.link || ''),
          snippet: s.content?.slice(0, 240) || s.snippet || '',
        });
      }
    }
    // Ark 也可能在 message 中返回 citations
    const citations = msg.citations || [];
    for (const c of citations) {
      if (c.url || c.link) {
        sources.push({
          title: c.title || c.name || '',
          url: c.url || c.link || '',
          domain: domainOf(c.url || c.link || ''),
          snippet: c.content?.slice(0, 240) || '',
        });
      }
    }
  }

  return {
    content: msg.content || '',
    reasoning,
    toolCalls: toolCalls?.length ? toolCalls : undefined,
    sources: sources.length ? sources : undefined,
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          reasoningTokens: data.usage.completion_tokens_details?.reasoning_tokens,
        }
      : undefined,
  };
}

function safeParseArgs(s: any): any {
  if (typeof s !== 'string') return s;
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

// ─────────────────────────────────────────────────────────────
// Anthropic Messages 协议 — 原生 web_search + thinking
// ─────────────────────────────────────────────────────────────

async function chatAnthropic(
  cfg: LLMConfig,
  messages: ChatMessage[],
  opts: { signal?: AbortSignal; onReasoning?: (r: string) => void },
): Promise<LLMResponse> {
  const { url, proxyHeaders } = buildProxiedUrl(cfg.baseUrl, '/messages');
  // Anthropic 要求 system 单独提出来
  const systemMsgs = messages.filter((m) => m.role === 'system').map((m) => m.content);
  const rest = messages
    .filter((m) => m.role !== 'system')
    .map((m) => {
      if (m.role === 'tool') {
        return {
          role: 'user' as const,
          content: [
            {
              type: 'tool_result',
              tool_use_id: m.tool_call_id!,
              content: m.content,
            },
          ],
        };
      }
      if (m.role === 'assistant' && m.tool_calls?.length) {
        return {
          role: 'assistant' as const,
          content: [
            ...(m.content ? [{ type: 'text' as const, text: m.content }] : []),
            ...m.tool_calls.map((tc) => ({
              type: 'tool_use' as const,
              id: tc.id,
              name: tc.function.name,
              input: safeParseArgs(tc.function.arguments),
            })),
          ],
        };
      }
      return { role: m.role, content: m.content };
    });

  const body: any = {
    model: cfg.model,
    system: systemMsgs.join('\n\n'),
    messages: rest,
    max_tokens: cfg.maxTokens,
    temperature: cfg.temperature,
  };

  // 使用 Anthropic 原生 web_search 服务端工具（模型自主搜索，无需外部 API Key）
  if (cfg.enableSearch) {
    body.tools = [
      {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 5,
      },
    ];
  }

  const res = await fetch(url, {
    method: 'POST',
    signal: opts.signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
      ...(cfg.enableSearch ? { 'anthropic-beta': 'web-search-2025-03-05' } : {}),
      ...proxyHeaders,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new LLMError(res.status, txt, `Anthropic 调用失败: ${res.status}`);
  }
  const rawText = await res.text();
  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch (parseErr: any) {
    throw new LLMError(
      500,
      rawText.slice(0, 500),
      `Anthropic 响应不是合法 JSON：${parseErr?.message || ''} | 响应前 200 字符：${rawText.slice(0, 200)}`,
    );
  }
  const blocks = data.content || [];
  let content = '';
  const toolCalls: any[] = [];
  let reasoning: string | undefined;
  const sources: { title: string; url: string; domain: string; snippet?: string }[] = [];

  for (const b of blocks) {
    if (b.type === 'text') {
      content += (content ? '\n' : '') + b.text;
    }
    if (b.type === 'thinking') {
      reasoning = (reasoning ? reasoning + '\n' : '') + b.thinking;
    }
    if (b.type === 'tool_use') {
      // 只有自定义 function tool 才需要回传（原生 web_search 是 server_tool_use）
      toolCalls.push({ id: b.id, name: b.name, arguments: b.input });
    }
    // 原生 web search 结果
    if (b.type === 'web_search_tool_result') {
      const results = b.content || [];
      for (const r of results) {
        if (r.url) {
          sources.push({
            title: r.title || '',
            url: r.url,
            domain: domainOf(r.url),
            snippet: r.encrypted_content?.slice(0, 240) || r.snippet || '',
          });
        }
      }
    }
  }
  if (reasoning) opts.onReasoning?.(reasoning);

  // 如果原生搜索被使用，content 中可能包含引用标记但不需要 toolCalls
  // 去掉原生 web_search 的 tool_use（server_tool_use 不需要客户端执行）
  const clientToolCalls = toolCalls.filter((tc) => tc.name !== 'web_search');

  return {
    content,
    reasoning,
    toolCalls: clientToolCalls.length ? clientToolCalls : undefined,
    sources: sources.length ? sources : undefined,
    usage: data.usage
      ? {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
        }
      : undefined,
  };
}
