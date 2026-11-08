// DOM behavior checks, not rendered browser or pixel-fidelity verification.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {JSDOM}=require('jsdom');
const html=readFileSync('web/index.html','utf8'), js=readFileSync('web/app.js','utf8'), updateJS=readFileSync('web/update.js','utf8');
function fixture(){return {version:1,title:'导航',subtitle:'YOUR SERVICES, ONE PORT.',network:{probe_url:'',probe_id:'home',timeout_ms:300},categories:[{id:'home',name:'家庭'},{id:'tools',name:'工具'}],services:[{id:'nas',name:'飞牛 NAS',description:'家庭存储',category:'home',icon:'server',internal_url:'http://192.168.1.10:5666',public_url:'https://nas.example.com',search:'飞牛 nas 家庭存储 feiniu fn'},{id:'router',name:'路由器',description:'网络',category:'home',icon:'network',internal_url:'http://192.168.1.1',public_url:'',search:'路由器 luyouqi lyq'},{id:'github',name:'GitHub',description:'代码',category:'tools',icon:'code',internal_url:'',public_url:'https://github.com',search:'github 代码 daima dm'}]};}
async function boot(config=fixture(),probe=()=>Promise.reject(Error('unreachable')),options={}){
  const dom=new JSDOM(html,{url:options.extension?'chrome-extension://blueport-test/index.html':'http://127.0.0.1:48173',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;w.AbortController=AbortController;w.AbortSignal=AbortSignal;
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  let closed=0,eventSources=0;const requests=[];w.EventSource=class{constructor(){eventSources++;}addEventListener(){}close(){closed++;}};
  if(options.extension){w.chrome={runtime:{id:'blueport-test',getManifest:()=>({version:options.version||'0.1.1'})}};w.BLUEPORT_CONFIG=config;}
  w.fetch=async(url,init)=>{requests.push(url);return url==='/api/config'?new Response(JSON.stringify(config),{headers:{ETag:'"v1"'}}):url.startsWith('https://api.github.com/')?options.release(url,init):probe();};
  w.eval(js);w.eval(updateJS);await new Promise(r=>setTimeout(r,15));
  return {dom,w,d:w.document,closed:()=>closed,requests,eventSources:()=>eventSources};
}
test('initial directory, classification, and public-first link policy',async()=>{
  const {dom,d}=await boot();try{
    assert.equal(d.querySelectorAll('.service').length,3);
    assert.equal(d.querySelector('.service').href,'https://nas.example.com/');
    assert.equal(d.querySelectorAll('.service')[1].href,'http://192.168.1.1/');
    assert.equal(d.querySelector('.service').target,'_blank');
    d.querySelector('[data-category="tools"]').click();
    assert.equal(d.querySelectorAll('.service').length,1);assert.equal(d.querySelector('.service-name').textContent,'GitHub');
    assert.equal(d.activeElement.dataset.category,'tools');
  }finally{dom.window.close();}
});
test('pinyin search, keyboard navigation, no matches, and focus restore',async()=>{
  const {dom,w,d}=await boot();try{
    d.getElementById('search-open').focus();d.getElementById('search-open').click();
    const input=d.getElementById('search-input');assert.equal(d.getElementById('search-dialog').open,true);
    input.value='lyq';input.dispatchEvent(new w.Event('input'));assert.equal(d.querySelectorAll('.pal-option').length,1);assert.equal(d.querySelector('.pal-name').textContent,'路由器');
    input.value='no-such-service';input.dispatchEvent(new w.Event('input'));assert.equal(d.querySelectorAll('.pal-option').length,0);assert.equal(input.hasAttribute('aria-activedescendant'),false);
    input.value='';input.dispatchEvent(new w.Event('input'));input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));assert.equal(input.getAttribute('aria-activedescendant'),'result-1');
    d.getElementById('search-dialog').close();assert.equal(d.activeElement.id,'search-open');
  }finally{dom.window.close();}
});
test('successful LAN probe, manual modes, and immutable public-only service',async()=>{
  const c=fixture();c.network.probe_url='http://192.168.1.10:8787/api/probe';
  const {dom,d,w}=await boot(c,async()=>new Response('blueport:home'));
  try{
    assert.equal(d.querySelector('.service').href,'http://192.168.1.10:5666/');
    assert.equal(d.querySelectorAll('.service')[2].href,'https://github.com/');
    d.querySelector('[data-mode="wan"]').click();assert.equal(d.querySelector('.service').href,'https://nas.example.com/');
    d.querySelector('[data-mode="lan"]').click();assert.equal(d.querySelector('.service').href,'http://192.168.1.10:5666/');
    assert.equal(w.localStorage.getItem('blueport:mode'),'lan');
  }finally{dom.window.close();}
});
test('failed or wrong-instance probe falls back; config text cannot inject markup',async()=>{
  const c=fixture();c.title='<img src=x onerror=alert(1)>';c.services[0].name='<script>bad()</script>';c.network.probe_url='http://192.168.1.10:8787/api/probe';
  const {dom,d}=await boot(c,async()=>new Response('blueport:another-home'));
  try{assert.equal(d.querySelector('.service').href,'https://nas.example.com/');assert.equal(d.querySelector('#title img'),null);assert.equal(d.querySelector('.service-name script'),null);assert.match(d.getElementById('network-detail').textContent,/未确认/);}finally{dom.window.close();}
});
test('older config responses cannot overwrite a newer configuration',async()=>{
  const {dom,w,d}=await boot();
  try{
    const pending=[];w.fetch=()=>new Promise(resolve=>pending.push(resolve));
    w.dispatchEvent(new w.Event('focus'));w.dispatchEvent(new w.Event('focus'));
    assert.equal(pending.length,2);
    const newest=fixture();newest.title='新配置';
    pending[1](new Response(JSON.stringify(newest),{headers:{ETag:'"v3"'}}));
    await new Promise(r=>setTimeout(r,5));
    pending[0](new Response(JSON.stringify(fixture()),{headers:{ETag:'"v2"'}}));
    await new Promise(r=>setTimeout(r,5));
    assert.equal(d.getElementById('title').textContent,'新配置');
  }finally{dom.window.close();}
});
test('hiding the page cancels probe and foreground immediately rechecks',async()=>{
  const config=fixture();config.network.probe_url='http://192.168.1.10:8787/api/probe';
  let attempts=0;const waiting=[];
  const {dom,w,d,closed}=await boot(config,()=>{attempts++;return new Promise(resolve=>waiting.push(resolve));});
  try{
    assert.equal(attempts,1);
    Object.defineProperty(d,'hidden',{configurable:true,value:true});d.dispatchEvent(new w.Event('visibilitychange'));
    assert.ok(closed()>0);
    waiting[0](new Response('blueport:home'));await new Promise(r=>setTimeout(r,5));
    assert.equal(d.querySelector('.service').href,'https://nas.example.com/');
    Object.defineProperty(d,'hidden',{configurable:true,value:false});d.dispatchEvent(new w.Event('visibilitychange'));
    assert.equal(attempts,2);
    waiting[1](new Response('blueport:home'));await new Promise(r=>setTimeout(r,5));
    assert.equal(d.querySelector('.service').href,'http://192.168.1.10:5666/');
  }finally{dom.window.close();}
});
test('extension renders from bundled configuration without config server or SSE',async()=>{
  const {dom,w,d,requests,eventSources}=await boot(fixture(),undefined,{extension:true});
  try{
    assert.equal(d.querySelectorAll('.service').length,3);
    assert.equal(requests.length,0);assert.equal(eventSources(),0);
    assert.match(d.getElementById('footer-status').textContent,/本地新标签页/);
    w.dispatchEvent(new w.Event('focus'));await new Promise(r=>setTimeout(r,5));
    assert.equal(requests.length,0);
    d.getElementById('search-open').click();const input=d.getElementById('search-input');input.value='lyq';input.dispatchEvent(new w.Event('input'));
    assert.equal(d.querySelector('.pal-name').textContent,'路由器');
  }finally{dom.window.close();}
});
test('extension identifies existing NAS page and rejects unrelated responses',async()=>{
  for(const [body,expected] of [['<title>飞牛 fnOS</title>','http://192.168.1.10:5666/'],['<title>Other router</title>','https://nas.example.com/']]){
    const c=fixture();c.network.probe_url='http://192.168.1.10:5666/';c.network.probe_contains='fnOS';
    const {dom,d,requests,eventSources}=await boot(c,async()=>new Response(body),{extension:true});
    try{assert.equal(d.querySelector('.service').href,expected);assert.deepEqual(requests,['http://192.168.1.10:5666/']);assert.equal(eventSources(),0);}finally{dom.window.close();}
  }
});

