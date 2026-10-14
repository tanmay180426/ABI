# Windows local setup

This guide describes the integration branch's development checkpoint. Checkout
`integrate/abi-ml-backend` to use this source; the default branch may differ.
Read `FRESH_WORKSPACE_READINESS.md` for the exact sanitized-snapshot evidence,
missing-file limitations and test results. Never clone over an existing checkout.

## Prerequisites and costs

Verified on Windows with Python **3.13.5**, Node **20.19.4** and npm's existing
`frontend/package-lock.json`. Other Python/Node combinations are not certified by
this run. Install Python and Node separately if missing and reopen PowerShell.
Docker, PostgreSQL, Ollama and paid API keys are not required for uploaded-dataset
analytics. Initial package/browser/optional model installation can require Internet
access. Runtime local computation still consumes hardware, storage and electricity.

## Install declared dependencies

From your checkout root, using a virtual environment that excludes global packages:

```powershell
python --version
node --version
python -m venv backend/.venv
& ./backend/.venv/Scripts/python.exe -m pip install -r backend/requirements-dev.txt -r ml/requirements-dev.txt
& ./backend/.venv/Scripts/python.exe -m pip check
Push-Location frontend
npm ci
Pop-Location
```

The ML development manifest now includes its existing runtime manifest. This
installs the declared versions; no upgrade/fix command is part of setup. Python
direct requirements are pinned, but transitive dependencies have no complete lock;
the tested resolution is recorded separately. `npm ci` preserves the npm lockfile.
No PowerShell activation-policy change is needed when invoking the venv Python.

## Environment contract

For the initial local smoke test, no `.env` is required. Auth is enabled, the API
uses SQLite and optional language generation is disabled. If customizing settings,
create a root `.env` safely without overwriting an existing file:

```powershell
if (-not (Test-Path -LiteralPath .env)) { Copy-Item -LiteralPath .env.example -Destination .env }
```

Use a local signing secret and your own development account passwords if desired;
never print or commit their values. Changing bootstrap password settings after
accounts exist does not reset those accounts. Always check environment names,
not secret values, when troubleshooting. The frontend is normally started from
`frontend`, so pass its settings in that terminal if overriding them; a root
`.env` alone is not a guaranteed Vite override.

| Name | Default/documented value | Required? | Purpose / feature | Secret? |
|---|---|---|---|---|
| DATABASE_URL | Stable `backend/sem5.db`; legacy `sqlite:///./sem5.db` resolves there | Default sufficient | Auth, datasets, analytics; explicit custom databases remain supported | Can include credentials for other database drivers |
| SECRET_KEY | Existing development default; choose a private local value | Default sufficient for smoke | Token signing | YES |
| AUTH_ADMIN_PASSWORD / AUTH_ANALYST_PASSWORD | Source-defined local development bootstrap defaults | Default sufficient; configure before first login if desired | Initial two accounts | YES |
| AUTH_REQUIRED | true | Default sufficient | API guards; keep enabled | NO |
| VITE_AUTH_REQUIRED | true | Default sufficient | Frontend guards; keep enabled | NO |
| VITE_API_BASE_URL | http://localhost:8000 | Default sufficient | Frontend own-backend origin; no `/api` suffix | NO; never put secrets in VITE variables |
| ACCESS_TOKEN_EXPIRE_MINUTES / REFRESH_TOKEN_EXPIRE_MINUTES | 60 / 10080 | Optional | Token lifetime | NO |
| ENABLE_LLM_ASSISTANT | false | Optional | Local prose generation only | NO |
| LLM_PROVIDER | ollama only | Optional | Provider allowlist | NO |
| OLLAMA_BASE_URL | http://localhost:11434 | Optional | Loopback HTTP(S) daemon, no credentials/query/fragment | NO |
| OLLAMA_MODEL | llama3.2 | Optional | Already installed local model; cloud tags/aliases refused | NO |
| LLM_TIMEOUT_SECONDS | 20 | Optional | Each provider HTTP operation's timeout | NO |
| ML_MODELS_DIR / ML_DATA_DIR | Repo `ml/models` / `ml/data/processed` | Optional | Explicit existing local serving files; do not point at untrusted binaries | NO |
| OLIST_DIR | `%USERPROFILE%/Downloads/olist` | Only for optional reference ETL | Explicit source CSV directory | Path may be private |
| DATASET_MAX_BYTES / DATASET_MAX_ROWS / DATASET_MAX_COLUMNS / DATASET_MAX_CELLS / DATASET_MAX_SECONDS | 209715200 / 100000 / 100 / 2000000 / 60 | Optional | 200 MiB payload and single-file processing limits | NO |
| BUNDLE_MAX_EXPANDED_BYTES / BUNDLE_MAX_TABLE_ROWS / BUNDLE_MAX_TABLE_CELLS | 536870912 / 1500000 / 12000000 | Optional | ZIP expansion and per-table bundle limits | NO |
| BUNDLE_MAX_ROWS / BUNDLE_MAX_CELLS / BUNDLE_MAX_SECONDS | 5000000 / 40000000 / 900 | Optional | Whole-bundle processing limits | NO |
| OLLAMA_NO_CLOUD | 1 on the separate Ollama process | Required if choosing optional local daemon | Disables daemon cloud inference/web search; not a FastAPI setting | NO |

