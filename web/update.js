'use strict';
(() => {
  if(location.protocol!=='chrome-extension:'||!window.chrome?.runtime?.id)return;
  const repo='https://github.com/zhnq/Blueport', api='https://api.github.com/repos/zhnq/Blueport/releases/latest';
  const current=chrome.runtime.getManifest().version;
  const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
  const open=node('button','update-open',`v${current} · 检查更新`);open.id='update-open';open.type='button';
  document.querySelector('.footer-brand').replaceWith(open);
  const dialog=node('dialog','dialog update-dialog');dialog.id='update-dialog';dialog.setAttribute('aria-labelledby','update-title');
  const head=node('div','dialog-head'), title=node('h2','','检查更新');title.id='update-title';
  const close=node('button','close-button','×');close.type='button';close.setAttribute('aria-label','关闭更新');close.addEventListener('click',()=>dialog.close());head.append(title,close);
  const body=node('div','update-body'), status=node('p','update-status',`当前版本 v${current}`);status.id='update-status';status.setAttribute('role','status');
  const notes=node('pre','release-notes');notes.hidden=true;
  const help=node('p','update-help','仅点击时连接 GitHub。解压版无法直接安装更新：下载后用包内 update.py 保留原配置更新，再到扩展管理页点击“重新加载”。');
  const command=node('code','update-command','python update.py --target "旧扩展目录"');help.append(document.createElement('br'),command);
  const actions=node('div','update-actions'), check=node('button','outline-button','检查更新'), download=node('a','outline-button','下载新版'), release=node('a','outline-button','查看发布页');
  check.type='button';check.id='update-check';download.id='update-download';download.hidden=true;release.href=repo+'/releases/latest';
  for(const a of [download,release]){a.target='_blank';a.rel='noopener noreferrer';}
  actions.append(check,download,release);body.append(status,notes,help,actions);dialog.append(head,body);document.body.append(dialog);
  const parts=v=>/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(v)?v.split('.').map(Number):null;
  const newer=(a,b)=>{for(let i=0;i<4;i++){const x=a[i]||0,y=b[i]||0;if(x!==y)return x>y;}return false;};
  let controller=null;
  async function inspect(){
    if(controller)return;
    const request=new AbortController();controller=request;check.disabled=true;download.hidden=true;download.removeAttribute('href');notes.hidden=true;notes.textContent='';status.textContent='正在查询 GitHub…';
    const timeout=setTimeout(()=>request.abort(),8000);
    try{
      const response=await fetch(api,{signal:request.signal,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',headers:{Accept:'application/vnd.github+json'}});
      if(response.status===404)throw Error('尚无公开 Release。');
      if(response.status===403||response.status===429)throw Error('GitHub 请求受限，请稍后再试。');
      if(!response.ok)throw Error(`GitHub 暂时不可用（${response.status}）。`);
      const data=await response.json(), tag=typeof data.tag_name==='string'?data.tag_name:'', version=tag.replace(/^v/,'');
      if(data.draft||data.prerelease||!parts(version))throw Error('最新发布版本格式不受支持，请查看发布页。');
      release.href=repo+'/releases/tag/'+encodeURIComponent(tag);
      if(!newer(parts(version),parts(current))){status.textContent=`已是最新版本 · v${current}`;return;}
      status.textContent=`发现新版本 v${version} · 当前 v${current}`;
      notes.textContent=typeof data.body==='string'?data.body.slice(0,10000):'此版本没有更新说明。';notes.hidden=false;
      const asset=data.assets?.find(a=>a.name===`blueport-extension-${version}.zip`||a.name==='blueport-extension.zip');
      const expected=asset&&`${repo}/releases/download/${encodeURIComponent(tag)}/${asset.name}`;
      if(asset&&asset.browser_download_url===expected){download.href=expected;download.hidden=false;}
      else status.textContent+='；尚无扩展包，请查看发布页。';
    }catch(error){status.textContent=request.signal.aborted?'检查已取消或超时，请重试。':error.name==='TypeError'?'无法连接 GitHub，请检查网络后重试。':error.message;}
    finally{clearTimeout(timeout);controller=null;check.disabled=false;}
  }
  open.addEventListener('click',()=>{if(document.querySelector('dialog[open]'))return;dialog.showModal();inspect();});
  check.addEventListener('click',inspect);
  dialog.addEventListener('close',()=>{controller?.abort();open.focus();});
  window.addEventListener('pagehide',()=>controller?.abort());
})();
