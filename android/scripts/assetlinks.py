#!/usr/bin/env python3
"""Generate a public website association from the actual APK signing certificate."""
import argparse
import json
import re
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--package', required=True)
parser.add_argument('--sha256', required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+', args.package):
    parser.error('Invalid Android application ID')
fingerprint = args.sha256.replace(':', '').upper()
if not re.fullmatch(r'[0-9A-F]{64}', fingerprint):
    parser.error('Provide the real 64-digit SHA-256 certificate fingerprint')
fingerprint = ':'.join(fingerprint[i:i+2] for i in range(0, 64, 2))
statement = [{
    'relation': ['delegate_permission/common.handle_all_urls'],
    'target': {'namespace': 'android_app', 'package_name': args.package,
               'sha256_cert_fingerprints': [fingerprint]},
}]
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(statement, indent=2) + '\n')
print(args.output)
