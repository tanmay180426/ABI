# Free-only API and local AI audit

Historical local free-only audit (2026-10-13). Measurements and machine state describe the recorded runs; optional installed Ollama/model resources and private fixtures are not distributed by this checkpoint.

The later [Windows setup guide](LOCAL_SETUP_WINDOWS.md) and
[fresh-workspace readiness report](FRESH_WORKSPACE_READINESS.md) record isolated
dependency installation and normal-timeout cold/warm tests. The evidence below
is retained as the earlier free-only audit rather than rewritten as clone proof.

Audited 2026-10-13, workspace `<checkout-root>`, branch
`integrate/abi-ml-backend`, HEAD `9aaa1200d7e28797ce177a84a920138b4b4b87c9`
plus its preserved integration working tree. Earlier API coverage evidence is
retained in `API_ENDPOINT_COVERAGE.md`; the results below were executed for this task.

## Policy and result

**ZERO-COST CORE VERIFIED — NO PAID API REQUIRED**

Free here means no mandatory paid external API, key, subscription, billing account,
credits, request charges or hosted free-tier quota for core local workflows.
It does not mean zero hardware, electricity, storage or initial installation cost.
No claim of permanently free hosted services is made.

| Requirement | Result |
|---|---|
| Paid external API required for core operation | NO |
| Paid API key required for startup | NO |
| Paid API key required for numerical Insights | NO |
| Local LLM supported | YES, existing Ollama provider |
| Real local LLM tested | YES, already installed gemma3:1b via the real authenticated Insights route, cloud disabled |
| Deterministic fallback tested | YES, real authorized dataset/filter computations and unavailable-provider paths |
| Core features work without external provider credentials | YES, complete guarded backend and real browser runs |
| Initial setup downloads | Python/Node packages and browser binaries; optional Ollama/model installation, unless already present |

## Architecture and exhaustive outbound-call inventory

The frontend sends requests to the application's own configurable API origin
(`VITE_API_BASE_URL`, default `http://localhost:8000`). These FastAPI endpoints
are local application APIs, not paid inference services. The backend defaults to
the existing stable `backend/sem5.db` SQLite file. Analytics, dataset processing,
authentication/RBAC, active saved ML inference, reports/CSV and administration
execute locally with installed dependencies and available data/artifacts.

Searches covered backend application code, frontend source/index/styles, ML source,
scripts, dependency manifests, configuration/environment example and docs. Only
the existing Ollama adapter contains application outbound HTTP requests. There is
no OpenAI, Anthropic, Gemini, OpenRouter, embedding/hosted inference SDK, external
geocoding, telemetry/analytics or cloud storage client in the application. Browser
fetch occurs only in `frontend/src/services/api.ts` and `auth.ts`; no external
font/script/data request was found in application markup/styles.

| Provider / dependency | Exact use and location | Contacted/default | Key / monetary classification | Core required | Action / evidence |
|---|---|---|---|---|---|
| Own FastAPI backend | Frontend API/auth wrappers; dataset, analytics, ML, Insights, reports, admin | Runtime, local API default | No paid provider key; local compute costs | YES, owned backend | Preserved; real API and browser suites pass |
| Local SQLite | `app/core/config.py`, SQLAlchemy database/session | Runtime, stable local default | No external service billing; storage costs | YES, configured local database | Preserved; reference copied read-only for tests |
| Optional PostgreSQL/custom SQLAlchemy database URL | Existing DATABASE_URL override and psycopg2 dependency | Only if explicitly configured; not default | Local self-hosted database needs no paid API; arbitrary cloud database POSSIBLY BILLABLE | NO cloud database required | Custom URLs preserved; template now illustrates actual SQLite default; no cloud database tested |
| Local Ollama inference | `app/ai_assistant/provider.py`, POST `/api/show` then `/api/generate` | Only enabled optional generation after numerical intent handling; default DISABLED | No API key; local inference requires hardware/electricity, not external API payment | NO | Loopback/model guards, no proxy/redirects, real protocol tests and installed-model probe |
| Local Ollama diagnostics | Same adapter, GET `/api/tags` via Insights status | Only when optional assistant enabled; default DISABLED | No API key or external API billing | NO | Failed probe gives reachable false; real status tested |
| Ollama cloud/remote inference | Capability of a separately installed Ollama daemon, not a project provider implementation | Refused by app; not enabled in supported path | POSSIBLY BILLABLE / hosted quota; excluded whether free trial or paid | NO | Cloud tags and remote aliases rejected before sending context; daemon cloud disabled for final probe |
| OpenAI / Anthropic / Gemini / OpenRouter | No runtime integration or credential lookup found | NO | Pricing not relied upon; no application dependency | NO | Unsupported provider identifiers rejected; corresponding credentials removed from test process |
| Package/model/browser registries; GitHub URLs | Dependency setup, optional model pull, repository links/historical documentation | Setup/operator actions only | Network/download may be needed; not a runtime paid API assumption | NO per-request dependency after setup | No automatic model pull/install; existing model reused |

