/**
 * 剥离 LLM 输出里泄漏的「特殊 token / 工具调用标签 / DSML 标记」。
 *
 * 某些模型（尤其国产开源模型）会把内部 DSML 工具调用标签、
 * 残留的 thinking/answer 包裹标签、function-call XML 等直接吐进正文，
 * 例如 `</｜DSML｜answer>`、`<tool_call>…</tool_call>`。
 * 这些既不是用户内容也不是合法 markdown，必须在展示前统一剔除。
 *
 * 作为「展示层最后一道防线」，normalizeText 会先调用本函数，
 * 因此所有经 normalizeText 的展示路径都自动受保护。
 */
export function stripLLMArtifacts(input = ''): string {
  if (!input) return '';
  return input
    // 1) 成对的 DSML 标签及其内容（全角竖线 ｜）
    .replace(/<｜DSML｜\w+｜?[^>]*>([\s\S]*?)<\/｜DSML｜\w+｜?>/g, '')
    // 2) 残留的单个全角竖线标签（开/闭/自闭合），覆盖 </｜DSML｜answer> 等
    .replace(/<\/?｜[^>]*>/g, '')
    // 3) 残留的 thinking / answer / 工具调用 XML 包裹标签
    .replace(
      /<\/?(?:thinking|answer|tool_calls|tool_call|function_call|parameter|invoke|reflection)[^>]*>/gi,
      '',
    );
}

/**
 * 文本规范化工具：保证展示给用户的 LLM 输出「简洁易读」。
 *
 * 解决对话框内空行过多与特殊 token 泄漏的问题：
 *  - 先剥离 LLM 泄漏的 DSML / 工具调用标签（stripLLMArtifacts）
 *  - 统一换行符
 *  - 折叠 3 个及以上连续换行为至多一个空行
 *  - 去除首尾空行与每行尾随空白
 *  - 折叠多余空格
 *
 * 所有展示 LLM 文本的地方都应先经过 normalizeText。
 */
export function normalizeText(input = ''): string {
  if (!input) return '';
  return stripLLMArtifacts(input)
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '')
    .replace(/ {3,}/g, ' ');
}
