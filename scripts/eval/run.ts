/**
 * 评测入口：npx tsx scripts/eval/run.ts --session <sessionId>
 *
 * 用 LANGFUSE_SECRET_KEY + EVAL_LLM_*（均在 .env.local，无 VITE_ 前缀）。
 * 拉取该 session 的 traces，跑 3 个评测器，回写分数到 Langfuse。
 */

import 'dotenv/config';
import { evalSpeeches } from './eval-speech';
import { evalViewpoints } from './eval-viewpoint';
import { evalConvergence } from './eval-convergence';

function parseSessionArg(): string {
  const idx = process.argv.indexOf('--session');
  if (idx === -1 || !process.argv[idx + 1]) {
    console.error('用法: npx tsx scripts/eval/run.ts --session <sessionId>');
    process.exit(1);
  }
  return process.argv[idx + 1];
}

async function main() {
  const sessionId = parseSessionArg();
  console.log(`=== Langfuse eval: session=${sessionId} ===`);

  console.log('\n[1/3] 单轮发言质量 (speech.*)');
  await evalSpeeches(sessionId);

  console.log('\n[2/3] 轮次观点提炼 (viewpoint.*)');
  await evalViewpoints(sessionId);

  console.log('\n[3/3] 收敛度/立场演进 (convergence.*)');
  await evalConvergence(sessionId);

  console.log('\n=== 评测完成，分数已回写 Langfuse ===');
}

main().catch((e) => {
  console.error('评测失败:', e);
  process.exit(1);
});
