// 抓 debate 当前状态并直接读取 article 文本
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

  // 抓所有 article 文本
  const data = await cdp.run(() => {
    return [...document.querySelectorAll('article')].map(a => a.innerText);
  });
  console.log('=== Articles: ' + data.length + ' ===');
  data.forEach((t, i) => {
    console.log(`\n--- Article ${i + 1} ---`);
    console.log(t);
  });
  // 抓事件流
  const events = await cdp.run(() => {
    return [...document.querySelectorAll('.scroll-shadow li')].slice(-15).map(li => li.innerText.slice(0, 200));
  });
  console.log('\n=== Recent events (last 15) ===');
  events.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));

  await cdp.snap('/tmp/e2e-debate-current.png');
  console.log('\nScreenshot saved /tmp/e2e-debate-current.png');

  // 检查 phase 和按钮
  const state = await cdp.run(() => {
    const txt = document.body.innerText;
    return {
      hasReport: !!([...document.querySelectorAll('button')].find(b => (b.innerText || '').toLowerCase().includes('生成报告'))),
      hasEnter: !!([...document.querySelectorAll('button')].find(b => (b.innerText || '').toLowerCase().includes('进入 debate'))),
      phase: txt.includes('DEBATE 进行中') ? 'debate' : txt.includes('BRAINSTORM 进行中') ? 'brainstorm' : (txt.includes('已就绪') || txt.includes('待开始') ? 'idle' : 'unknown'),
      round: (txt.match(/R(\d+)\/(\d+)/) || [])[0],
    };
  });
  console.log('State:', state);

  ws.close();
  process.exit(0);
})();
