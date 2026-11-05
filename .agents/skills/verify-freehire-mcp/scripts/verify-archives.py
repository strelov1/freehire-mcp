#!/usr/bin/env python3
"""Verify downloadable release ZIPs without installing or uploading them."""
import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[4]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--evidence', type=Path, required=True)
args = parser.parse_args()
args.evidence.mkdir(parents=True, exist_ok=True)
package = json.loads((ROOT / 'package.json').read_text())
version = package['version']
results = []
for target in ('chatgpt', 'claude-skill'):
    archive_path = ROOT / f'dist/plugins/freehire-{target}-{version}.zip'
    with ZipFile(archive_path) as archive:
        assert archive.testzip() is None, 'Corrupt ZIP'
        names = archive.namelist()
        assert all(not name.startswith(('/', '../', '.agents/', 'node_modules/')) for name in names)
        skill_name = ('skills/' if target == 'chatgpt' else '') + 'find-tech-jobs/SKILL.md'
        assert archive.read(skill_name) == (ROOT / 'skills/find-tech-jobs/SKILL.md').read_bytes()
        if target == 'chatgpt':
            manifest = json.loads(archive.read('plugin.json'))
            source_manifest = json.loads((ROOT / 'plugin.json').read_text())
            source_manifest['version'] = version
            assert manifest == source_manifest, 'Packaged plugin metadata differs from current source'
            assert manifest['version'] == version
            assert manifest['name'] == 'freehire'
            assert json.loads(archive.read('mcp.json')) == json.loads((ROOT / 'mcp.json').read_text())
            config = json.loads(archive.read('mcp.json'))['mcpServers']['freehire']
            assert config['url'] == 'https://freehire.me/api/v1/mcp'
            assert config['extensions']['com.openai']['auth'] == {'type': 'mixed', 'client': {'mode': 'dcr'}}
            for key in ('logo', 'composerIcon'):
                assert manifest['extensions']['com.openai']['interface'][key].removeprefix('./') in names
        else:
            assert 'plugin.json' not in names and 'mcp.json' not in names
    results.append({'file': archive_path.name, 'bytes': archive_path.stat().st_size,
                    'sha256': hashlib.sha256(archive_path.read_bytes()).hexdigest(), 'entries': names})
output = args.evidence / 'archives.json'
output.write_text(json.dumps({'status': 'passed', 'version': version, 'archives': results}, indent=2) + '\n')
print(output)