There is no required OpenAI/Anthropic/Gemini/OpenRouter API key, subscription,
credit balance or hosted inference account.

## Start the actual application

Backend terminal, from checkout root:

```powershell
Push-Location backend
& ./.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Alternative from root, verified with the stable database path:

```powershell
& ./backend/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Frontend terminal, from root:

```powershell
Push-Location frontend
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open [login](http://localhost:5173/login), [API health](http://localhost:8000/health)
and [API documentation](http://localhost:8000/docs). Use localhost in the browser:
the current CORS allowlist is exactly `http://localhost:5173`. A different browser
origin/port requires a supported CORS change; this guide does not invent a new
CORS environment variable or bypass policy. Keep both terminals running.

## First database and account bootstrap

No manually inserted records or migration command is needed for the fresh SQLite
app registry. The existing login/user service creates `app_user` on first use and
seeds Admin/Analyst only if it is empty. Dataset operations initialize their own
registry/selection tables with check-first creation. Existing databases are not
overwritten. There is no migration framework CLI to run for this path.

Development defaults come directly from config/users bootstrap: **admin / admin123**
and **analyst / analyst123**. They are public development defaults, not invented
accounts. If you customized bootstrap passwords before first login, use those.
Verify Admin can open Administration; Analyst must receive 403 on Admin APIs.

A fresh checkout has no private uploads or populated Olist warehouse. Dashboard
initially asks you to select a READY dataset; this is truthful, not a server defect.
Open Dataset Manager, upload your own supported CSV/XLSX/XLS/flat-record JSON,
inspect schema/capabilities, confirm semantic roles/currency if needed and select
it in the header. Then open Dashboard/Analytics, change filters, ask a supported
numerical Insights question and export a CSV. Each user owns their uploads; Admin
does not silently gain access to an Analyst's private dataset. Log out/in to verify
persisted selection. Deleted/failed selections never silently fall back to Olist.

Optional reference ETL uses the existing command `python -m app.services.etl`
from backend, with your own approved Olist CSV source/OLIST_DIR. It is not startup
initialization and is not needed for uploaded analytics. It can populate warehouse
tables and must be an explicit operation. Do not run it against a valuable database
without understanding the existing ETL behavior.

## Existing ML files are a separate prerequisite

Git tracks metadata, **not the six deployed `.joblib` artifacts**, processed
training data or the populated reference database. A clean clone alone cannot
perform those trained inferences. Missing artifacts/unsupported datasets display
Not Applicable/unavailable rather than fabricated predictions or paid substitutes.
Supply an authorized trusted compatible artifact bundle separately, or make a
separate explicitly approved reference-training decision using the existing scripts.
This audit did not retrain, replace or bundle weights. Metadata alone is not a model.
The ABI candidate remains inactive and must not be placed in the serving registry.

## Optional Ollama: installed local models only