Runtime local HTTP destinations and payloads:

- `/api/tags`: diagnostics GET, no dataset/question body.
- `/api/show`: model identifier only. Preflight must show nonempty local model_info
  with no remote_model or remote_host; otherwise no prompt is sent.
- `/api/generate`: configured local model identifier, question plus controlled
  authorized aggregate context, stream=false. Context includes dataset name/id,
  confirmed semantics/capabilities, filters, aggregate KPIs/series/category labels,
  and tabular field schema/numeric statistics. It is not a raw row export, though
  names/categories/schema may still be sensitive. It contains no auth tokens,
  provider credentials or platform administration records. It is sent only to
  the explicitly enabled trusted loopback daemon.

No dataset/schema/question transmission occurs to a third-party provider by default.
There is no automatic hosted substitution if Ollama fails. No keys or sensitive
prompt/answer contents are printed by the verification script or added to this report.
The developer's real `.env` was not edited or copied; only its variable names were
inspected. No hosted-provider key variable exists in that local file. Authentication
SECRET_KEY/password settings remain necessary local security configuration and
are not paid provider credentials.

## Insights execution and truthful fallback

`POST /api/insights/query` retains its method/body and response shape. Authentication,
Admin/Analyst checks and authorized selected dataset resolve before the handler.
Existing `analytics_filters` and shared metrics compute scoped context. Supported
grouped or numerical intents return immediately with `provider: computed`, actual
dataset identity and aggregate source. Revenue/counts/averages are never delegated
to an LLM. Existing business calculations, date/filter semantics and model behavior
were not changed.

Other questions may use optional local generation if explicitly enabled. If the
flag is off, the model is missing, the daemon is unavailable, metadata describes
a remote model, the response is invalid/empty or the call times out, the response
contains `status: llm_unavailable` and an explicit inability to answer that question,
followed by an actual deterministic summary. It does not present the summary as an
answer to an unsupported request. Unsupported numerical/grouping requests retain
the existing calculation limitation responses. No invented forecasts, confidence,
sources or anomaly explanations are introduced. Frontend stale-result safeguards
and visible provider/status/source behavior are preserved.

`GET /api/insights/status` keeps enabled/provider/model/reachable/fallback fields.
Disabled mode sends no probe. Enabled mode probes only the loopback daemon and
does not equate daemon reachability with a successfully installed/usable model.
Invalid configuration fails startup clearly without echoing input secrets;
runtime adapter checks also fail safely if settings are mutated after startup.

## Changes and configuration transition

- Allowed actual provider identifier: `ollama` only. Deterministic-only mode remains
  `ENABLE_LLM_ASSISTANT=false` (default). No new application provider/key variable.
- Existing host/port/model remain configurable. OLLAMA_BASE_URL must be HTTP(S)
  on localhost or a literal loopback IPv4/IPv6 address, without credentials,
  query or fragment. Previously accepted LAN/remote URLs and unknown provider
  identifiers now fail with a clear free-only policy error, even when disabled.
  Migrate to loopback and ollama; no remote inference opt-in was introduced.
- Cloud-tag model identifiers are rejected. POST `/api/show` prevents a renamed
  remote alias from receiving prompts. A service that cannot provide trustworthy
  local model metadata falls back instead of assuming local inference.
