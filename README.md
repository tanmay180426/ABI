# AI-Powered Business Intelligence and Predictive Analytics Platform (sem-5)

Semester 5 academic project: AI, Data Warehousing & Mining, and Software
Engineering integrated into one working platform. Supports private uploaded
structured datasets alongside the Olist Brazilian E-Commerce reference.

## Dataset workflow

Sign in, open **Dataset Manager**, upload CSV, a single-sheet XLSX/XLS workbook,
or a JSON array of flat records, then select a READY dataset in the header.
Dashboard, analytics, filters, reports, ML compatibility and AI context follow
that selection. Existing trained models are reused when compatible; uploads do
not trigger retraining. Incompatible data receives a reasoned Not Applicable
result without fabricated predictions.

See [Universal datasets](docs/UNIVERSAL_DATASETS.md) for limits, semantic
corrections, isolation, model requirements and supported structures, and
[verification report](docs/UNIVERSAL_DATASET_REPORT.md) for actual test results.

## Quick Status â€” complete
- Dataset support: private uploads plus the optional Olist reference warehouse.
- Reference source: `%USERPROFILE%\Downloads\olist` (9 CSVs, never committed).
- Tools: git, node, python, pip, docker. `gh` CLI intentionally not used.
- Phase: all master-prompt phases done (see `docs/CHECKLIST.md`); live status in
  `docs/STATUS.md`.

## Stack (delivered)
- Frontend: React + TypeScript + Vite + TailwindCSS + Recharts + Framer Motion
  (routes code-split; ESLint configured; Vitest + Playwright tests)
- Backend: FastAPI + Pydantic + SQLAlchemy (JWT auth/RBAC, CSVs, admin APIs)
- DB/WH: SQLite for dev, PostgreSQL as documented target (star schema)
- ML: pandas, numpy, scikit-learn, joblib (5 features; real metrics)
- AI: provider-agnostic LLM (Ollama preferred) with deterministic fallback

## Setup (local)
For the current Windows workflow, read [LOCAL_SETUP_WINDOWS.md](docs/LOCAL_SETUP_WINDOWS.md).
This integration branch is a development checkpoint before the planned UI
redesign, not a production release. Trained serving binaries are separate local
prerequisites, not tracked assets. Fresh uploaded analytics works without them
or Ollama. Prior verification used sanitized working-tree snapshots; it does
not establish a GitHub clean-clone test of this checkpoint.

1. For the optional reference warehouse, place Olist at `%USERPROFILE%\Downloads\olist`.
2. Copy `.env.example` to `.env` (optional; sensible dev defaults exist).
3. Frontend: `cd frontend && npm install`
4. Backend: `cd backend && pip install -r requirements.txt`
5. ML: `cd ml && pip install -r requirements.txt`
6. Optional reference warehouse: `cd backend && python -m app.services.etl`
7. Use existing local saved models. To explicitly train the reference models when
   artifacts are absent: `cd ml && python run_all.py`. Uploads never train models.
8. Run the API: `cd backend && python -m uvicorn app.main:app --reload`
9. Run the UI: `cd frontend && npm run dev`

## Testing
```powershell
cd backend; python -m pytest -q          # Isolated API/integration tests; optional reference fixtures
cd ml;      python -m pytest -q          # ML pipeline tests
cd frontend; npm test                    # Component/API tests (Vitest)
cd frontend; npm run e2e                 # Real browser workflows (Playwright)
cd frontend; npm run lint; npm run build
```

## Roles (two only â€” see `docs/RBAC.md`)
| Role | Can do | Cannot do |
|---|---|---|
| `analyst` | Dashboard, analytics, ML models + metrics, AI insights, reports & CSV exports | Users, roles, system health, ETL, warehouse/ML admin, settings |
| `admin` | Everything above **plus** platform administration | â€” |

Seeded dev accounts: `admin` / `admin123`, `analyst` / `analyst123`.
There is no viewer role; legacy `viewer` accounts become `analyst`. Authorization
is enforced by the backend (frontend guards are UX only).

## Docs
See `docs/` (SRS, ARCHITECTURE, DATABASE_DESIGN, KPIs, ML_DOCUMENTATION,
API_DOCUMENTATION, RBAC, TESTING, POSTGRES, SETUP, PROJECT_PLAN, DECISIONS,
STATUS, CHECKLIST).

## Notes
- Folder/ZIP bundles accept a 200 MiB payload and separate bounded processing
  budgets. Recognized Olist bundles support an order-grain Dashboard; see
  `docs/UNIVERSAL_DATASETS.md`.
- ML and website were developed in parallel and integrated via documented interfaces.
- AI assistant uses authorized backend data only (no arbitrary SQL).
- `AUTH_REQUIRED` and `VITE_AUTH_REQUIRED` default to `true` (login required).
- No secrets or raw dataset committed.
