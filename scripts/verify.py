"""HTTP checks + first-load budget; no third-party packages."""
import argparse
import gzip
import json
from urllib.request import Request, build_opener, ProxyHandler

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--url', default='http://127.0.0.1:18787')
    args = p.parse_args()
    total = 0
    report = {}
    opener = build_opener(ProxyHandler({}))
    for path in ['/', '/style.css', '/app.js', '/fonts/iosevka-regular.woff2', '/fonts/iosevka-bold.woff2', '/favicon.svg', '/api/config']:
        with opener.open(Request(args.url + path, headers={'Accept-Encoding': 'gzip'}), timeout=5) as r:
            assert r.status == 200
            body = r.read()
            total += len(body)
            report[path] = len(body)
            assert r.headers['X-Content-Type-Options'] == 'nosniff'
            if r.headers.get('Content-Encoding') == 'gzip': body = gzip.decompress(body)
            if path == '/api/config':
                config = json.loads(body)
                assert config['version'] == 1
                assert all(isinstance(s['search'],str) and s['name'].lower() in s['search'] for s in config['services'])
    assert total <= 200 * 1024, f'First load exceeds 200 KiB: {total}'
    print(json.dumps({'body_bytes': report, 'total_body_bytes': total, 'limit': 200 * 1024, 'passed': True}, ensure_ascii=False, indent=2))

if __name__ == '__main__': main()
