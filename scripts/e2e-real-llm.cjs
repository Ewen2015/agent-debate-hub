// 真实 LLM e2e：输入议题 → 真 LLM 思考 + 辩论 + 联网 + 报告
const WebSocket = require('ws');
const http = require('http');

function getTarget() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:9222/json', res => {
      let b=''; res.on('data',c=>b+=c); res.on('end',()=>resolve(JSON.parse(b).find(t=>t.type==='page').webSocketDebuggerUrl));
    });
  });
}
class CDP {
  constructor(ws){this.ws=ws;this.id=0;this.pending=new Map();
    ws.on('message',d=>{const m=JSON.parse(d);if(m.id&&this.pending.has(m.id)){const p=this.pending.get(m.id);this.pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}});}
  send(method,params={}){const id=++this.id;return new Promise((res,rej)=>{this.pending.set(id,{resolve:res,reject:rej});this.ws.send(JSON.stringify({id,method,params}));});}
  async run(expr){const r=await this.send('Runtime.evaluate',{expression:`(${expr})()`,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
  async snap(path){const {data}=await this.send('Page.captureScreenshot',{format:'png'});require('fs').writeFileSync(path,Buffer.from(data,'base64'));}
}
const norm = s => (s || '').toLowerCase();

(async () => {
  const ws = new WebSocket(await getTarget());
  await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});
  const cdp = new CDP(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  console.log('--- 0. clear storage ---');
  await cdp.run(() => new Promise(res => {
    Object.keys(localStorage).filter(k => k.startsWith('gd-hub:')).forEach(k => localStorage.removeItem(k));
    res('cleared');
  }));
  await cdp.send('Page.reload', { ignoreCache: true });
  await new Promise(r => setTimeout(r, 2000));

  console.log('--- 1. input question ---');
  await cdp.run(() => {
    const ta = document.querySelector('textarea[placeholder*="提出一个值得"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, '公司是否应该在 2026 年全面接入 LLM Agent 替代一线客服？请从 ROI、用户满意度、合规风险三个维度推演。');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return 'typed';
  });
  await new Promise(r => setTimeout(r, 800));

  console.log('--- 2. start brainstorm (real LLM) ---');
  await cdp.run(() => {
    const btn = [...document.querySelectorAll('button')].find(b => (b.innerText || '').toLowerCase().includes('开始 brainstorm'));
    if (!btn || btn.disabled) throw new Error('start btn not ready');
    btn.click();
    return 'clicked';
  });

  // Brainstorm 真实 LLM 调用 3 个 Agent，每个可能 5-15 秒
  console.log('--- 3. wait for brainstorm (real LLM, up to 60s) ---');
  const start = Date.now();
  let phase = 'brainstorm';
  let articleCount = 0;
  let eventCount = 0;
  while (Date.now() - start < 90000) {
    const r = await cdp.run(() => {
      const txt = document.body.innerText;
      let ph = 'unknown';
      if (txt.includes('BRAINSTORM 进行中')) ph = 'brainstorm';
      else if (txt.includes('DEBATE 进行中')) ph = 'debate';
      else if (txt.includes('已就绪') || txt.includes('待开始')) ph = 'idle';
      return {
        phase: ph,
        articles: document.querySelectorAll('article').length,
        events: document.querySelectorAll('.scroll-shadow li').length,
        thinking: txt.includes('思考') || /\<thinking\>/.test(txt),
        firstSpeech: document.querySelector('article') ? document.querySelector('article').innerText.slice(0, 100) : '',
      };
    });
    articleCount = r.articles;
    eventCount = r.events;
    phase = r.phase;
    if (r.phase === 'idle' && r.articles > 0) break;
    await new Promise(r => setTimeout(r, 1000));
    process.stdout.write(`  t+${Math.round((Date.now() - start) / 1000)}s phase=${r.phase} articles=${r.articles} events=${r.events} think=${r.thinking}\n`);
  }
  console.log(`Final: phase=${phase} articles=${articleCount} events=${eventCount}`);
  await cdp.snap('/tmp/e2e-real-bs.png');

  // 检查发言质量
  if (articleCount > 0) {
    const firstSpeech = await cdp.run(() => document.querySelector('article')?.innerText || '');
    console.log('First speech sample:', firstSpeech.slice(0, 300));
  }

  // 进入 Debate
  console.log('--- 4. enter debate ---');
  const hasEnter = await cdp.run(() => {
    const btn = [...document.querySelectorAll('button')].find(b => (b.innerText || '').toLowerCase().includes('进入 debate'));
    return !!btn;
  });
  if (hasEnter) {
    await cdp.run(() => {
      [...document.querySelectorAll('button')].find(b => (b.innerText || '').toLowerCase().includes('进入 debate')).click();
      return 'clicked';
    });

    // 等 60 秒
    console.log('--- 5. wait for debate ---');
    const dstart = Date.now();
    while (Date.now() - dstart < 90000) {
      const r = await cdp.run(() => {
        const txt = document.body.innerText;
        const ph = txt.includes('DEBATE 进行中') ? 'debate'
                 : txt.includes('BRAINSTORM 进行中') ? 'brainstorm'
                 : 'unknown';
        return { phase: ph, articles: document.querySelectorAll('article').length };
      });
      process.stdout.write(`  t+${Math.round((Date.now() - dstart) / 1000)}s phase=${r.phase} articles=${r.articles}\n`);
      if (r.phase === 'unknown' && r.articles >= 3) break;  // 全部跑完
      await new Promise(r => setTimeout(r, 1000));
    }
    await cdp.snap('/tmp/e2e-real-debate.png');
  }

  // 生成报告
  console.log('--- 6. generate report ---');
  await cdp.run(() => {
    const btn = [...document.querySelectorAll('button')].find(b => (b.innerText || '').toLowerCase().includes('生成报告'));
    if (btn && !btn.disabled) btn.click();
    return btn ? 'clicked' : 'no btn';
  });
  await new Promise(r => setTimeout(r, 30000));
  await cdp.snap('/tmp/e2e-real-report.png');

  ws.close();
  process.exit(0);
})().catch(e => {
  console.error('ERROR:', e);
  process.exit(1);
});
