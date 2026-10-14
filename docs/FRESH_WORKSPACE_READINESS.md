# Fresh-workspace portability and local AI readiness

Historical sanitized-workspace verification (2026-10-13). Statements about uncommitted or unavailable remote source describe that run before checkpoint publication. No actual GitHub clean-clone test of the checkpoint has been executed. Serving/candidate weights remain excluded. See CHECKPOINT_RELEASE.md.

Date: 2026-10-13. Branch: `integrate/abi-ml-backend`. HEAD before/after:
`9aaa1200d7e28797ce177a84a920138b4b4b87c9`, with all prior uncommitted work retained.

## A. What was actually tested

The sanitized working-tree source snapshot was created at
`<sanitized-workspace>`.
It began with 219 source/template/test/documentation files and a manifest, then
received the explicitly reviewed new portability scripts/tests/documentation.
It excluded `.git`, real environment files, databases/private uploads, dependency
folders, virtual environments, temporary outputs/caches and all model binaries.
Dependencies and runtime/test outputs were subsequently created there by the
installation/verification process, not bundled as source inputs.

**Verified sanitized current-working-tree workspace: YES. Actual Git clone: NOT
EXECUTED. Remote clone of these uncommitted changes: NOT VERIFIED.** No claim is
made that cloning GitHub currently provides this integration tree.

Verified Windows runtime: Python3.13.5, Node20.19.4, npm lockfileVersion3.
Vite's installed engine declaration is `^18.0.0 || >=20.0.0`; only the stated Node
version was actually tested. The venv has include-system-site-packages=false.

Executed inside that snapshot:

```powershell
python -m venv .venv
& ./.venv/Scripts/python.exe -m pip install -r backend/requirements-dev.txt -r ml/requirements-dev.txt
& ./.venv/Scripts/python.exe -m pip check
Push-Location frontend
npm ci
Pop-Location
```

Both installations passed; pip check found no broken requirements. Declared
direct versions were installed without upgrades, including sklearn1.5.2,
numpy2.1.3, pandas2.2.3, pytest8.3.3, FastAPI0.115.5 and httpx0.27.0. Some packages
were downloaded and others came from package caches; this is setup-time network
access, not paid runtime API usage. `PORTABILITY_PYTHON_TESTED_RESOLUTION.txt`
records the isolated resolution. Python transitive versions are not fully locked;
the record is evidence rather than a new replacement install manifest.

No required paid-provider environment names or keys were found. Default first-run
tests removed hosted-provider credentials and database/ML/provider overrides.
No `.env` was copied. Required/default/optional variable names and secret handling
are listed in `LOCAL_SETUP_WINDOWS.md`; test-only fixture variables are listed below.

## Database first run and actual core workflow

The actual startup command, from snapshot root, was its venv Python followed by
`-m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8033`.
Before it ran, backend/sem5.db did not exist. No manual schema/user/data insertion
was used. `/health` succeeded. Real login invoked the existing user-service
check-first schema/bootstrap mechanism and created only the two documented default
development accounts. Dataset APIs created their registry/selection schema.

No Olist/reference dataset was silently fabricated: the initial dataset list was
empty and analytics returned 409, asking for a READY selection. The verification
script uploaded a public two-row fixture through actual multipart requests for
each user, selected it through the API and checked independently expected revenue
1,000 and filtered Pune revenue200. All six analytics areas returned their real
available/unavailable capability responses. Reports produced actual filtered CSV.
Numerical Insights used provider=computed; unsupported prose returned the explicit
disabled/local-generation limitation. No Ollama/model files were needed.

Admin/Analyst login, anonymous401, Analyst/Admin403, private dataset ownership403,
Admin status/read pages and repeated two-user bootstrap were verified. Missing
ML artifacts returned Not Applicable without predictions. No active-model inference
claim is made for this artifact-free environment.

