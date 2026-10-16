"""Prevent certificate updates from breaking previously verified installations."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('assetlinks.py')

class AssetLinksTest(unittest.TestCase):
    def test_add_production_preserves_preview_and_other_relations(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'assetlinks.json'
            original = [
                {'relation': ['delegate_permission/common.handle_all_urls'], 'target': {
                    'namespace': 'android_app', 'package_name': 'in.suhagbhandar.app.preview',
                    'sha256_cert_fingerprints': ['AA:' * 31 + 'AA']}},
                {'relation': ['delegate_permission/common.get_login_creds'], 'target': {
                    'namespace': 'web', 'site': 'https://example.com'}}]
            path.write_text(json.dumps(original))
            cmd = [sys.executable, str(SCRIPT), '--package', 'in.suhagbhandar.app',
                   '--sha256', 'bb' * 32, '--merge', str(path), '--output', str(path)]
            subprocess.run(cmd, check=True, capture_output=True)
            first = json.loads(path.read_text())
            self.assertEqual(first[:2], original)
            self.assertEqual(first[2]['target']['sha256_cert_fingerprints'], ['BB:' * 31 + 'BB'])
            subprocess.run(cmd, check=True, capture_output=True)
            self.assertEqual(json.loads(path.read_text()), first)
            cmd[cmd.index('bb' * 32)] = 'cc' * 32
            subprocess.run(cmd, check=True, capture_output=True)
            second = json.loads(path.read_text())
            self.assertEqual(second[:2], original)
            self.assertEqual(len(second), 3)
            self.assertEqual(len(second[2]['target']['sha256_cert_fingerprints']), 2)

    def test_invalid_certificate_does_not_overwrite_associations(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'assetlinks.json'
            path.write_text('[]\n')
            result = subprocess.run([sys.executable, str(SCRIPT), '--package', 'in.suhagbhandar.app',
                                     '--sha256', 'placeholder', '--merge', str(path), '--output', str(path)],
                                    capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(path.read_text(), '[]\n')

if __name__ == '__main__':
    unittest.main()
