# Evidence needed to activate Tanmay's ABI revenue candidate

This is a local handoff checklist, not a request sent to anyone. No raw datasets,
credentials or secrets should be committed or included in the handoff document.

Source `tanmay180426/ABI` main was fetched again on 2026-10-13 and remains at
`f1d2a5a7c1b70ee9092403af5873e5c624f193c9`. Candidate SHA256 remains
`e248090a7a66b2dbbdab7c431924af1036bac2b2691e80a1547df60726fa117a`.
The existing Olist Linear Regression remains active. The Gradient Boosting
candidate stays outside automatic discovery and has not replaced any model.

| Needed from the source owner | Why it is required |
|---|---|
| Actual Gradient Boosting training script and exact invocation | The retained `train_forecast.py` fits Linear Regression, not the serialized candidate. Need to trace estimator initialization, fitting and artifact creation. |
| Exact feature/preprocessing code | Verify all 27 names/order/dtypes; calendar/week semantics; lags at 1/7/14/28/30/365; shifted rolling means/std and ddof; imputation; fit/apply boundaries; missing-date/duplicate handling. Metadata and serving guesses do not establish trained semantics. |
| Synthetic-data generator and immutable data manifest | Establish original sources, version/checksums, generation parameters/seeds and extended coverage. User reports approximately eight years with synthetic additions; exact construction is unknown. |
| Real/synthetic provenance and combination rules | Need recorded row origin, timestamps, proportions, distributions and transformation lineage. Extended data must not be described as entirely real Olist history. |
| Exact revenue target construction | Verify whether daily target sums item prices, order totals, payments or another measure; confirm freight/cancellation/refund handling and day boundaries. |
| Currency/unit evidence for synthetic and real targets | Original Olist uses BRL, but this does not verify generated amounts, scaling or synthetic units. Show implementation and manifest evidence. |
| Train/test and tuning split protocol | Need chronological dates/proportions, any seeds, validation windows and treatment of lag warmup. Prove no future leakage or transformations fitted on the test window. |
| Actual baseline implementation | Reproduce its features, target and evaluation window. No baseline was supplied for the candidate; the legacy lag-7 baseline is not automatically its baseline. |
| Evaluation script, data access procedure and result record | Reproduce historical MAE 3401.701329, RMSE 4502.422932, R2 .6331059, MAPE 16.2708028. Handle zero/small targets explicitly. Current values are historical metadata, not reproduced results. |
| Training dependency/serialization manifest | Need Python, sklearn, numpy, pandas, scipy/joblib versions and required objects. Artifact loads under sklearn 1.6.1 in restricted Docker; active target is 1.5.2. Training environment is not fully recovered. |
| Required preprocessing objects and artifact linkage | Supply saved transformation state if training uses it; prove checksum association with the actual script/data run and supply all necessary assets. No invented scaler or encoder will be substituted. |

Provide code, manifests and an authorized local/read-only data-access procedure;
keep private records out of Git. Dataset locations should be configured, not
embedded as machine-specific paths or credentials.

Already verified: copy/adaptation permission, source/artifact identity, actual
GradientBoostingRegressor settings (300 estimators, .05 learning rate, depth 5,
seed 42), 27 artifact feature names/order matching metadata, safe isolated loading,
finite feature-level smoke output and malformed/nonfinite-input rejection.
The smoke is not a verified training pipeline or accuracy evaluation.

Once evidence is available, reproduce evaluation without retraining by default;
retraining or replacement requires explicit approval. Compare models only on the
same documented data composition, target/units, chronology and evaluation window.
Reconcile production dependencies without an unapproved broad upgrade or new
microservice. Implement a distinct verified contract with ownership, readiness,
semantic/domain/unit/history and artifact checks before any activation.