The default database URL/legacy alias resolved to the same snapshot backend/sem5.db
from root, backend and frontend directories via `database_path_probe.py`. The real
API was restarted from backend (8033), preserving two users, each user's uploaded
dataset and active selection. Existing data was not overwritten. The original
developer's database was not used for this first-run/core/browser sequence.

Vite was started with `VITE_API_BASE_URL=http://localhost:8033` and
`npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`. These are test ports;
the guide's ordinary API/UI defaults remain8000/5173. Browser originlocalhost5173
matches the existing CORS policy. **Eight real fresh-workspace browser tests passed**
using the dedicated external-server config: original smoke/dataset/free-only cases
plus one missing-artifact/logout case. They exercised actual uploads/processing,
schema/context/selection/switching/filtering, displayed numerical answers, CSV
stream contents, Admin/Analyst guards and logout. No successful responses were mocked.

## B. Zero-cost boundary and missing files

Paid API required: **NO**. Paid key needed: **NO**. External provider required for
the tested local uploaded-data core: **NO**. Startup with hosted credentials absent:
**PASS**. The existing full external-network guard suite was rerun in the isolated
environment; it denies non-loopback DNS/connect/connect_ex and records swallowed
attempts. The fresh free-only browser case aborted/recorded external destinations
and found zero attempts. This is application-boundary testing, not physical
disconnection of the entire Windows host.

The reference warehouse, processed training data and six serving `.joblib`
artifacts are not tracked in Git. Metadata files are tracked. A fresh checkout
can run uploaded analytics/reports/Insights and model availability/compatibility
screens, but **cannot perform those trained ML inferences without a separately
supplied trusted compatible model bundle**. No bundle was committed, no model
was retrained and no algorithm/scaler/feature/unit was changed. This is an
explicit portability limitation, not concealed by fabricated numbers.

Full reference/model regressions used a **separate labelled fixture** at
`<trusted-model-fixture>`.
Only six existing trusted active artifacts/metadata were copied there. Its
abi-candidate subfolder is used solely for the existing SHA/provenance preservation
test; that binary is never deserialized or registered. The supplied reference
path was read-only; existing pytest storage copied only relevant warehouse state
into disposable test storage. These runs prove regression behavior with files
supplied, **not Git availability or independence from the developer's files**.

## C. Local Ollama and timeout investigation

Ollama0.40.3 and an already installed gemma3:1b were used; no install, pull or
replacement was executed. The audit-only hidden daemon received OLLAMA_NO_CLOUD=1
and loopback OLLAMA_HOST in its own process environment. Its log explicitly
reported `Ollama cloud disabled: true`. No persistent machine/user environment
setting was changed. Windows desktop restart instructions, explicit bounded
preload and Gemma terms are linked in `LOCAL_SETUP_WINDOWS.md`.

The implemented policy was reinspected and retested: default flagfalse; ollama
allowlist; literal loopback/localhost only; no URL credentials/query/fragment;
invalid provider rejection; trust_env=false; redirects disabled; `/api/show`
must verify local metadata before prompts; absent/unverifiable/remote models
fall back. Numerical/grouped questions return before provider dispatch. Provider
errors expose only class names, not prompts/credentials/response contents. The
API request/response contract was preserved. The prompt contains existing
controlled aggregate context/schema/filter metadata, which can still be sensitive,
and is sent only to the explicitly enabled trusted local daemon. Raw row exports
and credentials are not sent. Model prose quality/business truth is not verified.

Timeout chain: frontend fetch has no configured deadline; backend model metadata
and generation each use normal HTTPX timeout20 for socket operations. HTTPX read
timeout is an inactivity timeout, not a complete request wall-clock deadline.
The daemon performs load/prompt evaluation/generation; unavailable/missing models
return truthful fallback. No application timeout was increased to300. The old
90-second timeout/300-second warm probe was historical overridden evidence.

Initial real HTTP timing experiment with a two-row uploaded dataset and short
response request, using normal20:

