"""Apply an already downloaded Blueport bundle, preserving personal configuration.

Run from the newly extracted release: python update.py --target OLD_EXTENSION_DIR
No network, browser installation, or permission grants are performed.
"""
import argparse
import ipaddress
import json
from pathlib import Path
import re
import shutil
import uuid
from urllib.parse import urlsplit


def manifest_at(folder):
    manifest = json.loads((folder / 'manifest.json').read_text(encoding='utf-8'))
    if manifest.get('name') != 'Blueport · 导航' or manifest.get('manifest_version') != 3:
        raise ValueError('Not a Blueport MV3 extension directory')
    if not re.fullmatch(r'\d+\.\d+\.\d+(?:\.\d+)?', manifest.get('version', '')):
        raise ValueError('Invalid extension version')
    return manifest


def apply_update(source, target):
    source, target = Path(source).resolve(), Path(target).resolve()
    if source == target or source in target.parents or target in source.parents:
        raise ValueError('Source and target must be separate, non-nested directories')
    old, new = manifest_at(target), manifest_at(source)
    version = lambda v: tuple((list(map(int, v.split('.'))) + [0] * 4)[:4])
    if version(new['version']) <= version(old['version']):
        raise ValueError('The downloaded version must be newer than the installed version')
    if any(p.is_symlink() for p in source.rglob('*')):
        raise ValueError('The downloaded bundle must not contain symlinks')
    for name in ('index.html', 'app.js', 'update.js', 'style.css'):
        if not (source / name).is_file():
            raise ValueError('Incomplete downloaded bundle: ' + name)
    config_bytes = (target / 'config.js').read_bytes()
    if len(config_bytes) > 8 * 1024 * 1024:
        raise ValueError('Configuration is too large')
    match = re.fullmatch(r'\s*"use strict";\s*window\.BLUEPORT_CONFIG\s*=\s*(\{.*\});\s*',
                         config_bytes.decode('utf-8'), re.S)
    if not match:
        raise ValueError('Unrecognized config.js; rebuild from your YAML instead')
    config = json.loads(match.group(1))
    if config.get('version') != 1:
        raise ValueError('Unsupported configuration schema; rebuild from your YAML instead')
    probe = config['network']['probe_url']
    connect = "'self' https://api.github.com"
    new.pop('host_permissions', None)
    if probe:
        url = urlsplit(probe)
        if url.scheme not in ('http', 'https') or url.username or url.password or url.fragment:
            raise ValueError('Invalid saved probe URL')
        address = ipaddress.ip_address(url.hostname)
        if not (address.is_private or address.is_loopback):
            raise ValueError('Saved probe must use a private IP')
        host = f'[{url.hostname}]' if address.version == 6 else url.hostname
        new['host_permissions'] = [f'{url.scheme}://{host}/*']
        connect += f' {url.scheme}://{url.netloc}'
    new['content_security_policy'] = {'extension_pages':
        f"default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; "
        f"img-src 'self'; connect-src {connect}; object-src 'none'; base-uri 'none'"}
    suffix = uuid.uuid4().hex[:12]
    stage = target.with_name(target.name + '-update-' + suffix)
    backup = target.with_name(target.name + '-backup-' + suffix)
    shutil.copytree(source, stage)
    (stage / 'config.js').write_bytes(config_bytes)
    (stage / 'manifest.json').write_text(json.dumps(new, ensure_ascii=False, indent=2) + '\n',
                                        encoding='utf-8', newline='\n')
    target.rename(backup)
    try:
        stage.rename(target)
    except OSError:
        backup.rename(target)
        raise
    return backup


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target', required=True, help='Existing loaded Blueport directory')
    parser.add_argument('--source', default=str(Path(__file__).resolve().parent),
                        help='Newly extracted release directory (defaults to this script directory)')
    args = parser.parse_args()
    backup = apply_update(args.source, args.target)
    print('Updated; personal config preserved. Backup:', backup)
    print('Now click Reload on the browser extensions page, then open a new tab.')


if __name__ == '__main__':
    main()
