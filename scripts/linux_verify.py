"""Verify FPK payload/lifecycle on Linux without installing into fnOS.

Usage: python3 scripts/linux_verify.py dist/blueport-0.1.0-amd64.fpk
Runs only in a new temp directory; requires the manifest service port to be free.
"""
import gzip
import io
import json
import os
import re
from pathlib import Path
import socket
import subprocess
import sys
import tarfile
import tempfile
import time
from urllib.request import build_opener, ProxyHandler, Request

def main():
    root=Path(tempfile.mkdtemp(prefix='blueport-verification-'))
    with tarfile.open(sys.argv[1]) as archive:
        assert archive.getmember('cmd/main').mode & 0o111
        archive.extractall(root,filter='data')
    target=root/'target'
    target.mkdir()
    with tarfile.open(root/'app.tgz') as app:
        assert app.getmember('server/blueport').mode & 0o111
        app.extractall(target,filter='data')
    data=root/'data'
    data.mkdir()
    env=dict(os.environ,TRIM_APPDEST=str(target),TRIM_PKGVAR=str(data))
    port=int(re.search(r'^service_port\s*=\s*(\d+)',(root/'manifest').read_text(),re.M).group(1))
    script=root/'cmd/main'
    def ctl(action):
        return subprocess.run(['bash',str(script),action],env=env,capture_output=True,text=True)
    check=socket.socket()
    check.bind(('0.0.0.0',port))
    check.close()
    opener=build_opener(ProxyHandler({}))
    try:
        result=ctl('start')
        assert result.returncode==0, result.stderr+(data/'blueport.log').read_text()
        assert ctl('status').returncode==0
        pid=int((data/'blueport.pid').read_text())
        assert ctl('start').returncode==0
        assert pid==int((data/'blueport.pid').read_text()),'start not idempotent'
        total=0
        for path in ['/','/style.css','/app.js','/fonts/iosevka-regular.woff2','/fonts/iosevka-bold.woff2','/favicon.svg','/api/config']:
            with opener.open(Request(f'http://127.0.0.1:{port}'+path,headers={'Accept-Encoding':'gzip'}),timeout=3) as response:
                body=response.read();total+=len(body)
                if path=='/api/config': config=json.loads(body)
        assert total<=204800
        with opener.open(f'http://127.0.0.1:{port}/api/probe',timeout=3) as response:
            assert response.read()==b'blueport:blueport-home'
        def ticks():
            fields=Path(f'/proc/{pid}/stat').read_text().split()
            return int(fields[13])+int(fields[14])
        start=ticks();time.sleep(3);delta=ticks()-start
        status=Path(f'/proc/{pid}/status').read_text()
        rss_kib=int(next(l for l in status.splitlines() if l.startswith('VmRSS:')).split()[1])
        original=(data/'config.yaml').read_bytes()
        stopped=ctl('stop');assert stopped.returncode==0,stopped.stderr
        assert ctl('status').returncode==3
        assert (data/'config.yaml').read_bytes()==original
        assert ctl('start').returncode==0
        assert (data/'config.yaml').read_bytes()==original
        print(json.dumps({'environment':'WSL Linux x86_64; not actual fnOS','lifecycle_start_stop_status_restart':'passed','executable_permissions':'passed','compressed_body_bytes':total,'services':len(config['services']),'rss_mib':round(rss_kib/1024,2),'idle_cpu_core_percent_3s':round(delta/os.sysconf('SC_CLK_TCK')/3*100,3),'staging':str(root)},indent=2))
    finally:
        ctl('stop')

if __name__=='__main__':main()
