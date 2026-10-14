"""Restore the previously registered, hash-verified forecast model for a target."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from src.common.paths import models_dir, reports_dir


def _trusted_file(directory: Path, name: str) -> Path:
    path = directory / name
    if Path(name).name != name or not path.is_file():
        raise ValueError(f"Rollback registration references an unsafe or missing file: {name!r}")
    return path


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def rollback(target: str) -> Path:
    if target not in {"orders", "revenue"}:
        raise ValueError("target must be orders or revenue")
    name = f"sales_forecast_{target}"
    metadata_path = models_dir() / f"{name}.metadata.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    prior = metadata.get("rollback")
    if not isinstance(prior, dict):
        raise ValueError(f"No previous verified registration is available for {target}.")

    artifact = _trusted_file(models_dir(), prior["artifact"])
    if _sha256(artifact) != prior["artifact_sha256"]:
        raise ValueError("Previous model artifact failed its SHA256 integrity check.")
    evaluation = _trusted_file(reports_dir(), prior["evaluation"])
    if _sha256(evaluation) != prior["evaluation_sha256"]:
        raise ValueError("Previous evaluation report failed its SHA256 integrity check.")
    report = json.loads(evaluation.read_text(encoding="utf-8"))
    if report.get("selected_candidate") != prior["algorithm"]:
        raise ValueError("Previous evaluation candidate does not match its model registration.")
    holdout = _trusted_file(reports_dir(), report["holdout_predictions_file"])
    if _sha256(holdout) != prior["holdout_predictions_sha256"]:
        raise ValueError("Previous holdout predictions failed their SHA256 integrity check.")

    current = {key: metadata.get(key) for key in (
        "artifact", "artifact_sha256", "algorithm", "version", "trained_at",
        "training_run_id", "features_schema", "data_sha256", "status", "evaluation",
        "evaluation_sha256", "holdout_predictions_sha256", "metrics",
    )}
    current_report = _trusted_file(reports_dir(), current["evaluation"])
    current["evaluation_sha256"] = _sha256(current_report)
    current_payload = json.loads(current_report.read_text(encoding="utf-8"))
    current_holdout = _trusted_file(reports_dir(), current_payload["holdout_predictions_file"])
    current["holdout_predictions_sha256"] = _sha256(current_holdout)

    for key in current:
        metadata[key] = prior.get(key)
    metadata["rollback"] = current
    temporary = metadata_path.with_suffix(metadata_path.suffix + ".tmp")
    temporary.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    temporary.replace(metadata_path)
    return metadata_path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", choices=("orders", "revenue"), required=True)
    args = parser.parse_args()
    print(rollback(args.target))


if __name__ == "__main__":
    main()
