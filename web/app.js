'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const isExtension=location.protocol==='chrome-extension:'&&Boolean(window.chrome?.runtime?.id);
  const paths = {
    server:'<rect x="4" y="3" width="16" height="7" rx="1"/><rect x="4" y="14" width="16" height="7" rx="1"/><path d="M7 6.5h.01M7 17.5h.01M15 6.5h2M15 17.5h2"/>',
    network:'<rect x="3" y="13" width="18" height="7" rx="1"/><path d="M7 16.5h.01M11 16.5h.01M6 13V9m12 4V9M8 6a6 6 0 0 1 8 0M5 3a10 10 0 0 1 14 0"/>',
    play:'<rect x="3" y="4" width="18" height="14" rx="1"/><path d="m10 8 5 3-5 3ZM8 21h8m-4-3v3"/>',
    download:'<path d="M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5"/>',
    code:'<path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18"/>',
    globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6.5h14M5 17.5h14"/>',
    folder:'<path d="M3 6h6l2 3h10v12H3ZM3 6V3h6l3 3h9v3"/>',
    shield:'<path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6ZM8 12l3 3 5-6"/>',
    terminal:'<rect x="3" y="4" width="18" height="16" rx="1"/><path d="m6 8 4 4-4 4m7 0h5"/>',
    music:'<path d="M9 18V5l11-2v13M9 9l11-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="17" cy="16" rx="3" ry="3"/>',
    home:'<path d="m3 11 9-8 9 8M5 9v12h14V9M9 21v-7h6v7"/>',
    link:'<path d="m10 13 4-4m-6 6-2 2a3 3 0 0 0 4 4l4-4a3 3 0 0 0 0-4M10 11a3 3 0 0 1 0-4l4-4a3 3 0 0 1 4 4l-2 2"/>'
  };
  function icon(name) { const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('aria-hidden','true'); svg.innerHTML=paths[name]||paths.link; return svg; }
  function el(tag, cls, text) { const e=document.createElement(tag); if(cls)e.className=cls; if(text!==undefined)e.textContent=text; return e; }
  function readMode() { try{return localStorage.getItem('blueport:mode')||'auto';}catch{return 'auto';} }
  let mode=readMode(); if(!['auto','lan','wan'].includes(mode))mode='auto';
  let config=null, etag='', category='all', detected=false, detail='尚未检测', checking=false;
  let controller=null, probeEpoch=0, loadEpoch=0, lastProbe=0, events=null, matches=[], active=0, returnFocus=null;
  const searchDialog=$('search-dialog'), networkDialog=$('network-dialog'), input=$('search-input');
  const isLAN=()=>mode==='lan'||(mode==='auto'&&detected);
  function destination(s){return isLAN()?(s.internal_url||s.public_url):(s.public_url||s.internal_url);}
  function addressLabel(s){if(!s.public_url)return '仅内网';if(!s.internal_url)return '公网';return isLAN()?'内网直达':'公网访问';}
  function safeURL(s){try{const u=new URL(destination(s));return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'#';}catch{return '#';}}
  function renderNetwork(){
    $('network-label').textContent=mode==='lan'?'手动 · 内网':mode==='wan'?'手动 · 公网':checking?'正在检测':detected?'自动 · 内网':'自动 · 公网';
    $('network-dot').className='status-dot'+(checking?' checking':isLAN()?' lan':'');
    $('network-detail').textContent=detail;
    document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
  }
  function renderServices(){
    if(!config)return;
    const list=config.services.filter(s=>category==='all'||s.category===category), frag=document.createDocumentFragment();
    $('section-label').textContent=category==='all'?'全部服务':config.categories.find(c=>c.id===category)?.name||'全部服务';
    for(const s of list){
      const a=el('a','service');a.href=safeURL(s);a.target='_blank';a.rel='noopener noreferrer';a.title=s.description||s.name;a.setAttribute('aria-label',`${s.name}，${addressLabel(s)}${s.description?'，'+s.description:''}，在新标签页打开`);
      const box=el('span','service-icon');box.append(icon(s.icon));const info=el('span','service-info');info.append(el('span','service-name',s.name),el('span','service-meta',addressLabel(s)));
      const arrow=icon('link');arrow.innerHTML='<path d="M6 18 18 6M6 6h12v12"/>';arrow.classList.add('service-arrow');a.append(box,info,arrow);
      if(s.description){const tip=el('span','service-tooltip',s.description);tip.id=`description-${s.id}`;a.setAttribute('aria-describedby',tip.id);a.append(tip);}
      frag.append(a);
    }
    if(!list.length)frag.append(el('p','empty','这个分类还没有服务。让 AI 在 YAML 中添加一个入口。'));
    $('services').replaceChildren(frag);
    if(searchDialog.open)renderResults();
  }
  function renderCategories(){
    const frag=document.createDocumentFragment();
    for(const c of [{id:'all',name:'全部'},...config.categories]){
      const b=el('button','tab');b.type='button';b.setAttribute('aria-pressed',String(c.id===category));
      b.append(el('span','',c.name),el('span','tab-count',String(config.services.filter(s=>c.id==='all'||s.category===c.id).length)));
      b.addEventListener('click',()=>{category=c.id;renderCategories();renderServices();$('categories').querySelector(`[data-category="${c.id}"]`)?.focus();});
      b.dataset.category=c.id;frag.append(b);
    }
    $('categories').replaceChildren(frag);
  }
  function render(){
    document.title=`${config.title} · Blueport`;$('title').textContent=config.title;$('subtitle').textContent=config.subtitle||'YOUR SERVICES, ONE PORT.';
    $('service-total').textContent=String(config.services.length).padStart(2,'0');
    if(category!=='all'&&!config.categories.some(c=>c.id===category))category='all';
    renderCategories();renderServices();renderNetwork();
  }
  async function load(){
    if(isExtension){
      if(config)return;
      config=window.BLUEPORT_CONFIG;
      if(!config){$('footer-status').textContent='扩展配置缺失 · 请重新生成扩展';return;}
      etag='local';render();$('footer-status').textContent='本地新标签页 · 按需检测网络';probe(true);return;
    }
    const epoch=++loadEpoch;
    try{
      const res=await fetch('/api/config',{cache:'no-cache',headers:etag?{'If-None-Match':etag}:{},signal:AbortSignal.timeout(5000)});
      if(epoch!==loadEpoch||res.status===304)return;if(!res.ok)throw Error('config');
      const next=await res.json(),old=config?.network;
      if(epoch!==loadEpoch)return;
      etag=res.headers.get('ETag')||'';config=next;render();$('footer-status').textContent='本地配置 · 按需检测网络';
      if(!old||JSON.stringify(old)!==JSON.stringify(config.network))probe(true);
    }catch{
      if(epoch!==loadEpoch)return;
      $('footer-status').textContent=config?'连接中断 · 保留当前页面':'配置读取失败 · 请检查服务';
      if(!config){const p=el('p','empty','暂时无法读取配置。');const b=el('button','','重试');b.type='button';b.addEventListener('click',()=>{load();connectEvents();});p.append(b);$('services').replaceChildren(p);}
    }
  }
  function connectEvents(){
    if(isExtension)return;
    if(document.hidden||events)return;
    events=new EventSource('/api/events');
    events.addEventListener('config',e=>{if(e.data!==etag)load();});
    events.onerror=()=>{$('footer-status').textContent='连接中断 · 等待恢复';};
    events.onopen=()=>{if(config)$('footer-status').textContent='本地配置 · 按需检测网络';};
  }
  async function probe(force=false){
    if(!config)return;if(!force&&Date.now()-lastProbe<2500)return;lastProbe=Date.now();
    controller?.abort();const epoch=++probeEpoch;controller=null;checking=false;
    if(mode!=='auto'){detail=mode==='lan'?'已手动使用内网地址；不会进行自动探测。':'已手动使用公网地址；仅内网服务仍可点击。';renderNetwork();renderServices();return;}
    detected=false;renderServices();
    if(!config.network.probe_url){detail='尚未配置内网探测。请让 AI 在 YAML 中填写 NAS 固定内网 IP 的 probe_url 和公网面板 allowed_origins；目前使用公网优先。';renderNetwork();return;}
    checking=true;detail='正在确认家庭内网是否可达…';renderNetwork();
    const localController=new AbortController();controller=localController;const timeout=setTimeout(()=>localController.abort(),config.network.timeout_ms);
    try{
      const r=await fetch(config.network.probe_url,{cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:localController.signal});
      const body=await r.text();if(epoch!==probeEpoch)return;
      detected=r.ok&&(isExtension&&config.network.probe_contains?body.includes(config.network.probe_contains):body===`blueport:${config.network.probe_id}`);
      detail=detected?'已确认家庭内网可达，优先使用内网地址。':'未确认家庭内网，使用公网优先；可以手动选择内网。';
    }catch{if(epoch!==probeEpoch)return;detail='内网探测不可达、超时或被浏览器阻止，目前使用公网优先。若在家，可检查本地网络权限与跨域配置，或手动选择内网。';}
    finally{clearTimeout(timeout);if(epoch===probeEpoch){checking=false;renderNetwork();renderServices();}}
  }
  function renderResults(){
    if(!config)return;const terms=input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    matches=config.services.filter(s=>terms.every(t=>s.search.includes(t)));active=Math.min(Math.max(active,0),Math.max(matches.length-1,0));
    const frag=document.createDocumentFragment();matches.forEach((s,i)=>{
      const row=el('div','pal-option');row.id=`result-${i}`;row.setAttribute('role','option');row.setAttribute('aria-selected',String(i===active));
      const info=el('span','pal-info');info.append(el('span','pal-name',s.name),el('span','pal-desc',s.description||addressLabel(s)));
      row.append(icon(s.icon),info,el('span','pal-category',config.categories.find(c=>c.id===s.category)?.name||''));
      row.addEventListener('click',()=>openService(s));frag.append(row);
    });
    if(!matches.length)frag.append(el('p','empty','没有匹配的服务，试试名称或拼音首字母。'));
    $('search-results').replaceChildren(frag);$('result-count').textContent=`${matches.length} 个结果`;
    if(matches.length)input.setAttribute('aria-activedescendant',`result-${active}`);else input.removeAttribute('aria-activedescendant');
  }
  function openService(s){const a=el('a');a.href=safeURL(s);a.target='_blank';a.rel='noopener noreferrer';document.body.append(a);a.click();a.remove();searchDialog.close();}
  function showSearch(){if(!config||networkDialog.open||searchDialog.open)return;returnFocus=document.activeElement;input.value='';active=0;renderResults();searchDialog.showModal();input.focus();}
  input.addEventListener('input',()=>{active=0;renderResults();});
  input.addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();if(matches[active])openService(matches[active]);}
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!matches.length)return;active=(active+(e.key==='ArrowDown'?1:-1)+matches.length)%matches.length;renderResults();$(`result-${active}`)?.scrollIntoView({block:'nearest'});}
  });
  searchDialog.addEventListener('close',()=>returnFocus?.focus());
  $('search-open').addEventListener('click',showSearch);$('search-hint').addEventListener('click',showSearch);
  document.addEventListener('keydown',e=>{if(e.isComposing)return;const editable=e.target.matches('input,textarea,[contenteditable]');if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'||e.key==='/'&&!editable){e.preventDefault();showSearch();}});
  $('network-open').addEventListener('click',()=>{renderNetwork();networkDialog.showModal();});
  document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;try{localStorage.setItem('blueport:mode',mode);}catch{}probe(true);}));
  $('probe-retry').addEventListener('click',()=>{mode='auto';try{localStorage.setItem('blueport:mode',mode);}catch{}probe(true);});
  for(const dialog of [searchDialog,networkDialog])dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  function suspend(){events?.close();events=null;++probeEpoch;controller?.abort();controller=null;checking=false;lastProbe=0;}
  document.addEventListener('visibilitychange',()=>{if(document.hidden){suspend();}else{load();connectEvents();probe(true);}});
  window.addEventListener('focus',()=>{load();probe();});window.addEventListener('online',()=>{load();probe(true);});window.addEventListener('offline',()=>{controller?.abort();++probeEpoch;checking=false;detected=false;detail='网络已断开；保持公网优先，可手动选择内网。';renderNetwork();renderServices();});
  navigator.connection?.addEventListener('change',()=>probe(true));
  window.addEventListener('pagehide',suspend);window.addEventListener('pageshow',e=>{connectEvents();if(e.persisted){load();probe(true);}});
  renderNetwork();load();connectEvents();
})();