| State | Numerical seconds | Generation seconds | Result |
|---|---:|---:|---|
| Unreachable loopback daemon | 0.054 | 2.920 | llm_unavailable, truthful summary/limitation |
| Reachable daemon, absent configured model | 0.052 | 2.988 | llm_unavailable; no pull |
| Present but explicitly unloaded model | 0.073 | 9.862 | available, real Ollama generation |
| Warm model | 0.057 | 6.183 | available, real Ollama generation |

A second same-fixture experiment ran numerical queries while a generation request
was in flight. Cold generation14.631s and warm8.506s passed normal20; concurrent
computed numerical responses took2.118–2.133s and completed while the longer
generation request remained in flight. Other workload and new HTTP connection
overhead are included; these are observed request times, not isolated model speeds.
An explicitly bounded preload took6.579s; its reported load_duration was0, so no
precise internal model-load time is inferred from that missing/zero field.

The corrected larger-reference experiment used the earlier descriptive question
and the same normal20 timeout. Cold generation19.417s and warm13.198s were available;
unreachable/absent model responses fell back in8.924/8.907s. Idle numerical
calculations took4.391–4.804s; concurrent calculations took6.689–7.320s and used
provider=computed while generation remained in flight. An independent bounded
preload took6.492s, with no usable internal load-duration breakdown reported.
Database/connection/workload overhead is included. The old90-second failure was
not reproduced in these controlled runs; its precise cause cannot be established
from the historical log alone. An explicit optional preload is the minimal
documented mitigation, not a guarantee that arbitrary contexts/prose fit20 seconds.

The local timing helper uses real running FastAPI HTTP servers and disposable
databases. A Windows venv child-server cleanup race in an intermediate larger-context
probe was corrected by terminating only its spawned process tree before deleting
its own temporary DB; the corrected experiment was rerun. Protocol-fixture tests
are reported separately, not called live LLM tests.

Windows host FastAPI+host Ollama is supported. **Dockerized FastAPI plus host
Ollama is not supported by the present loopback-only configuration**; no LAN or
host.docker.internal workaround/policy weakening was introduced. Docker is not a
core setup dependency. The model's observed disk size815,319,791 bytes and loaded
size877,196,738 bytes are not a universal hardware minimum. No huge-model download
or prose-quality/confidence claim is made.

## D. Freshly executed verification

| Check | Command / environment | Result |
|---|---|---|
| Isolated installs | Snapshot venv pip manifests; frontend npm ci | Passed; no global site-packages; npm385 packages |
| Empty-db real API | `python scripts/verification/fresh_workspace_probe.py --api-url http://localhost:8033` | Passed with no original DB/model inputs |
| Stable DB paths | `python scripts/verification/database_path_probe.py` | Passed from three directories |
| Ordinary full backend, explicit fixtures | From snapshot/backend: venv Python `-m pytest tests --rootdir=. -q --reference-db <read-only-reference>` | 300 passed,0 failed/skipped;413 warnings;603.29s |
| Full network guard, explicit fixtures | Same command plus `--free-only-network` | 300 passed,0 failed/skipped;413 warnings;609.71s |
| ABI reliability, explicit hash-only candidate fixture | Existing 17-case subset plus external fixtures | 17 passed, 0 failed/skipped |
| ML | Snapshot venv Python `-m pytest ml/tests -q` | 8 passed, 0 failed/skipped |
| Frontend unit | Snapshot/frontend `npm test` | 47 passed, 0 failed/skipped |
| Lint / TS | npm run lint; both existing tsconfig checks, repeated for new tests | Passed |
| Build | npm run build | Passed,874 modules |
| Fresh artifact-free browser | `npm run e2e -- --config=playwright.portability.config.ts e2e/smoke.spec.ts e2e/datasets.spec.ts e2e/free-only.spec.ts e2e/portability.spec.ts --workers=1` | 8 passed, 0 failed/skipped |
| Existing full browser, reference/model fixtures | Existing launcher, ports8013/5183, `npm run e2e -- --workers=1` | 17 passed, 0 failed/skipped |
| Optional installed-model readiness | venv Python `scripts/verification/local_ai_readiness.py --model gemma3:1b` | Live timing/results above, normal20 |

