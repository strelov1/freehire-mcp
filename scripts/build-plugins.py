"""Package the hosted ChatGPT plugin and its companion claude.ai skill."""

import argparse
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


ROOT = Path(__file__).resolve().parent.parent


def files_under(directory):
    return sorted(path for path in directory.rglob("*") if path.is_file())


def write_archive(path, entries):
    with ZipFile(path, "w", compression=ZIP_DEFLATED) as archive:
        for name, content in sorted(entries.items()):
            info = ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, content)
    print(path.relative_to(ROOT))


def main():
    """Build hosted-plugin archives and validate their listing metadata."""
    package = json.loads((ROOT / "package.json").read_text())
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check-claude-bundle", action="store_true")
    args = parser.parse_args()
    manifest = json.loads((ROOT / "plugin.json").read_text())
    manifest["version"] = package["version"]

    skills = sorted((ROOT / "skills").glob("*/SKILL.md"))
    if len(skills) != 1:
        raise ValueError("The claude.ai archive requires exactly one skill folder")

    plugin_entries = {
        "plugin.json": (json.dumps(manifest, indent=2) + "\n").encode(),
        "mcp.json": (ROOT / "mcp.json").read_bytes(),
    }
    for directory in (ROOT / "skills", ROOT / "assets"):
        for path in files_under(directory):
            plugin_entries[path.relative_to(ROOT).as_posix()] = path.read_bytes()

    interface = manifest["extensions"]["com.openai"]["interface"]
    if len(interface["shortDescription"]) > 30:
        raise ValueError("ChatGPT shortDescription must be at most 30 characters")
    for field in ("composerIcon", "logo"):
        if interface[field].removeprefix("./") not in plugin_entries:
            raise ValueError(f"Missing packaged {field}: {interface[field]}")

    skill_entries = {
        path.relative_to(ROOT / "skills").as_posix(): path.read_bytes()
        for path in files_under(skills[0].parent)
    }
    claude_manifest = json.loads((ROOT / ".claude-plugin/plugin.json").read_text())
    claude_manifest["version"] = package["version"]
    bundle_entries = {
        ".claude-plugin/plugin.json": (json.dumps(claude_manifest, indent=2) + "\n").encode(),
        ".claude-plugin/mcp.json": (ROOT / ".claude-plugin/mcp.json").read_bytes(),
        "assets/icon.png": (ROOT / "assets/icon.png").read_bytes(),
        "LICENSE": (ROOT / "LICENSE").read_bytes(),
        "README.md": (ROOT / "docs/claude-plugin-readme.md").read_text().replace(
            "{{DESCRIPTION}}", claude_manifest["description"]
        ).encode(),
        **{f"skills/{name}": content for name, content in skill_entries.items()},
    }
    bundle = ROOT / "plugins/claude"
    existing = {path.relative_to(bundle).as_posix(): path.read_bytes()
                for path in files_under(bundle)}
    if args.check_claude_bundle:
        if existing != bundle_entries:
            raise ValueError("Claude directory bundle is stale; run npm run build:plugins and commit plugins/claude")
        print("Claude directory bundle matches current sources")
        return
    for name in existing.keys() - bundle_entries.keys():
        (bundle / name).unlink()
    for name, content in bundle_entries.items():
        destination = bundle / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(content)
    output = ROOT / "dist/plugins"
    output.mkdir(parents=True, exist_ok=True)
    for stale in output.glob("freehire-*.zip"):
        stale.unlink()
    version = package["version"]
    write_archive(output / f"freehire-chatgpt-{version}.zip", plugin_entries)
    write_archive(output / f"freehire-claude-skill-{version}.zip", skill_entries)


if __name__ == "__main__":
    main()
