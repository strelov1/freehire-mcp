#!/usr/bin/env python3
"""Drive pinned MCP Inspector CLI; persist only redacted assertions and exit codes."""
import argparse
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[4]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('surface', choices=('local', 'hosted'))
parser.add_argument('--evidence', type=Path, required=True)
parser.add_argument('--npm-cache', type=Path)
parser.add_argument('--token-file', type=Path)
args = parser.parse_args()
args.evidence.mkdir(parents=True, exist_ok=True)
proof = {'inspector': '2.14.0', 'node': '22.23.4', 'surface': args.surface, 'checks': [], 'status': 'running'}
expected = json.loads(Path(__file__).with_name('expected-tools.json').read_text())
endpoint = 'https://freehire.me/api/v1/mcp'


def check(name, condition, **details):
    proof['checks'].append({'name': name, 'status': 'passed' if condition else 'failed', **details})
    if not condition:
        raise RuntimeError(name)


with tempfile.TemporaryDirectory(prefix='freehire-inspector-') as scratch:
    scratch = Path(scratch)
    env = dict(os.environ, MCP_STORAGE_DIR=str(scratch / 'storage'),
               MCP_CLIENT_CONFIG_PATH=str(scratch / 'client.json'),
               MCP_INSPECTOR_SECRET_STORE='memory', MCP_INSPECTOR_PERSIST_TOKENS='none',
               MCP_AUTO_OPEN_ENABLED='false', MCP_INSPECTOR_OAUTH_STATE_PATH=str(scratch / 'oauth.json'))
    # A fresh client config prevents inheriting another host's OAuth settings.
    (scratch / 'client.json').write_text('{}\n')
    prefix = ['npm', 'exec', '--yes', '--cache', str(args.npm_cache or scratch / 'npm-cache'),
              '--package=node@22.23.4', '--package=@modelcontextprotocol/inspector@2.14.0',
              '--', 'mcp-inspector', '--cli']

    def run(name, target, method_args, want_error=False):
        command = prefix + target + method_args + ['--format', 'json']
        process = subprocess.Popen(command, cwd=ROOT, env=env, stdin=subprocess.DEVNULL,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
        try:
            stdout, stderr = process.communicate(timeout=180)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.communicate(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.communicate()
            check(name, False, reason='Inspector timed out; owned process group terminated')
        data = json.loads(stdout)
        payload = data.get('result', data)
        if want_error:
            code = data.get('error', {}).get('code')
            check(name, process.returncode != 0 and code == 'auth_required', exit_code=process.returncode, error_code=code)
        else:
            check(name, process.returncode == 0, exit_code=process.returncode)
        counts = re.search(r'(\d+) errors?, (\d+) warnings? across', stderr)
        if counts:
            proof['checks'][-1]['schema_errors'] = int(counts[1])
            proof['checks'][-1]['schema_warnings'] = int(counts[2])
        return payload

    try:
        if args.surface == 'local':
            env.update(FREEHIRE_TOKEN='verification-invalid-key', FREEHIRE_API_URL='http://127.0.0.1:1')
            tools = run('stdio-list', ['node', 'dist/index.js'], ['--method', 'tools/list', '--strict'])['tools']
            names = sorted(tool['name'] for tool in tools)
            check('local-tools', {'search', 'whoami', 'my', 'subscribe', 'cv_tailor'} <= set(names), tool_count=len(names))
        else:
            target = [endpoint, '--transport', 'http']
            tools = run('public-list', target, ['--method', 'tools/list', '--strict'])['tools']
            names = sorted(tool['name'] for tool in tools)
            check('exact-hosted-tools', names == sorted(expected['public'] + expected['oauth']), tool_count=len(names))
            search = run('public-search', target, ['--method', 'tools/call', '--tool-name', 'search_jobs',
                                                  '--tool-arg', 'query=title:backend', '--tool-arg', 'limit=1'])
            check('public-search-result', bool(search.get('content')) and search.get('isError') is not True)
            run('personal-requires-sign-in', target, ['--method', 'tools/call', '--tool-name', 'my_jobs'], want_error=True)
            if args.token_file:
                check('private-token-file', args.token_file.stat().st_mode & 0o077 == 0)
                token = json.loads(args.token_file.read_text())['access_token']
                check('oauth-token', isinstance(token, str) and token.startswith('fhm_'))
                config = scratch / 'mcp.private.json'
                with config.open('x', opener=lambda file, flags: os.open(file, flags, 0o600)) as output:
                    json.dump({'mcpServers': {'freehire': {'type': 'http', 'url': endpoint,
                              'headers': {'Authorization': 'Bearer ' + token}}}}, output)
                private = run('oauth-my-jobs', ['--config', str(config), '--server', 'freehire'],
                              ['--method', 'tools/call', '--tool-name', 'my_jobs'])
                check('oauth-result-envelope', isinstance(private, dict) and isinstance(private.get('content'), list)
                      and private.get('isError') is not True)
                board = json.loads(next(item['text'] for item in private['content'] if item.get('type') == 'text'))
                check('oauth-tracked-jobs', isinstance(board.get('jobs'), list) and type(board.get('total')) is int)
            else:
                proof['checks'].append({'name': 'oauth-my-jobs', 'status': 'blocked', 'reason': 'Reviewer token file missing'})
                proof['status'] = 'partial'
        if proof['status'] == 'running':
            proof['status'] = 'passed'
    except Exception as error:
        proof['status'] = 'failed'
        proof['error_class'] = type(error).__name__
# Temporary Inspector state, private config and owned children are gone; evidence survives.
output = args.evidence / f'inspector-{args.surface}.json'
output.write_text(json.dumps(proof, indent=2) + '\n')
print(f"{proof['status']}: {output}")
raise SystemExit(0 if proof['status'] == 'passed' else 2 if proof['status'] == 'partial' else 1)
