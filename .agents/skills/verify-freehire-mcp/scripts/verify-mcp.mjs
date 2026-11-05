#!/usr/bin/env node
// Read-only verification through the same transports an MCP host uses.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const [mode, ...args] = process.argv.slice(2);
function option(name) { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; }
const evidence = option('--evidence');
if (!['doctor', 'local', 'hosted'].includes(mode) || !evidence) {
  console.error('Usage: verify-mcp.mjs doctor|local|hosted --evidence DIR [--token-file FILE]');
  process.exit(2);
}
fs.mkdirSync(evidence, { recursive: true });
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const servers = JSON.parse(fs.readFileSync(path.join(root, 'mcp.json'), 'utf8')).mcpServers;
const endpoint = Object.values(servers)[0].url;
const proof = { mode, version: pkg.version, commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), endpoint, dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()), checks: [], status: 'running' };
function check(name, condition, details = {}) {
  proof.checks.push({ name, status: condition ? 'passed' : 'failed', ...details });
  if (!condition) throw new Error(name);
}
async function rpc(method, params, token) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(endpoint, { method: 'POST', headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(30000) });
  const text = await response.text();
  let result;
  if (response.ok) {
    const line = text.split('\n').find(value => value.startsWith('data:'));
    const envelope = JSON.parse(line ? line.slice(5).trim() : text);
    check(`${method}:rpc`, !envelope.error);
    result = envelope.result;
  }
  return { status: response.status, result };
}
function signature(tools) { return createHash('sha256').update(JSON.stringify(tools)).digest('hex'); }
let client;
let transport;
try {
  check('built-local-entry', fs.existsSync(path.join(root, 'dist/index.js')));
  if (mode === 'local') {
    transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'dist/index.js')], cwd: root, stderr: 'pipe',
      env: { ...process.env, FREEHIRE_TOKEN: 'verification-invalid-key', FREEHIRE_API_URL: 'http://127.0.0.1:1' } });
    client = new Client({ name: 'freehire-verification', version: '1' });
    await client.connect(transport);
    check('local-server-version', client.getServerVersion()?.version === pkg.version);
    const list = await client.listTools();
    const names = list.tools.map(tool => tool.name).sort();
    check('local-host-discovery', ['search', 'whoami', 'my', 'cv_tailor', 'subscribe'].every(name => names.includes(name)), { toolNames: names });
  } else {
    check('canonical-manifest', endpoint === 'https://freehire.me/api/v1/mcp' && Object.keys(servers).length === 1);
    const listed = await rpc('tools/list', {});
    check('anonymous-discovery', listed.status === 200 && Array.isArray(listed.result?.tools));
    const tools = listed.result.tools;
    const expected = JSON.parse(fs.readFileSync(new URL('./expected-tools.json', import.meta.url), 'utf8'));
    const names = tools.map(tool => tool.name).sort();
    const wanted = [...expected.public, ...expected.oauth].sort();
    check('hosted-capabilities', JSON.stringify(names) === JSON.stringify(wanted), { toolCount: tools.length });
    for (const tool of tools) {
      const expectedType = expected.public.includes(tool.name) ? 'noauth' : 'oauth2';
      const schemes = tool._meta?.securitySchemes;
      check(`access-policy:${tool.name}`, Array.isArray(schemes) && schemes.length === 1 && schemes[0].type === expectedType);
    }
    const metadataURL = new URL('/.well-known/oauth-protected-resource/api/v1/mcp', endpoint);
    const response = await fetch(metadataURL, { signal: AbortSignal.timeout(30000) });
    check('resource-metadata-http', response.ok);
    const metadata = await response.json();
    check('resource-metadata', metadata.resource === endpoint && metadata.authorization_servers?.includes(new URL(endpoint).origin));
    if (mode === 'hosted') {
      const search = await rpc('tools/call', { name: 'search_jobs', arguments: { query: 'title:backend', limit: 1 } });
      check('anonymous-search', search.status === 200 && search.result?.isError !== true && search.result?.content?.length > 0);
      const personal = await rpc('tools/call', { name: 'my_jobs', arguments: {} });
      const challenges = personal.result?._meta?.['mcp/www_authenticate'];
      check('personal-step-up', personal.status === 200 && personal.result?.isError === true && Array.isArray(challenges)
        && challenges.some(value => value.includes(String(metadataURL)) && value.includes('error_description=')));
      const invalid = await rpc('tools/list', {}, 'fhm_verification_invalid_token');
      check('invalid-token-fails-closed', invalid.status === 401);
      const tokenFile = option('--token-file');
      if (tokenFile) {
        check('private-credential-file', (fs.statSync(tokenFile).mode & 0o077) === 0);
        const token = JSON.parse(fs.readFileSync(tokenFile, 'utf8')).access_token;
        check('oauth-credential-present', typeof token === 'string' && token.startsWith('fhm_'));
        const signedIn = await rpc('tools/list', {}, token);
        check('stable-oauth-catalogue', signedIn.status === 200 && signature(signedIn.result?.tools) === signature(tools));
        const jobs = await rpc('tools/call', { name: 'my_jobs', arguments: {} }, token);
        check('oauth-personal-read-envelope', jobs.status === 200 && jobs.result?.isError !== true && Array.isArray(jobs.result?.content));
        const text = jobs.result.content.find(item => item.type === 'text')?.text;
        const board = JSON.parse(text);
        check('oauth-personal-read', Array.isArray(board.jobs) && Number.isInteger(board.total));
      } else {
        proof.checks.push({ name: 'oauth-personal-read', status: 'blocked', reason: 'Dedicated reviewer OAuth token file not supplied' });
        proof.status = 'partial';
      }
    }
  }
  if (proof.status === 'running') proof.status = 'passed';
} catch (error) {
  proof.status = 'failed';
  // Transport errors may embed private responses: persist only the error class.
  proof.errorClass = error?.name ?? 'Error';
  process.exitCode = 1;
} finally {
  try {
    if (client) await client.close();
    else if (transport) await transport.close();
  } catch {
    proof.checks.push({ name: 'transport-cleanup', status: 'failed' });
    proof.status = 'failed';
    process.exitCode = 1;
  }
  const output = path.join(evidence, `${mode}.json`);
  fs.writeFileSync(output, `${JSON.stringify(proof, null, 2)}\n`);
  console.log(`${proof.status}: ${output}`);
  if (proof.status === 'partial') process.exitCode = 2;
}
