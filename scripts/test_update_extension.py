"""Local update integration checks; no network or browser profile changes."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from update_extension import apply_update


class UpdateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source, self.target = self.root / 'download', self.root / 'installed'
        for folder, version in [(self.source, '0.1.1'), (self.target, '0.1.0')]:
            folder.mkdir()
            manifest = {'name': 'Blueport · 导航', 'manifest_version': 3, 'version': version}
            (folder / 'manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
            for name in ('index.html', 'app.js', 'update.js', 'style.css'):
                (folder / name).write_text(version, encoding='utf-8')
        (self.source / 'config.js').write_text('EXAMPLE CONFIG MUST NOT REPLACE USER CONFIG')
        self.config = {'version': 1, 'network': {'probe_url': 'http://192.168.1.10:5666/'},
                       'services': [{'name': 'My NAS'}]}
        self.save_config()

    def save_config(self):
        self.saved = ('"use strict";\nwindow.BLUEPORT_CONFIG = ' + json.dumps(self.config) + ';\n').encode()
        (self.target / 'config.js').write_bytes(self.saved)

    def test_upgrade_preserves_configuration_permissions_and_full_backup(self):
        backup = apply_update(self.source, self.target)
        self.assertEqual((self.target / 'config.js').read_bytes(), self.saved)
        self.assertEqual((backup / 'config.js').read_bytes(), self.saved)
        self.assertEqual((backup / 'app.js').read_text(), '0.1.0')
        self.assertEqual((self.target / 'app.js').read_text(), '0.1.1')
        manifest = json.loads((self.target / 'manifest.json').read_text(encoding='utf-8'))
        self.assertEqual(manifest['host_permissions'], ['http://192.168.1.10/*'])
        self.assertIn("connect-src 'self' https://api.github.com http://192.168.1.10:5666", manifest['content_security_policy']['extension_pages'])

    def test_no_probe_needs_no_host_permissions(self):
        self.config['network']['probe_url'] = ''
        self.save_config()
        apply_update(self.source, self.target)
        manifest = json.loads((self.target / 'manifest.json').read_text(encoding='utf-8'))
        self.assertNotIn('host_permissions', manifest)

    def test_invalid_config_leaves_existing_install_untouched(self):
        (self.target / 'config.js').write_text('arbitrary JavaScript')
        with self.assertRaises(ValueError):
            apply_update(self.source, self.target)
        self.assertEqual((self.target / 'app.js').read_text(), '0.1.0')
        self.assertEqual(len(list(self.root.iterdir())), 2)

    def test_same_version_and_nested_paths_are_rejected(self):
        with self.assertRaises(ValueError):
            apply_update(self.target, self.source)
        with self.assertRaises(ValueError):
            apply_update(self.target, self.target)
        self.assertEqual((self.target / 'app.js').read_text(), '0.1.0')

    def test_failed_replacement_restores_original_directory(self):
        original_rename = Path.rename

        def rename(path, target):
            if '-update-' in path.name:
                raise OSError('simulated file lock')
            return original_rename(path, target)

        with patch.object(Path, 'rename', rename):
            with self.assertRaises(OSError):
                apply_update(self.source, self.target)
        self.assertEqual((self.target / 'config.js').read_bytes(), self.saved)
        self.assertEqual((self.target / 'app.js').read_text(), '0.1.0')


if __name__ == '__main__':
    unittest.main()
