import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parent.parent


class PluginArchivesTest(unittest.TestCase):
    def test_release_metadata_and_claude_connection_match(self):
        """Keep release metadata aligned with the unified connection."""
        package = json.loads((ROOT / "package.json").read_text())
        self.assertEqual(package["version"], "1.0.5")
        for filename in ("plugin.json", ".claude-plugin/plugin.json", "server.json"):
            manifest = json.loads((ROOT / filename).read_text())
            self.assertEqual(manifest["version"], package["version"], filename)
        registry = json.loads((ROOT / "server.json").read_text())
        self.assertEqual(registry["packages"][0]["version"], package["version"])
        lock = json.loads((ROOT / "package-lock.json").read_text())
        self.assertEqual(lock["version"], package["version"])
        self.assertEqual(lock["packages"][""]["version"], package["version"])
        claude = json.loads((ROOT / ".claude-plugin/mcp.json").read_text())
        self.assertEqual(claude["mcpServers"]["freehire"]["url"],
                         "https://freehire.me/api/v1/mcp")

    def test_archives_include_current_sources_and_package_version(self):
        """Check current packaged files and reject an oversized subtitle."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ("package.json", "plugin.json", "mcp.json"):
                shutil.copyfile(ROOT / name, root / name)
            for name in ("skills", "assets", "scripts"):
                shutil.copytree(ROOT / name, root / name)
            package = json.loads((root / "package.json").read_text())
            package["version"] = "9.8.7"
            (root / "package.json").write_text(json.dumps(package))
            reference = root / "skills/find-tech-jobs/references/current.md"
            reference.parent.mkdir()
            reference.write_text("Current search guidance\n")

            subprocess.run(
                [sys.executable, str(root / "scripts/build-plugins.py")],
                check=True, capture_output=True, text=True,
            )
            output = root / "dist/plugins"
            self.assertEqual(
                sorted(path.name for path in output.iterdir()),
                ["freehire-chatgpt-9.8.7.zip", "freehire-claude-skill-9.8.7.zip"],
            )
            with ZipFile(output / "freehire-chatgpt-9.8.7.zip") as archive:
                manifest = json.loads(archive.read("plugin.json"))
                self.assertEqual(manifest["version"], "9.8.7")
                self.assertEqual(manifest["name"], "freehire")
                interface = manifest["extensions"]["com.openai"]["interface"]
                self.assertLessEqual(len(interface["shortDescription"]), 30)
                cases = manifest["extensions"]["com.openai"]["review"]["test_cases"]
                self.assertEqual(len(cases["positive"]), 5)
                self.assertEqual(len(cases["negative"]), 3)
                for case in cases["positive"]:
                    for field in ("description", "prompt", "tools_triggered", "expected_behavior"):
                        self.assertTrue(case[field].strip(), field)

                self.assertEqual(
                    archive.read(interface["composerIcon"].removeprefix("./")),
                    (root / "assets/icon.png").read_bytes(),
                )
                mcp = json.loads(archive.read("mcp.json"))
                self.assertEqual(
                    mcp["mcpServers"]["freehire"]["url"],
                    "https://freehire.me/api/v1/mcp",
                )
                self.assertEqual(
                    mcp["mcpServers"]["freehire"]["extensions"]["com.openai"]["auth"],
                    {"type": "mixed", "client": {"mode": "dcr"}},
                )
                self.assertEqual(
                    archive.read("skills/find-tech-jobs/references/current.md"),
                    b"Current search guidance\n",
                )
                self.assertEqual(
                    archive.read("skills/find-tech-jobs/SKILL.md"),
                    (root / "skills/find-tech-jobs/SKILL.md").read_bytes(),
                )
                self.assertFalse(any(
                    name.startswith(("src/", "node_modules/", ".git/"))
                    for name in archive.namelist()
                ))
            with ZipFile(output / "freehire-claude-skill-9.8.7.zip") as archive:
                self.assertEqual(sorted(archive.namelist()), [
                    "find-tech-jobs/SKILL.md",
                    "find-tech-jobs/references/current.md",
                ])
                self.assertEqual(
                    archive.read("find-tech-jobs/SKILL.md"),
                    (root / "skills/find-tech-jobs/SKILL.md").read_bytes(),
                )


            invalid = json.loads((root / "plugin.json").read_text())
            invalid["extensions"]["com.openai"]["interface"]["shortDescription"] = "x" * 31
            (root / "plugin.json").write_text(json.dumps(invalid))
            rejected = subprocess.run(
                [sys.executable, str(root / "scripts/build-plugins.py")],
                capture_output=True, text=True,
            )
            self.assertNotEqual(rejected.returncode, 0)
            self.assertIn("shortDescription", rejected.stderr)


if __name__ == "__main__":
    unittest.main()