Ollama **0.40.3** and an existing `gemma3:1b` were tested. Ollama is optional; install
its software separately if you choose it. This guide does not automatically pull
or download a model. Check `ollama list` and `ollama show gemma3:1b`; choose a model
that is already present. Users choosing Gemma must review the
[applicable Gemma terms](https://ai.google.dev/gemma/terms). Weights are never committed.

For a manually launched daemon, first quit any existing Ollama desktop/server
instance to avoid two processes competing for port11434. In its own PowerShell:

```powershell
$env:OLLAMA_NO_CLOUD='1'
$env:OLLAMA_HOST='127.0.0.1:11434'
ollama serve
```

These variables belong to that process. Setting them only in the API terminal
does not affect an already running desktop daemon. For desktop auto-start,
explicitly quit Ollama, edit **your user** environment variables through Windows
Settings/Control Panel, add OLLAMA_NO_CLOUD=1, apply and restart Ollama from Start.
That is an operator choice; this audit did not change global/user persistent
environment settings. Confirm its log says `Ollama cloud disabled: true`.
See [official Ollama Windows/local-only instructions](https://docs.ollama.com/faq).

Then configure the API terminal before starting/restarting FastAPI:

```powershell
$env:ENABLE_LLM_ASSISTANT='true'
$env:LLM_PROVIDER='ollama'
$env:OLLAMA_BASE_URL='http://localhost:11434'
$env:OLLAMA_MODEL='gemma3:1b' # only if installed; otherwise choose your installed local model
```

Inspect authenticated `/api/insights/status`. Reachable means the daemon answers,
not that the configured model exists or will meet your latency budget. The app
checks local model metadata before sending prompts and refuses remote aliases,
cloud tags, external URLs, proxies and redirects. Unverifiable metadata safely
falls back. Never weaken the loopback policy to make another host reachable.

To disable optional generation again, set ENABLE_LLM_ASSISTANT=false in its actual
environment and restart FastAPI. Login, dataset operations, analytics, existing
available ML, CSV and numerical Insights do not require Ollama.

## Cold-start timing and optional bounded warm-up

Frontend fetch has no configured timeout. Backend provider calls use HTTPX's
configured connect/read/write/pool timeout (20 seconds normally), separately for
model metadata and generation; it is not a single strict end-to-end 20-second
deadline. Model load/prompt evaluation/generation occur on the daemon. No timeout
was raised to 300 for normal app verification. Failed calls return llm_unavailable
with an explicit limitation and deterministic current-data summary.

On the small two-row fixture, actual running-app cold generation took **9.862s**,
warm **6.183s**, and numerical queries **0.052–0.073s** even with absent/unreachable
models. Earlier larger Olist context had a 90-second cold probe timeout; its
300-second warm probe is historical overridden evidence, not proof of normal-timeout
performance. Context size, hardware and other workload matter; prose quality is
not validated by a successful/nonempty answer.

A separate larger-reference descriptive request passed normal20 with cold19.417s
and warm13.198s. Numerical answers remained computed, including during generation.
The earlier90-second failure was not reproduced and its exact cause remains
unknown; these measurements do not guarantee every prompt/context will finish
within the normal timeout. See the readiness report for both experiments.

If you want an explicit preload, first confirm the model is installed/local and
cloud mode disabled. In an optional terminal, bound the preload independently:

```powershell
$localModel='gemma3:1b'
$modelInfo=Invoke-RestMethod -Uri 'http://localhost:11434/api/show' -Method Post -ContentType 'application/json' -Body (@{model=$localModel} | ConvertTo-Json) -TimeoutSec 10
if (-not $modelInfo.model_info -or $modelInfo.remote_model -or $modelInfo.remote_host) { throw 'An installed local model is required.' }
Invoke-RestMethod -Uri 'http://localhost:11434/api/generate' -Method Post -ContentType 'application/json' -Body (@{model=$localModel;stream=$false} | ConvertTo-Json) -TimeoutSec 120
```

This sends no dataset/question, does not pull a model, does not change application
timeouts and runs only when you choose it. Use `ollama ps` to inspect loaded state;
`ollama stop gemma3:1b` unloads that model when desired. The measured existing model
disk size was **815,319,791 bytes**, reported loaded size **877,196,738 bytes** with
that size attributed to VRAM. These are runtime metrics, not a total-RAM/minimum
hardware guarantee. Allow extra RAM/storage for Python, uploaded data, browser and
context/KV cache. No universal CPU/RAM/GPU minimum was benchmarked.

The local prompt contains controlled authorized aggregate context, dataset identity,
labels/filters/series and schema/statistics, which may still be sensitive metadata.
Raw row exports, credentials and administration data are not sent. Trust the local
daemon; generated prose is not verified business truth. Numerical/grouped answers
remain authoritative local metric calculations.

## Troubleshooting and supported execution mode

- Failed to fetch: verify `/health`, both terminals, exact frontend/API origins and
  VITE_API_BASE_URL (an origin without `/api`); restart Vite after changing it. Use
  strictPort so occupied5173 cannot silently move to an origin disallowed by CORS.
- Missing database: verify permissions to the checkout's backend directory and the
  stable SQLite default. Do not copy another student's database or delete an existing
  one. First login/dataset operations handle app schema initialization.
- Empty Dashboard: upload/confirm/select READY data. Missing Olist is expected on
  a fresh checkout. Deleted selections require an explicit valid selection.
- Missing model: metadata is not a binary. Check your separately supplied trusted
  active artifacts and explicit ML_MODELS_DIR; optional Ollama models are different
  from the six platform ML artifacts.
- Local generation timeout: numerical answers still work; inspect model/daemon,
  use an optional bounded preload, or leave generation disabled. Do not substitute
  cloud models or raise every application timeout just to hide cold-start limits.
- Supported mode: FastAPI/Vite on the Windows host. Container localhost is inside
  that container, not the host Ollama daemon. Dockerized FastAPI plus host Ollama
  is **not supported by this loopback-only setup**; no LAN/host.docker.internal
  workaround is provided. Docker is not mandatory for ordinary core operation.
- Never commit `.env`, secrets, uploads, SQLite runtime files or model weights.
  Preserve existing work. The current npm lock audit reports 25 dependency advisories;
  this task did not run npm audit fix or upgrade packages. Review separately.

## Regression commands

See `FRESH_WORKSPACE_READINESS.md` for fresh checks versus explicit reference/model
fixtures. Backend from backend: `python -m pytest tests --rootdir=. -q`; add
`--free-only-network` to deny external requests. Full reference checks require an
explicit `--reference-db` and compatible saved models; rootdir avoids Windows
pytest8 collection of an external path. ML: `python -m pytest ml/tests -q` from root.
Frontend: npm test, npm run lint, both existing TypeScript configs and npm run build.
Browser installation, if missing: `npm run e2e:install`; existing fixtures use
disposable databases. Do not point destructive tests at a valuable live database.
