"""Build an offline-first MV3 new-tab extension from the same validated YAML.

Example: python scripts/build_extension.py --config data/config.yaml
  --go /path/to/go --probe-url http://192.168.1.10:5666/ --probe-contains fnOS
No browser installation or settings changes are performed.
"""
import argparse
import ipaddress
import json
from pathlib import Path
import shutil
import subprocess
from urllib.parse import urlsplit
import zipfile

ROOT=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--config',default='config.example.yaml')
    parser.add_argument('--go',default='go')
    parser.add_argument('--probe-url',help='Private-IP HTTP(S) endpoint; overrides the website probe URL')
    parser.add_argument('--probe-contains',help='Expected response marker, e.g. fnOS; extension only')
    args=parser.parse_args()
    if bool(args.probe_url)!=bool(args.probe_contains):
        parser.error('--probe-url and --probe-contains must be supplied together')
    result=subprocess.run([args.go,'run','.', '-config',str(Path(args.config).resolve()),'-export-config'],cwd=ROOT,capture_output=True,check=True)
    config=json.loads(result.stdout)
    if args.probe_url:
        config['network']['probe_url']=args.probe_url
        config['network']['probe_contains']=args.probe_contains
    probe=config['network']['probe_url']
    permissions=[];connect="'self' https://api.github.com"
    if probe:
        url=urlsplit(probe)
        if url.scheme not in ('http','https') or url.username or url.password or url.fragment:
            raise ValueError('Probe must be HTTP(S), without credentials or fragment')
        address=ipaddress.ip_address(url.hostname)
        if not (address.is_private or address.is_loopback):
            raise ValueError('Extension probe must target a private IP')
        host=f'[{url.hostname}]' if address.version==6 else url.hostname
        # Chrome host match patterns scope hosts, not ports. CSP narrows the actual port.
        permissions=[f'{url.scheme}://{host}/*']
        connect+=f' {url.scheme}://{url.netloc}'
    manifest={
        'manifest_version':3,'name':'Blueport · 导航','version':(ROOT/'EXTENSION_VERSION').read_text().strip(),
        'description':'紧凑、本地优先的 NAS 新标签页，支持拼音搜索和内外网选址。',
        'chrome_url_overrides':{'newtab':'index.html'},
        'icons':{'64':'icons/icon_64.png','256':'icons/icon_256.png'},
        'content_security_policy':{'extension_pages':f"default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src {connect}; object-src 'none'; base-uri 'none'"}
    }
    if permissions:manifest['host_permissions']=permissions
    dist=ROOT/'dist';dist.mkdir(exist_ok=True)
    out=dist/'blueport-extension'
    # This directory contains only generated assets; retain any existing directory
    # as a backup instead of recursively deleting it.
    if out.exists():
        import time
        out.rename(dist/f'blueport-extension-backup-{time.time_ns()}')
    shutil.copytree(ROOT/'web',out)
    html=(out/'index.html').read_text(encoding='utf-8')
    html=html.replace('<script defer src="/app.js"></script>','<script defer src="/config.js"></script>\n  <script defer src="/app.js"></script>\n  <script defer src="/update.js"></script>')
    html=html.replace('href="/" aria-label="Blueport 首页"','href="index.html" aria-label="Blueport 首页"')
    (out/'index.html').write_text(html,encoding='utf-8',newline='\n')
    (out/'config.js').write_text('"use strict";\nwindow.BLUEPORT_CONFIG = '+json.dumps(config,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8',newline='\n')
    (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    shutil.copytree(ROOT/'packaging/fnos/app/ui/images',out/'icons',ignore=shutil.ignore_patterns('.DS_Store'))
    shutil.copytree(ROOT/'docs/licenses',out/'licenses')
    shutil.copy2(ROOT/'LICENSE',out/'licenses/blueport.txt')
    shutil.copy2(ROOT/'scripts/update_extension.py',out/'update.py')
    archive=dist/'blueport-extension.zip'
    with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for file in sorted(out.rglob('*')):
            if file.is_file():z.write(file,file.relative_to(out).as_posix())
    print(json.dumps({'folder':str(out),'zip':str(archive),'services':len(config['services']),'host_permissions':permissions,'zip_bytes':archive.stat().st_size,'runtime_dependencies':[]},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
