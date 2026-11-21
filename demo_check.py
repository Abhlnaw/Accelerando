"""Run genuine bundled files through the same pipeline as the UI, without answers.

python demo_check.py --output demo-results.json
This command requires all three domain owners' modules and Agent 2's manifest.
"""
import argparse
from dataclasses import asdict
import json
from pathlib import Path

from pipeline import Request, fixture_path, load_catalog, run_analysis


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("demo-results.json"))
    args = parser.parse_args()
    rows = []
    for piece in load_catalog():
        for take in piece.get("takes", []):
            request = Request(fixture_path(take["audio_path"]).read_bytes(),
                              fixture_path(piece["score_path"]).read_bytes())
            row = {"piece_id": piece["piece_id"], "take": take["label"]}
            try:
                analysis = run_analysis(request)
                row.update(result=asdict(analysis.result), method=analysis.take.method,
                           timings_s=analysis.timings_s, observed_events=[asdict(e) for e in analysis.take.events])
            except Exception as exc:
                row["error"] = str(exc)
            rows.append(row)
    if not rows:
        parser.exit(2, "No bundled takes available. Integrate the score owner's manifest first.\n")
    args.output.write_text(json.dumps(rows, indent=2), encoding="utf-8")
    print(f"Wrote {len(rows)} actual runs to {args.output}")
    if any("error" in row for row in rows):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
