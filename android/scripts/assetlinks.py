#!/usr/bin/env python3
"""Add a public certificate without discarding existing app associations."""
import argparse
import json
import re
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--package', required=True)
parser.add_argument('--sha256', required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--merge', type=Path, help='Existing assetlinks.json to preserve')
args = parser.parse_args()
if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+', args.package):
    parser.error('Invalid Android application ID')
fingerprint = args.sha256.replace(':', '').upper()
if not re.fullmatch(r'[0-9A-F]{64}', fingerprint):
    parser.error('Provide the real 64-digit SHA-256 certificate fingerprint')
fingerprint = ':'.join(fingerprint[i:i+2] for i in range(0, 64, 2))
statements = json.loads(args.merge.read_text()) if args.merge else []
if not isinstance(statements, list):
    parser.error('Existing association must be a JSON array')
for entry in statements:
    if (entry.get('target', {}).get('namespace') == 'android_app'
            and entry['target'].get('package_name') == args.package
            and 'delegate_permission/common.handle_all_urls' in entry.get('relation', [])):
        fingerprints = entry['target'].setdefault('sha256_cert_fingerprints', [])
        if fingerprint not in fingerprints:
            fingerprints.append(fingerprint)
        break
else:
    statements.append({
    'relation': ['delegate_permission/common.handle_all_urls'],
    'target': {'namespace': 'android_app', 'package_name': args.package,
               'sha256_cert_fingerprints': [fingerprint]},
    })
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(statements, indent=2) + '\n')
print(args.output)