- Every provider HTTP request has trust_env=False and follow_redirects=False,
  preventing inherited proxy or redirect forwarding. Error details contain only
  exception class names, without URL credentials, prompts or response text.
- `.env.example` now illustrates SQLite and documents local-only setup. The
  existing httpx==0.27.0 dependency was moved from requirements-dev to requirements
  because the optional provider uses it at runtime; no new package/version upgrade
  or dependency installation was performed.
- The fallback explanation was corrected; metrics and API payload fields remain
  compatible. No endpoint was added/removed or had its method/auth changed.

Regenerated actual route inventory still has **56 method/path pairs**: GET38,
HEAD4, POST8, PATCH4, PUT1, DELETE1; 45 protected, 13 Admin-only. Prior 35 connected
operations/21 intentionally API-only classifications remain intact. The complete
107 API contract cases run again inside the new full backend verification.

## Optional local model setup and resources

Install dependencies using the existing project setup. If optional text generation
is wanted, install Ollama separately and choose a model that fits the machine.
Do not point this app at a cloud provider or select a cloud model. Before starting
or restarting the separate daemon:

```powershell
$env:OLLAMA_NO_CLOUD='1'
ollama serve
```

The environment setting must reach the **Ollama daemon process**, not merely
FastAPI. It disables Ollama cloud inference/web search according to
[Ollama's official FAQ](https://docs.ollama.com/faq#how-do-i-disable-ollama-cloud-features).
The project does not manage daemon installation or persistent machine settings.
Cloud/remote metadata fields are documented in the
[official Ollama API types](https://github.com/ollama/ollama/blob/main/api/types.go).
The app does not invoke pull, cloud login, web search, tools or update APIs.

For FastAPI, use the existing settings: ENABLE_LLM_ASSISTANT=true,
LLM_PROVIDER=ollama, OLLAMA_BASE_URL=http://localhost:11434 and OLLAMA_MODEL equal
to an already installed model. Default LLM_TIMEOUT_SECONDS stays 20; slow CPU
inference can honestly fall back. If no daemon/model is installed, leave the flag
false and every core calculation still works. Initial model pulls are optional
operator downloads and should be reviewed for source/license/resource needs.

This machine already had Ollama 0.40.3 and a `gemma3:1b` manifest; no model was
downloaded, replaced or retrained. The probe uses that installed artifact only.
Model weights, loaded state/KV cache and prompts consume disk/RAM and CPU/GPU;
requirements depend on model/context. The 90-second cold probe timed out; a
short-response warm probe with a probe-only 300-second timeout succeeded. Neither
changes the app's default timeout or guarantees latency/answer quality on another
machine. Local generation is optional, and generated prose is not verified business
truth; deterministic metrics remain authoritative.

## Verification evidence

All mutations use disposable storage; reference SQLite is opened read-only and
copied. No valuable local database, private upload or source artifact is modified.

| Check | Exact command/environment | Fresh result |
|---|---|---|
| Full backend and offline application boundary | From backend: `python -m pytest tests -q --reference-db sem5.db --free-only-network` | 300 passed, 0 failed/skipped; 412 warnings; 301.51 seconds |
| Ordinary full backend command compatibility | From backend: `python -m pytest tests -q --reference-db sem5.db`, hosted credentials absent | 300 passed, 0 failed/skipped; 412 warnings; 308.82 seconds |
| New policy tests | `tests/test_free_api_policy.py`, included in final suite | 25 passed; config, safe errors, proxy/redirect/remote alias prevention, real loopback protocol, selected/filter-scoped calculations, unreachable daemon |
| Focused policy + Insights | `python -m pytest tests/test_free_api_policy.py tests/test_insights.py -q --free-only-network` | 31 passed, 0 failed/skipped |
| Existing endpoint/RBAC/dataset regressions | All existing backend cases, including 107 connectivity cases and 17 ABI reliability cases, included in full run | All passed; unchanged routes/security/data isolation |
| ML pipeline | Root: `python -m pytest ml/tests -q` | 8 passed, 0 failed/skipped |
| Frontend unit | Frontend: `npm test` | 47 passed, 0 failed/skipped |
| Lint | `npm run lint` (repeated after new E2E test) | Passed |
| TypeScript | `npx tsc --noEmit -p tsconfig.json`; `npx tsc --noEmit -p tsconfig.contracts.json` | Both passed, repeated after new E2E test |
| Production build | `npm run build` | Passed; 874 modules |
| Full real browser | Python313 PATH; ports8013/5183; provider credentials removed; `npm run e2e -- --workers=1 --output='../.universal_work/free-only-final-e2e'` | 17 passed, 0 failed/skipped |
| Actual installed local model | Cloud-disabled loopback daemon; root: `python scripts/verification/local_ai_probe.py --model gemma3:1b --timeout 300` | PASSED; status reachable, numerical provider computed, generation provider ollama/available, matching dataset scope, two-character answer |
| Registered inventory | `python scripts/verification/api_inventory.py` | 56 pairs, unchanged method/access counts |

The backend guard rejects non-loopback DNS and socket connect/connect_ex, and
records attempts so a provider catching the exception cannot turn attempted
external access into a passing test. All core application tests run under it;
ASGI router/services/storage are real, not replaced with mock implementations.
Hosted-provider KEY/TOKEN environment values are stripped in the guarded process.
Local protocol tests use an actual test HTTP server (not a real LLM) to inspect
exact model-only preflight and generation payloads. Numerical API tests forbid
provider HTTP entirely, verify filtered 200/800 from two independent datasets,
then exercise a real unreachable loopback socket and truthful fallback.

The new browser test intercepts external destinations, aborts and records them,
then asserts zero attempts while login, dashboard, analytics, ML catalog, admin,
reports and numerical/unsupported Insights work. Other existing real browser
scenarios cover upload/schema/delete, switching, all analytics areas, active ML,
Not Applicable, CSV refresh/download and Admin mutations. No route-response mocks
are used. This proves the tested app requests do not require Internet access at
the application boundary; the entire host was not physically disconnected and
OS/browser updates or unrelated programs are outside the claim.

Actual local-model verification is separate from protocol fixtures. It uses a
disposable reference warehouse, real login/status/numerical query and generation
through `/api/insights/query`, asserts provider/status and matching dataset scope,
and prints only metadata/counts rather than prompts/answers/tokens. The temporary
daemon is launched hidden, with cloud disabled, and only that daemon/runner is
cleaned up afterward. Both audit daemon/runner were stopped; ports11434/8013/5183
have no listeners. Installed weights and unrelated resources were preserved.

An intermediate full run before the remote-alias preflight had 297 passes; it
is not substituted for the final full result after that change. The initial cold
model timeout is disclosed above and was not called a successful generation.
No test result from the previous API task is used as current evidence.

## Git/model safety and remaining limitations

Branch and HEAD are unchanged. Origin before/after remains
`https://github.com/Trunal2005/Autonomous-Business-Intellignece-Platform.git`.
Source checkout at `f1d2a5a7c1b70ee9092403af5873e5c624f193c9` is unchanged.
All previous local integration work, reports/tests/handoff and configuration fixes
are retained. No commit, merge, push, reset, cleanup of repository changes, real
environment file edit, secret/token/raw dataset/cache/database addition or remote
change was performed. Final `git diff --check` passes; changed files were reviewed.

All active model artifacts/features/scalers/algorithms/units remain unchanged.
The ABI Gradient Boosting candidate stays inactive with SHA-256
`e248090a7a66b2dbbdab7c431924af1036bac2b2691e80a1547df60726fa117a`. Its training,
synthetic data provenance, split and evaluation evidence remain missing; the
free-only policy does not validate it. Missing active artifacts retain unavailable
states and are never replaced by paid inference.

No remaining paid API/key/billing prerequisite was found for core local workflows.
Optional local AI still depends on installed, trusted model software/resources and
server availability. A separately configured cloud database or external own-API
deployment is outside the supported tested local path. Metadata guards trust the
local daemon to describe its model truthfully; this is not a defense against an
adversarial local service or model alias being changed concurrently. Keep the
daemon in documented cloud-disabled mode. No load/performance audit, model-prose
accuracy guarantee or whole-machine network-isolation claim is made.