Fixture variables are test-only: existing ML_MODELS_DIR points at the separately
labelled active artifact directory; new SEM5_TEST_ABI_CANDIDATE_DIR points at
hash-only audit files; SEM5_E2E_REFERENCE_DB explicitly chooses a source for the
existing disposable browser backup launcher. They are not onboarding prerequisites
or new API/provider settings. Default paths remain unchanged.

Intermediate failures were recorded rather than hidden: pytest8.3.3 inferred a
Windows drive root from an external custom reference argument and failed collection;
explicit --rootdir=. resolved it. Two initial full fixture runs then had299 passes
and1 failure because the deliberately excluded candidate binary was referenced by
a hardcoded preservation-test path; the explicit external fixture corrected that.
The first fresh browser run had6 passes/2 failures: one new heading selector and
selection contamination after deleting test datasets. The actual heading/Sign out
selectors and original-selection teardown were corrected; all8 subsequently passed.
An initial one-line shell path probe had quoting failure and was replaced by the
reviewable Python script. These failures were not treated as application regressions
or passing verification. No test was dropped to hide a failure.

## E. Files, limitations and source safety

Created the Windows guide, this report, recorded isolated Python resolution,
snapshot/path/first-run/local-AI verification scripts and dedicated browser config/
test. Corrected the ML dev manifest to include its declared runtime dependencies,
test-only candidate/reference fixture paths and dataset E2E teardown. README/SETUP
now point at the new guide and correct stale PostgreSQL/cwd/npm-install guidance.
No app schema/auth/model/provider contract change was made in this portability task.

The installed npm lock audit reports **25 advisories:2 low,7 moderate,14 high,
2 critical**. No npm audit fix/dependency upgrade was executed. Exact transitive
Python locking, a reviewed active-model distribution/training decision and an
eventual commit/push are remaining reproducibility decisions. External production
hosting and a clean remote Git clone were not verified. Optional model generation
depends on trusted installed software/model resources; timing is context/workload
dependent, and warm-up does not guarantee all outputs meet20 seconds.

No real `.env`, secret, private upload, runtime database, local model weights or
temporary output was added to Git. Existing integration changes/reports/tests,
inventory JSON/scripts, handoff and candidate are preserved. Origin remains
`https://github.com/Trunal2005/Autonomous-Business-Intellignece-Platform.git`.
Friend's source checkout/commit remain unchanged. No commit, merge, push, branch
switch, reset or clean occurred. Candidate activation remains blocked/inactive;
its SHA stays e248090a7a66b2dbbdab7c431924af1036bac2b2691e80a1547df60726fa117a.
Final diff/changed files were reviewed and git diff --check passes.

Owned servers on5173/5183/8013/8033/8034/8035 and the audit daemon on11434 are
stopped; no listeners remain on those test ports. The explicitly identified
failed disposable probe directory was removed after confirming its temporary
root/name. Installed model weights and unrelated processes were preserved. The
tested workspace and separate labelled fixture remain available for review;
neither is a source/Git bundle.

## G. Final verdict

**PARTIAL — CORE WORKS, SETUP OR LOCAL AI LIMITATION REMAINS**

The current sanitized workspace starts and supports the verified uploaded-data
core without paid APIs or developer database files. Optional local AI works at
normal timeout on the tested fixture and has truthful fallback. Full trained ML
inference remains dependent on separately supplied untracked artifacts; the
uncommitted tree is not yet reproducible from the remote Git clone. Those limits
prevent a stronger fresh-clone completion claim.
