/** Synthetic ChatGPT-like page. All content is generated locally, with no API calls. */
export function fixtureHTML() {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Conversation Navigator — local browser fixture</title><link rel="icon" href="data:,">
<style>
*{box-sizing:border-box}html,body{margin:0;height:100%;font:16px/1.6 system-ui,sans-serif;background:#fff;color:#222}
body.dark{background:#212121;color:#eee}header{height:56px;border-bottom:1px solid #8883;padding:12px 24px}
main{height:calc(100vh - 56px);overflow:auto;scroll-behavior:auto;padding:12px 24px 140px;overflow-anchor:none}
#turns{max-width:720px;margin:auto}article{margin:12px 0 30px;min-height:90px;padding:18px;border-radius:14px;overflow-wrap:anywhere}
article:has([data-message-author-role="user"]){background:#8881;margin-left:70px}article:has([data-message-author-role="assistant"]){min-height:135px}
pre{white-space:pre-wrap;background:#8881;padding:12px}table{border-collapse:collapse}td,th{border:1px solid #8888;padding:4px 12px}
form{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);width:min(680px,calc(100vw - 32px));height:68px;padding:10px 18px;background:#f4f4f4;border:1px solid #8885;border-radius:22px;z-index:5;display:flex;gap:10px}
body.dark form{background:#303030}textarea{flex:1;min-width:0;background:transparent;color:inherit;border:0;resize:none}form button{border:0;border-radius:50%;width:40px;background:#222;color:white}
</style></head><body><header>ChatGPT · 本地模拟测试页面</header><main><div id="turns"></div></main>
<form aria-label="聊天输入框"><textarea id="prompt-textarea" aria-label="消息输入框" placeholder="输入消息"></textarea><button type="submit" data-testid="send-button" aria-label="发送消息">↑</button></form>
<script>
(() => {
 const turns=document.querySelector('#turns'),main=document.querySelector('main');let serial=0,loader=null;
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const rich={
  1:'<p>第一条提问：如何学习浏览器扩展？希望按步骤解释。这里有一段超过五十个字符的描述，用来验证问题摘要会被正确截断，并且完整内容可以悬停查看。</p>',
  2:'<p>解释以下 JavaScript 代码：</p><pre><code>function add(a, b) {\\n  return a + b;\\n}</code></pre>',
  3:'<p>Markdown 表格为什么这样渲染？</p><table><thead><tr><th>名称</th><th>值</th></tr></thead><tbody><tr><td>示例</td><td>42</td></tr></tbody></table>',
  4:'<p>请分析这张图片</p><img alt="示例电路图" width="100" height="48" src="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27100%27 height=%2748%27%3E%3Crect width=%27100%27 height=%2748%27 fill=%27%23ccc%27/%3E%3C/svg%3E">',
  5:'<p>这个问题会重复出现，两个目标应保持独立。</p>',
  6:'<p>这个问题会重复出现，两个目标应保持独立。</p>',
  7:'<p>English Search: HELLO World and Case Insensitive.</p>',
  8:'<p>&lt;img src=x onerror=alert(1)&gt; 是纯文本，不应执行。</p>',
  9:'<img alt="只有图片的用户消息" width="100" height="48" src="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27100%27 height=%2748%27%3E%3C/svg%3E">'
 };
 function article(role,id,text,html){
  const a=document.createElement('article');a.dataset.testid='conversation-turn-'+serial++;
  const m=document.createElement('div');m.dataset.messageAuthorRole=role;m.dataset.messageId=id;
  if(html)m.innerHTML=html;else{const p=document.createElement('p');p.textContent=text;m.append(p)}
  a.append(m);return a;
 }
 function pair(n,prefix='u',options={}){
  const fragment=document.createDocumentFragment();
  fragment.append(article('user',prefix+'-'+n,options.text||'第 '+n+' 条普通提问：请解释长对话中的索引、性能与定位。',options.rich?rich[n]:null));
  fragment.append(article('assistant','a-'+prefix+'-'+n,'助手回答 '+n+'：这段回答不应该出现在用户问题目录中。'+ ' 用于模拟真实回答的长度。'.repeat(14)));
  return fragment;
 }
 function reset(count=80,prefix='u',options={rich:true}){loader=null;serial=0;turns.replaceChildren();for(let n=1;n<=count;n++)turns.append(pair(n,prefix,options));main.scrollTop=main.scrollHeight}
 window.fixture={
  reset,
  append(text='新发送的用户问题',id='new-'+Date.now()){turns.append(article('user',id,text));return id},
  assistant(text='助手正在生成'){const a=article('assistant','stream-'+Date.now(),text);turns.append(a);return a.querySelector('p')},
  prepend(count=3,prefix='older'){const f=document.createDocumentFragment();for(let n=1;n<=count;n++)f.append(pair(n,prefix));turns.prepend(f)},
  clone(id){const m=turns.querySelector('[data-message-id="'+id+'"]');const clone=m.closest('article').cloneNode(true);turns.append(clone)},
  remove(id){turns.querySelector('[data-message-id="'+id+'"]')?.closest('article').remove()},
  remount(id){const old=turns.querySelector('[data-message-id="'+id+'"]')?.closest('article');if(old)old.replaceWith(old.cloneNode(true))},
  route(path,count=4,prefix='route',delay=180){history.pushState({},'',path);setTimeout(()=>reset(count,prefix,{rich:false}),delay)},
  armHistory(count=3,delay=120){loader={count,delay};main.scrollTop=Math.min(400,main.scrollHeight-main.clientHeight)},
  dark(value){document.body.classList.toggle('dark',value);document.documentElement.classList.toggle('dark',value);document.documentElement.style.colorScheme=value?'dark':'light'},
  fallback(){turns.replaceChildren();const a=document.createElement('article');a.dataset.turn='user';a.dataset.messageId='semantic-1';a.setAttribute('aria-label','你说：');a.innerHTML='<p>语义降级提问：通过稳定的用户回合标记识别。</p>';turns.append(a)},
  unknown(){turns.innerHTML='<section><p>DOM 结构已经改变，无法确定发言者。</p></section>'},
  lateRole(){const a=document.createElement('article');a.dataset.testid='conversation-turn-'+serial++;a.innerHTML='<div data-message-id="late-role"><p>延迟标记的用户消息</p></div>';turns.append(a);setTimeout(()=>a.firstElementChild.setAttribute('data-message-author-role','user'),120)},
  raw(){return [...turns.querySelectorAll('[data-message-author-role="user"]')].map(e=>({id:e.dataset.messageId,text:e.textContent}))}
 };
 main.addEventListener('scroll',()=>{if(main.scrollTop<=2&&loader){const current=loader;loader=null;setTimeout(()=>window.fixture.prepend(current.count),current.delay)}});
 document.querySelector('form').addEventListener('submit',e=>{e.preventDefault();const input=document.querySelector('textarea');if(input.value){window.fixture.append(input.value);input.value=''}});
 reset(Number(new URL(location.href).searchParams.get('count') ?? 80));
})();
</script></body></html>`;
}
