// 测试 Gateway 测试连接 + 主题切换
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

(async () => {
  const ws = new WebSocket(await getTarget());
  await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});
  const cdp = new CDP(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  // 1. 打开 Gateway 抽屉
  console.log('--- open Gateway ---');
  await cdp.run(() => {
    [...document.querySelectorAll('button')].find(b => (b.innerText||'').toLowerCase().includes('gateway')).click();
    return 'opened';
  });
  await new Promise(r => setTimeout(r, 600));

  // 2. 展开 Mock Provider 的配置
  console.log('--- expand mock ---');
  await cdp.run(() => {
    const btns = [...document.querySelectorAll('button')];
    // 第一个配置按钮（Mock）
    const expandBtn = btns.find(b => (b.innerText||'').trim() === '配置');
    expandBtn && expandBtn.click();
    return 'expanded';
  });
  await new Promise(r => setTimeout(r, 500));

  // 3. 点击「测试连接」按钮
  console.log('--- click test connection ---');
  const before = await cdp.run(() => [...document.querySelectorAll('button')].filter(b => (b.innerText||'').toLowerCase().includes('测试连接')).map(b => b.disabled));
  console.log('  test buttons disabled state:', before);

  await cdp.run(() => {
    const btn = [...document.querySelectorAll('button')].find(b => (b.innerText||'').toLowerCase().includes('测试连接'));
    btn && btn.click();
    return 'clicked';
  });
  await new Promise(r => setTimeout(r, 1500));

  // 4. 验证状态变化
  const result = await cdp.run(() => {
    const txt = document.body.innerText;
    return {
      hasOk: txt.includes('连接成功'),
      hasFail: txt.includes('API Key 为空') || txt.includes('HTTP'),
      hasLatency: /\d+ms/.test(txt),
    };
  });
  console.log('  test result:', result);

  await cdp.snap('/tmp/e2e-4-gateway-test.png');

  // 5. 测试主题切换（找到主题切换按钮 - 第一个"切换"或moon/sun图标）
  console.log('--- toggle theme ---');
  // 先关掉 gateway drawer
  await cdp.run(() => {
    const x = document.querySelector('button[class*="rounded-md"]');
    // 简化：按 ESC
    return 'noop';
  });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape' });
  await new Promise(r => setTimeout(r, 400));

  // 找带月亮图标的按钮
  await cdp.run(() => {
    // 找含 svg + path d="M21..." 模式的 moon icon
    const all = [...document.querySelectorAll('button')];
    const moon = all.find(b => b.querySelector('.lucide-moon'));
    if (moon) moon.click();
    return moon ? 'toggled' : 'no moon btn';
  });
  await new Promise(r => setTimeout(r, 800));
  await cdp.snap('/tmp/e2e-5-dark.png');

  // 切回 light
  await cdp.run(() => {
    const all = [...document.querySelectorAll('button')];
    const sun = all.find(b => b.querySelector('.lucide-sun'));
    if (sun) sun.click();
    return sun ? 'toggled back' : 'no sun btn';
  });
  await new Promise(r => setTimeout(r, 600));
  await cdp.snap('/tmp/e2e-6-light.png');

  ws.close();
  process.exit(0);
})().catch(e => {
  console.error('ERROR:', e);
  process.exit(1);
});
