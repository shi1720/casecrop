"""Bundle exact library sources and executed examples; --check detects stale assets."""

import argparse
import json
from pathlib import Path

from casecrop.examples import CASES, browser_run

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--check", action="store_true")
args = parser.parse_args()
files = {p.name: p.read_text() for p in sorted((ROOT / "src/casecrop").glob("*.py"))}
outputs = {
    ROOT / "public/engine-sources.json": json.dumps(files, indent=2) + "\n",
    ROOT / "lib/examples.json": json.dumps(
        {c: json.loads(browser_run(json.dumps({"case": c}))) for c in CASES}, indent=2
    )
    + "\n",
}
for path, content in outputs.items():
    if args.check:
        if not path.exists() or path.read_text() != content:
            raise SystemExit(f"Stale generated asset: {path.relative_to(ROOT)}")
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
print("Engine assets verified." if args.check else "Generated engine and examples.")
