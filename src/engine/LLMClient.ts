/**
 * 真实 LLM 客户端
 * 支持：
 *  - OpenAI Chat Completions（OpenAI / DeepSeek / Moonshot / Ark Coding Plan / 自定义）
 *  - Anthropic Messages（Claude 系列）
 *  - 原生联网：把 web_search 工具声明交给 LLM，由模型自主决定何时检索
 *  - 思考过程：Ark / DeepSeek / Claude 1.0+ 等支持 reasoning_content / thinking
 *
 * 关键原则：每个 Agent 独立维护 message[] 历史，每次发言都把全部历史带回服务端。
 */

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
  /** 联网工具实际产生的来源 */
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
  if (baseUrl.includes('ark.cn-beijing.volces.com') && baseUrl.includes('coding')) return 'ark-coding';
  if (baseUrl.includes('anthropic.com')) return 'anthropic';
  return 'openai';
};

const isAnthropic = (kind: ProviderKind) => kind === 'anthropic';

/**
 * 调用一次 LLM，支持联网工具。LLM 自主决定是否调用 web_search。
 * 如需多轮 function calling，可基于返回的 toolCalls 自行继续。
 */
export async function chat(
  cfg: LLMConfig,
  messages: ChatMessage[],
  opts: { signal?: AbortSignal; onReasoning?: (r: string) => void } = {},
): Promise<LLMResponse> {
  const kind = detectKind(cfg.baseUrl);
  if (isAnthropic(kind)) {
    return chatAnthropic(cfg, messages, opts);
  }
  return chatOpenAI(cfg, messages, opts);
}

// ─────────────────────────────────────────────────────────────
// OpenAI 协议（含 Ark Coding Plan / DeepSeek / Moonshot / 自定义）
// ─────────────────────────────────────────────────────────────

async function chatOpenAI(
  cfg: LLMConfig,
  messages: ChatMessage[],
  opts: { signal?: AbortSignal; onReasoning?: (r: string) => void },
): Promise<LLMResponse> {
  const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions';

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
  // Ark Coding Plan 支持 thinking 字段
  if (cfg.baseUrl.includes('ark.cn-beijing.volces.com')) {
    body.thinking = { type: 'enabled' };
  }
  if (cfg.enableSearch) {
    body.tools = [WEB_SEARCH_TOOL_OPENAI];
    body.tool_choice = 'auto';
  }

  const res = await fetch(url, {
    method: 'POST',
    signal: opts.signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new LLMError(res.status, txt, `LLM 调用失败: ${res.status}`);
  }
  const data = await res.json();
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

  return {
    content: msg.content || '',
    reasoning,
    toolCalls: toolCalls?.length ? toolCalls : undefined,
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
// Anthropic Messages 协议
// ─────────────────────────────────────────────────────────────

async function chatAnthropic(
  cfg: LLMConfig,
  messages: ChatMessage[],
  opts: { signal?: AbortSignal; onReasoning?: (r: string) => void },
): Promise<LLMResponse> {
  const url = cfg.baseUrl.replace(/\/+$/, '') + '/messages';
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
  if (cfg.enableSearch) {
    body.tools = [
      {
        name: 'web_search',
        description:
          '在互联网上检索与当前议题或论证相关的最新资料、报告、案例或数据，用于强化论点或挑战对方主张。',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '检索关键词或问题，简洁具体。' },
            recency_days: { type: 'number', description: '希望资料的新鲜度（天数），默认 365。' },
          },
          required: ['query'],
        },
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
      'anthropic-beta': 'web-search-2025-03-05',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new LLMError(res.status, txt, `Anthropic 调用失败: ${res.status}`);
  }
  const data = await res.json();
  const blocks = data.content || [];
  let content = '';
  const toolCalls: any[] = [];
  let reasoning: string | undefined;
  for (const b of blocks) {
    if (b.type === 'text') content += (content ? '\n' : '') + b.text;
    if (b.type === 'thinking') reasoning = (reasoning ? reasoning + '\n' : '') + b.thinking;
    if (b.type === 'tool_use') {
      toolCalls.push({ id: b.id, name: b.name, arguments: b.input });
    }
  }
  if (reasoning) opts.onReasoning?.(reasoning);
  return {
    content,
    reasoning,
    toolCalls: toolCalls.length ? toolCalls : undefined,
    usage: data.usage
      ? {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
        }
      : undefined,
  };
}
