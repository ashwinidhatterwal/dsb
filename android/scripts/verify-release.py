#!/usr/bin/env python3
"""Inspect real signed outputs before CI offers them for download."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]

def run(*args):
    return subprocess.run([str(x) for x in args], check=True, text=True,
                          stdout=subprocess.PIPE, stderr=subprocess.STDOUT).stdout

def verify(apk, bundle, output):
    sdk = Path(os.environ.get('ANDROID_HOME') or os.environ['ANDROID_SDK_ROOT'])
    tools = sdk / 'build-tools' / '36.0.0'
    apk_signature = run(tools / 'apksigner', 'verify', '--verbose', '--print-certs', apk)
    if 'CN=Android Debug' in apk_signature:
        raise ValueError('A production APK must not use the Android debug certificate')
    fingerprint = re.search(r'Signer #1 certificate SHA-256 digest: ([a-fA-F0-9]{64})', apk_signature)[1].upper()
    fingerprint = ':'.join(fingerprint[i:i+2] for i in range(0, 64, 2))
    bundle_signature = run('jarsigner', '-verify', bundle)
    if 'jar verified.' not in bundle_signature:
        raise ValueError('AAB is unsigned or could not be verified')
    # Compare DER certificates rather than localized keytool text.
    pem = run('keytool', '-printcert', '-rfc', '-jarfile', bundle)
    certificate = re.search(r'-----BEGIN CERTIFICATE-----\s*(.*?)\s*-----END CERTIFICATE-----', pem, re.S)[1]
    bundle_digest = hashlib.sha256(base64.b64decode(certificate)).hexdigest().upper()
    if bundle_digest != fingerprint.replace(':', ''):
        raise ValueError('APK and AAB signing certificates differ')
    badging = run(tools / 'aapt', 'dump', 'badging', apk)
    gradle = (ROOT / 'app/build.gradle').read_text()
    version_code = re.search(r'versionCode\s+(\d+)', gradle)[1]
    version_name = re.search(r"versionName\s+'([^']+)'", gradle)[1]
    expected = f"package: name='in.suhagbhandar.app' versionCode='{version_code}' versionName='{version_name}'"
    if expected not in badging or 'application-debuggable' in badging:
        raise ValueError('Incorrect APK identity/version or debuggable release')
    if "application-label:'Suhag Bhandar'" not in badging:
        raise ValueError('Unexpected production app label')
    if "sdkVersion:'24'" not in badging or "targetSdkVersion:'36'" not in badging:
        raise ValueError('Unexpected Android API compatibility')
    permissions = re.findall(r"uses-permission(?:-sdk-\d+)?: name='([^']+)'", badging)
    allowed = {'android.permission.INTERNET', 'android.permission.ACCESS_NETWORK_STATE',
               'in.suhagbhandar.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'}
    if set(permissions) - allowed:
        raise ValueError('Unexpected release permissions: ' + ', '.join(set(permissions) - allowed))
    manifest = run(tools / 'aapt', 'dump', 'xmltree', apk, 'AndroidManifest.xml')
    for required in ['ManageDataLauncherActivity', 'android:autoVerify', 'suhagbhandar.in']:
        if required not in manifest:
            raise ValueError('Missing required release component: ' + required)
    for attribute in ['usesCleartextTraffic', 'allowBackup']:
        if not re.search(r'android:' + attribute + r'[^\n]*0x0$', manifest, re.M):
            raise ValueError('Release must disable ' + attribute)
    output.mkdir(parents=True, exist_ok=True)
    run(sys.executable, ROOT / 'scripts/assetlinks.py', '--package', 'in.suhagbhandar.app',
        '--sha256', fingerprint, '--merge', ROOT.parent / '.well-known/assetlinks.json',
        '--output', output / 'assetlinks-direct-install.json')
    (output / 'signing-certificate-sha256.txt').write_text(fingerprint + '\n')
    (output / 'SHA256SUMS.txt').write_text(''.join(
        f'{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n' for path in [apk, bundle]))
    (output / 'release-info.json').write_text(json.dumps({
        'package': 'in.suhagbhandar.app', 'versionCode': int(version_code),
        'versionName': version_name, 'minSdk': 24, 'targetSdk': 36,
        'signingCertificateSha256': fingerprint, 'permissions': permissions,
        'website': 'https://suhagbhandar.in',
        'note': 'For Play-installed apps, also add the Play app signing certificate to website assetlinks.json.'
    }, indent=2) + '\n')
    print('PASS: release APK signature, AAB signature, matching certificate, identity, API levels, permissions and App Links components.')
    print('Public signing certificate SHA-256: ' + fingerprint)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--apk', type=Path, default=ROOT / 'app/build/outputs/apk/release/app-release.apk')
    parser.add_argument('--bundle', type=Path, default=ROOT / 'app/build/outputs/bundle/release/app-release.aab')
    parser.add_argument('--output', type=Path, default=ROOT / 'app/build/release-verification')
    args = parser.parse_args()
    verify(args.apk, args.bundle, args.output)
