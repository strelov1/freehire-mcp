"""Package the hosted ChatGPT plugin and its companion claude.ai skill."""

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
    package = json.loads((ROOT / "package.json").read_text())
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
    for field in ("composerIcon", "logo"):
        if interface[field].removeprefix("./") not in plugin_entries:
            raise ValueError(f"Missing packaged {field}: {interface[field]}")

    skill_entries = {
        path.relative_to(ROOT / "skills").as_posix(): path.read_bytes()
        for path in files_under(skills[0].parent)
    }
    output = ROOT / "dist/plugins"
    output.mkdir(parents=True, exist_ok=True)
    for stale in output.glob("freehire-*.zip"):
        stale.unlink()
    version = package["version"]
    write_archive(output / f"freehire-chatgpt-{version}.zip", plugin_entries)
    write_archive(output / f"freehire-claude-skill-{version}.zip", skill_entries)


if __name__ == "__main__":
    main()
