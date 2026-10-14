# ABI revenue model: blocked review candidate

This directory preserves Tanmay's artifact and original metadata from ABI commit
`f1d2a5a7c1b70ee9092403af5873e5c624f193c9`. Permission to copy and adapt was
confirmed by the target project owner. See `provenance.json` for checksum,
attribution, evidence boundaries, and blockers.

The artifact is retained only in the local audit workspace and is excluded from
this public source checkpoint. This directory publishes provenance/metadata and
historical smoke evidence, not weights. A Git clone cannot repeat the smoke test
without separately obtaining the approved artifact; absence is not activation.

The active model registry reads `ml/models/*.metadata.json`, not this directory.
The existing Linear Regression revenue artifact, metadata, and endpoint remain
authoritative. Do not move this artifact into that registry, overwrite the
existing model, or deserialize it automatically.

The owner reports original Olist data extended using synthetic records. The
source has no actual Gradient Boosting training script, generation script,
evaluation split, or reproducible baseline. Its only notebook is `{}`. The
retained `train_forecast.py` trains Linear Regression and is not the candidate's
pipeline. Source inference code is evidence of intended serving behavior, not
proof of the trained preprocessing semantics.

Metadata lists 27 ordered calendar/lag/rolling features, a 365-day history
requirement, and historical MAE/RMSE/R2/MAPE. Those claims have not been reproduced.
BRL is asserted by registry metadata; synthetic units remain unverified.
Future order counts are estimated from the previous week in source serving code;
that assumption cannot be presented as part of a verified training contract.

Static inspection confirmed the byte checksum and embedded sklearn estimator
and version strings. A later non-root, network-disabled Docker test with
read-only root/artifact mounts and resource limits loaded the candidate using
scikit-learn 1.6.1. Its estimator settings and 27-feature order matched metadata;
a constructed feature vector returned one finite result, and malformed/nonfinite
inputs were rejected. See `smoke_result.json`. This is computational validation,
not an actual training pipeline or predictive performance evaluation.

No model was retrained or activated. External pickle/joblib deserialization can
execute code. Automatic approval review rejected the initial host-level loading
attempt; the later container test used genuine OS isolation rather than bypassing
that rejection. Do not load this file in the target's Windows API process.

Before activation, obtain the real pipeline, generation provenance, units,
split/evaluation data, and verified package versions. Then validate in an
isolated environment and add a distinct model contract rather than silently
replacing the existing revenue model. Retraining or replacement requires approval.