const releaseAPI='https://api.github.com/repos/zhnq/Blueport/releases/latest';
function releaseFixture(version='0.1.2'){
 const name=`blueport-extension-${version}.zip`;
 return {tag_name:`v${version}`,body:'修复与改进 <img src=x onerror=alert(1)>',draft:false,prerelease:false,assets:[{name,browser_download_url:`https://github.com/zhnq/Blueport/releases/download/v${version}/${name}`}]};
}
const tick=()=>new Promise(r=>setTimeout(r,10));
test('update check is extension-only and makes no automatic requests',async()=>{
 for(const extension of [false,true]){
  const {dom,d,requests}=await boot(fixture(),undefined,{extension});
  try{assert.equal(Boolean(d.getElementById('update-open')),extension);assert.equal(requests.includes(releaseAPI),false);}
  finally{dom.window.close();}
 }
});
test('manual update shows a newer release safely with a validated download',async()=>{
 const {dom,w,d,requests}=await boot(fixture(),undefined,{extension:true,version:'0.1.9',release:()=>new Response(JSON.stringify(releaseFixture('0.1.10')))});
 try{
  d.getElementById('update-open').focus();d.getElementById('update-open').click();await tick();
  d.getElementById('update-check').dispatchEvent(new w.KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true}));assert.equal(d.getElementById('search-dialog').open,false);
  assert.deepEqual(requests,[releaseAPI]);assert.match(d.getElementById('update-status').textContent,/发现新版本 v0.1.10/);
  assert.equal(d.getElementById('update-download').hidden,false);assert.equal(d.querySelector('.release-notes img'),null);
  assert.match(d.querySelector('.release-notes').textContent,/<img/);
  d.getElementById('update-dialog').close();assert.equal(d.activeElement.id,'update-open');
 }finally{dom.window.close();}
});
test('update handles no newer version, unsupported releases, missing assets and hostile URLs',async()=>{
 const cases=[
  [releaseFixture('0.1.1'),/已是最新版本/],
  [releaseFixture('0.1.0'),/已是最新版本/],
  [{...releaseFixture(),tag_name:'v0.2.0-beta'},/格式不受支持/],
  [{...releaseFixture(),prerelease:true},/格式不受支持/],
  [{...releaseFixture(),assets:[]},/尚无扩展包/],
  [{...releaseFixture(),assets:[{name:'blueport-extension-0.1.2.zip',browser_download_url:'https://evil.example/update.zip'}]},/尚无扩展包/]
 ];
 for(const [data,expected] of cases){
  const {dom,d}=await boot(fixture(),undefined,{extension:true,release:()=>new Response(JSON.stringify(data))});
  try{d.getElementById('update-open').click();await tick();assert.match(d.getElementById('update-status').textContent,expected);assert.equal(d.getElementById('update-download').hidden,true);}
  finally{dom.window.close();}
 }
});
test('update errors are recoverable and repeated clicks do not duplicate requests',async()=>{
 for(const code of [403,404,429,500]){
  let done;
  const {dom,d,requests}=await boot(fixture(),undefined,{extension:true,release:()=>new Promise(resolve=>done=resolve)});
  try{
   d.getElementById('update-open').click();d.getElementById('update-check').click();
   assert.equal(requests.length,1);done(new Response('{}',{status:code}));await tick();
   assert.equal(d.getElementById('update-check').disabled,false);assert.equal(d.getElementById('update-download').hidden,true);assert.doesNotMatch(d.getElementById('update-status').textContent,/正在查询/);
  }finally{dom.window.close();}
 }
 const {dom,d}=await boot(fixture(),undefined,{extension:true,release:async()=>{throw new TypeError('offline');}});
 try{d.getElementById('update-open').click();await tick();assert.match(d.getElementById('update-status').textContent,/无法连接/);}finally{dom.window.close();}
});
test('closing the update dialog cancels the request',async()=>{
 let signal;
 const {dom,d}=await boot(fixture(),undefined,{extension:true,release:(_,init)=>new Promise((resolve,reject)=>{signal=init.signal;signal.addEventListener('abort',()=>reject(Error('aborted')));})});
 try{d.getElementById('update-open').click();d.getElementById('update-dialog').close();await tick();assert.equal(signal.aborted,true);assert.equal(d.getElementById('update-check').disabled,false);}finally{dom.window.close();}
});
