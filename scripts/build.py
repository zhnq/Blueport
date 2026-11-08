"""Static Linux binary + official fnpack. Pass --go and --fnpack for custom tool paths."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import tarfile

ROOT = Path(__file__).resolve().parents[1]

def run(args, **kwargs):
    subprocess.run([str(x) for x in args], check=True, **kwargs)

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--arch', choices=['amd64', 'arm64'], default='amd64')
    p.add_argument('--go', default='go')
    p.add_argument('--fnpack', default='fnpack')
    p.add_argument('--linux-fnpack', help='On Windows: path to official Linux fnpack, executed in installed WSL')
    args = p.parse_args()
    out = ROOT / 'dist'
    out.mkdir(exist_ok=True)
    env = dict(os.environ, GOOS='linux', GOARCH=args.arch, CGO_ENABLED='0')
    binary = out / f'blueport-linux-{args.arch}'
    run([args.go, 'build', '-trimpath', '-ldflags=-s -w', '-o', binary, '.'], cwd=ROOT, env=env)
    stage = Path(tempfile.mkdtemp(prefix='blueport-fpk-'))
    package = stage / 'blueport'
    shutil.copytree(ROOT / 'packaging' / 'fnos', package, ignore=shutil.ignore_patterns('.DS_Store', '*.fpk'))
    (package / 'app' / 'server').mkdir(exist_ok=True)
    shutil.copy2(binary, package / 'app' / 'server' / 'blueport')
    shutil.copy2(ROOT / 'config.example.yaml', package / 'app' / 'config.example.yaml')
    shutil.copytree(ROOT / 'docs' / 'licenses', package / 'app' / 'licenses')
    shutil.copy2(ROOT / 'LICENSE', package / 'app' / 'licenses' / 'blueport.txt')
    shutil.copy2(ROOT / 'web' / 'fonts' / 'LICENSE.md', package / 'app' / 'licenses' / 'iosevka.txt')
    manifest = package / 'manifest'
    if args.arch == 'arm64':
        manifest.write_text(manifest.read_text(encoding='utf-8').replace('= x86', '= arm'), encoding='utf-8', newline='\n')
    for script in (package / 'cmd').iterdir():
        if script.is_file():
            script.write_text(script.read_text(encoding='utf-8-sig'), encoding='utf-8', newline='\n')
            script.chmod(0o755)
    (package / 'app' / 'server' / 'blueport').chmod(0o755)
    if args.linux_fnpack:
        def linux_path(path):
            return subprocess.check_output(['wsl', '--exec', 'wslpath', '-a', str(Path(path).resolve())], encoding='utf-8').strip()
        # Work on the native Linux filesystem: chmod on Windows/DrvFS is not reliable.
        code = '''
import pathlib, shutil, subprocess, sys, tempfile
stage=pathlib.Path(tempfile.mkdtemp(prefix="blueport-native-"))
package=stage/"blueport"
shutil.copytree(sys.argv[1],package)
tool=stage/"fnpack"
shutil.copy2(sys.argv[2],tool)
tool.chmod(0o755)
for p in package.rglob("*"):
    p.chmod(0o755 if p.is_dir() or p.parent.name=="cmd" or p.name=="blueport" else 0o644)
subprocess.run([str(tool),"build"],cwd=package,check=True)
shutil.copy2(package/"blueport.fpk",pathlib.Path(sys.argv[1])/"blueport.fpk")
print("Native staging:",stage)
'''
        run(['wsl', '--exec', 'python3', '-c', code, linux_path(package), linux_path(args.linux_fnpack)])
    else:
        run([args.fnpack, 'build'], cwd=package)
    built = list(package.glob('*.fpk'))
    if len(built) != 1:
        raise RuntimeError(f'Expected one FPK; staging retained: {stage}')
    with tarfile.open(built[0]) as outer:
        main_script = next(m for m in outer if m.name == 'cmd/main')
        if not main_script.mode & 0o111:
            raise RuntimeError('fnpack emitted non-executable scripts. Build on Linux or pass --linux-fnpack with WSL.')
        payload = next(m for m in outer.getmembers() if m.name == 'app.tgz')
        with tarfile.open(fileobj=outer.extractfile(payload), mode='r:gz') as inner:
            executable = next(m for m in inner if m.name.rstrip('/') == 'server/blueport')
            if not executable.mode & 0o111:
                raise RuntimeError('Non-executable server in FPK')
    dest = out / f'blueport-0.1.0-{args.arch}.fpk'
    shutil.copy2(built[0], dest)
    print(f'FPK: {dest}\nBinary: {binary}\nStaging: {stage}')

if __name__ == '__main__':
    main()
