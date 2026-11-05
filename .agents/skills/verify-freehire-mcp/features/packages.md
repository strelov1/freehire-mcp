# Downloadable plugins

Users receive a ChatGPT plugin ZIP and a separate claude.ai skill ZIP built from
the current source and package version.

## Sub-features

- `zip-chatgpt`: manifest, icon, remote MCP configuration and current skill.
- `zip-claude`: current skill under one top-level skill folder.
- `zip-import`: real host import preserves the expected identity and capabilities.

## How to get to it (user POV)

- Download `freehire-plugins-<commit>` from the GitHub Actions CI run.
- Run `npm run build:plugins` and open `dist/plugins`.
- ChatGPT portal: open the existing Freehire plugin and choose `Create draft from ZIP`.
- claude.ai: open `Customize` → `Skills` and upload the companion skill ZIP.

## Driving it with verify-freehire-mcp

Preconditions: launch/build completed; an empty unique evidence directory exists.

- **Build.** Run `npm run test:plugins` and `npm run build:plugins`; retain exit codes.
- **Inspect.** Run `python3 .agents/skills/verify-freehire-mcp/scripts/verify-archives.py --evidence "$verify_artifacts"`.
  `archives.json` must show two valid ZIPs, matching version, source skill and
  manifests, `freehire` identity, canonical URL and mixed/DCR configuration.
- **ChatGPT import.** With an authorized browser session, navigate to the existing
  Freehire portal card, snapshot it, choose `Create draft from ZIP` then `Upload plugin`,
  and select the exact verified ChatGPT ZIP. Capture the upload outcome, version,
  name, MCP URL, auth mode and tool scan. Stop if the portal rejects a field.
- **Claude import.** Use the Skills upload control, select the verified skill ZIP,
  then inspect its imported name. Add the canonical remote connector separately.
  A skill import alone proves no MCP connection.

## Gotchas

- Builds replace stale `dist/plugins/freehire-*.zip`; copy the approved ZIP to evidence.
- Import creates external state: only do it when the user authorized that upload.
- Upload, submit for review and publish are different actions and require their
  own authorized scope. A successful ZIP check does not prove any portal action.
- The separate Freehire Account review submission must remain available until
  original-plugin OAuth and existing-client migration are verified.
