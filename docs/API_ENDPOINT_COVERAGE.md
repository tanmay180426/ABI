# API endpoint coverage audit

Historical API coverage and local verification evidence (October 2026). Fixtures and runtime outputs are not distributed by this source checkpoint; recorded counts are the results of the stated runs, not a new clean-clone claim.

Generated from the actual registered application and TypeScript AST; source commit `9aaa1200d7e28797ce177a84a920138b4b4b87c9`, integration working tree, 2026-10-13.

## Counting and evidence

One entry per explicit registered method/path; docs HEAD counted separately; CORS OPTIONS is middleware, not an endpoint.

Registered method/path pairs: **56**. Methods: `{'GET': 38, 'HEAD': 4, 'POST': 8, 'PATCH': 4, 'PUT': 1, 'DELETE': 1}`. Access: `{'public': 11, 'authenticated': 32, 'admin': 13}`.

Frontend exported network operation definitions: **41** (helpers and local logout excluded). Unused wrappers are recorded rather than treated as connected consumers.

JSON companions contain exact query/path/header parameter schemas, request bodies, OpenAPI responses, dependency tree, source handler and response keys: `API_ROUTE_INVENTORY.json`, `FRONTEND_API_INVENTORY.json`. Most backend handlers return untyped dicts; an empty OpenAPI response schema is not evidence of a typed contract. Runtime contract tests must verify those payloads.

## Endpoint-to-consumer matrix

| Method/path | Purpose / handler | Auth/RBAC | Actual consumer | Request/response match | Current test | Status | Action / justification |
|---|---|---|---|---|---|---|---|
| GET /openapi.json | openapi | public | No active UI import | Runtime verified; see detailed JSON schema/source keys and test assertions | test_public_framework_and_health_get / test_explicit_registered_framework_head | INTENTIONALLY API-ONLY | Framework documentation/OpenAPI resource, including registered HEAD methods. |
| HEAD /openapi.json | openapi | public | No active UI import | Runtime verified; see detailed JSON schema/source keys and test assertions | test_public_framework_and_health_get / test_explicit_registered_framework_head | INTENTIONALLY API-ONLY | Framework documentation/OpenAPI resource, including registered HEAD methods. |
| GET /docs | swagger_ui_html | public | No active UI import | Runtime verified; see detailed JSON schema/source keys and test assertions | test_public_framework_and_health_get / test_explicit_registered_framework_head | INTENTIONALLY API-ONLY | Framework documentation/OpenAPI resource, including registered HEAD methods. |
| HEAD /docs | swagger_ui_html | public | No active UI import | Runtime verified; see detailed JSON schema/source keys and test assertions | test_public_framework_and_health_get / test_explicit_registered_framework_head | INTENTIONALLY API-ONLY | Framework documentation/OpenAPI resource, including registered HEAD methods. |
| GET /docs/oauth2-redirect | swagger_ui_redirect | public | No active UI import | Runtime verified; see detailed JSON schema/source keys and test assertions | test_public_framework_and_health_get / test_explicit_registered_framework_head | INTENTIONALLY API-ONLY | Framework documentation/OpenAPI resource, including registered HEAD methods. |
| HEAD /docs/oauth2-redirect | swagger_ui_redirect | public | No active UI import | Runtime verified; see detailed JSON schema/source keys and test assertions | test_public_framework_and_health_get / test_explicit_registered_framework_head | INTENTIONALLY API-ONLY | Framework documentation/OpenAPI resource, including registered HEAD methods. |
| GET /redoc | redoc_html | public | No active UI import | Runtime verified; see detailed JSON schema/source keys and test assertions | test_public_framework_and_health_get / test_explicit_registered_framework_head | INTENTIONALLY API-ONLY | Framework documentation/OpenAPI resource, including registered HEAD methods. |
| HEAD /redoc | redoc_html | public | No active UI import | Runtime verified; see detailed JSON schema/source keys and test assertions | test_public_framework_and_health_get / test_explicit_registered_framework_head | INTENTIONALLY API-ONLY | Framework documentation/OpenAPI resource, including registered HEAD methods. |
| GET /api/dashboard/kpis | kpis | authenticated | No active UI import | Runtime verified; see detailed JSON schema/source keys and test assertions | test_authorized_real_read_contracts; test_datasets for detail; test_real_report_csv_contract for exports; each-route anonymous test | INTENTIONALLY API-ONLY | Stable aggregate API; Dashboard now uses consolidated /api/analytics/overview. Legacy wrapper unused; no duplicate UI needed. |
| GET /api/dashboard/monthly-revenue | monthly_revenue | authenticated | No active UI import | Runtime verified; see detailed JSON schema/source keys and test assertions | test_authorized_real_read_contracts; test_datasets for detail; test_real_report_csv_contract for exports; each-route anonymous test | INTENTIONALLY API-ONLY | Stable aggregate API; Dashboard now uses consolidated /api/analytics/overview. Legacy wrapper unused; no duplicate UI needed. |
| GET /api/dashboard/revenue-by-category | revenue_by_category | authenticated | No active UI import | Runtime verified; see detailed JSON schema/source keys and test assertions | test_authorized_real_read_contracts; test_datasets for detail; test_real_report_csv_contract for exports; each-route anonymous test | INTENTIONALLY API-ONLY | Stable aggregate API; Dashboard now uses consolidated /api/analytics/overview. Legacy wrapper unused; no duplicate UI needed. |
| GET /api/dashboard/orders-by-status | orders_by_status | authenticated | No active UI import | Runtime verified; see detailed JSON schema/source keys and test assertions | test_authorized_real_read_contracts; test_datasets for detail; test_real_report_csv_contract for exports; each-route anonymous test | INTENTIONALLY API-ONLY | Stable aggregate API; Dashboard now uses consolidated /api/analytics/overview. Legacy wrapper unused; no duplicate UI needed. |
| GET /api/ml/status | ml_status | authenticated | getMlStatus → frontend/src/pages/ml/MlMetrics.tsx | Runtime verified; see detailed JSON schema/source keys and test assertions | test_authorized_real_read_contracts; test_datasets for detail; test_real_report_csv_contract for exports; each-route anonymous test | CONNECTED AND VERIFIED | Actual router contracts and browser workflows verified. |
| GET /api/ml/models/{name} | ml_model_detail | authenticated | No active UI import | Runtime verified; see detailed JSON schema/source keys and test assertions | test_authorized_real_read_contracts; test_datasets for detail; test_real_report_csv_contract for exports; each-route anonymous test | INTENTIONALLY API-ONLY | Programmatic model metadata inspection; UI catalog already exposes registered metadata/eligibility. |
| GET /api/ml/forecast | ml_forecast | authenticated | getForecast → frontend/src/pages/ml/RevenueForecast.tsx | Runtime verified; see detailed JSON schema/source keys and test assertions | test_authorized_real_read_contracts; test_datasets for detail; test_real_report_csv_contract for exports; each-route anonymous test | CONNECTED AND VERIFIED | Actual router contracts and browser workflows verified. |
| GET /api/ml/segments/customers | ml_customer_segments | authenticated | getCustomerSegments → frontend/src/pages/ml/MlAnalysis.tsx | Runtime verified; see detailed JSON schema/source keys and test assertions | test_authorized_real_read_contracts; test_datasets for detail; test_real_report_csv_contract for exports; each-route anonymous test | CONNECTED AND VERIFIED | Actual router contracts and browser workflows verified. |
| GET /api/ml/anomalies | ml_anomalies | authenticated | getAnomalies → frontend/src/pages/ml/MlAnalysis.tsx | Runtime verified; see detailed JSON schema/source keys and test assertions | test_authorized_real_read_contracts; test_datasets for detail; test_real_report_csv_contract for exports; each-route anonymous test | CONNECTED AND VERIFIED | Actual router contracts and browser workflows verified. |
| POST /api/ml/predict/sales | ml_predict_sales | authenticated | predictSales → frontend/src/pages/ml/MlAnalysis.tsx | Runtime verified; see detailed JSON schema/source keys and test assertions | test_rbac/test_datasets; active ML and incompatible ML E2E; each-route anonymous test | CONNECTED AND VERIFIED | Actual router contracts and browser workflows verified. |
| GET /api/ml/product-segmentation | ml_product_segmentation | authenticated | getProductSegments → frontend/src/pages/ml/ProductSegmentation.tsx | Runtime verified; see detailed JSON schema/source keys and test assertions | test_authorized_real_read_contracts; test_datasets for detail; test_real_report_csv_contract for exports; each-route anonymous test | CONNECTED AND VERIFIED | Actual router contracts and browser workflows verified. |
| GET /api/insights/status | insights_status | authenticated | No active UI import | Runtime verified; see detailed JSON schema/source keys and test assertions | test_authorized_real_read_contracts; test_datasets for detail; test_real_report_csv_contract for exports; each-route anonymous test | INTENTIONALLY API-ONLY | Provider diagnostics; user result reports provider/status and admin settings exposes configuration. |
| POST /api/insights/query | insights_query | authenticated | queryInsights → frontend/src/pages/Insights.tsx | Runtime verified; see detailed JSON schema/source keys and test assertions | test_optional_llm_fallback_is_honest_and_dataset_scoped; dataset AI E2E; each-route anonymous test | CONNECTED AND VERIFIED | Actual router contracts and browser workflows verified. |
| GET /api/analytics/filters | filter_options | authenticated | getFilterOptions → frontend/src/components/FilterBar.tsx | Runtime verified; see detailed JSON schema/source keys and test assertions | test_authorized_real_read_contracts; test_datasets for detail; test_real_report_csv_contract for exports; each-route anonymous test | CONNECTED AND VERIFIED | Actual router contracts and browser workflows verified. |
| GET /api/analytics/overview | overview | authenticated | getAnalyticsOverview → frontend/src/pages/Dashboard.tsx | Runtime verified; see detailed JSON schema/source keys and test assertions | test_authorized_real_read_contracts; test_datasets for detail; test_real_report_csv_contract for exports; each-route anonymous test | CONNECTED AND VERIFIED | Actual router contracts and browser workflows verified. |
| GET /api/analytics/sales | sales | authenticated | getAnalyticsSales → frontend/src/pages/analytics/Sales.tsx | Runtime verified; see detailed JSON schema/source keys and test assertions | test_authorized_real_read_contracts; test_datasets for detail; test_real_report_csv_contract for exports; each-route anonymous test | CONNECTED AND VERIFIED | Actual router contracts and browser workflows verified. |
| GET /api/analytics/orders | orders | authenticated | getAnalyticsOrders → frontend/src/pages/analytics/Orders.tsx | Runtime verified; see detailed JSON schema/source keys and test assertions | test_authorized_real_read_contracts; test_datasets for detail; test_real_report_csv_contract for exports; each-route anonymous test | CONNECTED AND VERIFIED | Actual router contracts and browser workflows verified. |
| GET /api/analytics/customers | customers | authenticated | getAnalyticsCustomers → frontend/src/pages/analytics/Customers.tsx | Runtime verified; see detailed JSON schema/source keys and test assertions | test_authorized_real_read_contracts; test_datasets for detail; test_real_report_csv_contract for exports; each-route anonymous test | CONNECTED AND VERIFIED | Actual router contracts and browser workflows verified. |
| GET /api/analytics/products | products | authenticated | getAnalyticsProducts → frontend/src/pages/analytics/Products.tsx | Runtime verified; see detailed JSON schema/source keys and test assertions | test_authorized_real_read_contracts; test_datasets for detail; test_real_report_csv_contract for exports; each-route anonymous test | CONNECTED AND VERIFIED | Actual router contracts and browser workflows verified. |
| GET /api/analytics/sellers | sellers | authenticated | getAnalyticsSellers → frontend/src/pages/analytics/Sellers.tsx | Runtime verified; see detailed JSON schema/source keys and test assertions | test_authorized_real_read_contracts; test_datasets for detail; test_real_report_csv_contract for exports; each-route anonymous test | CONNECTED AND VERIFIED | Actual router contracts and browser workflows verified. |
| GET /api/analytics/delivery | delivery | authenticated | getAnalyticsDelivery → frontend/src/pages/analytics/Delivery.tsx | Runtime verified; see detailed JSON schema/source keys and test assertions | test_authorized_real_read_contracts; test_datasets for detail; test_real_report_csv_contract for exports; each-route anonymous test | CONNECTED AND VERIFIED | Actual router contracts and browser workflows verified. |
| POST /api/auth/login | login | public | login → frontend/src/pages/Login.tsx | Runtime verified; see detailed JSON schema/source keys and test assertions | test_auth_refresh_and_self_service_aliases; test_users/test_auth; admin E2E | CONNECTED AND VERIFIED | Actual router contracts and browser workflows verified. |
| POST /api/auth/refresh | refresh | public | refreshAccessToken → frontend/src/services/api.ts | Runtime verified; see detailed JSON schema/source keys and test assertions | test_auth_refresh_and_self_service_aliases; test_users/test_auth; admin E2E | CONNECTED AND VERIFIED | Actual router contracts and browser workflows verified. |
| GET /api/auth/me | me | authenticated | No active UI import | Runtime verified; see detailed JSON schema/source keys and test assertions | test_authorized_real_read_contracts; test_datasets for detail; test_real_report_csv_contract for exports; each-route anonymous test | INTENTIONALLY API-ONLY | Lightweight identity contract; UI uses full /api/users/me instead. |
| POST /api/auth/register | register | admin | No active UI import | Runtime verified; see detailed JSON schema/source keys and test assertions | test_auth_refresh_and_self_service_aliases; test_users/test_auth; admin E2E; each-route anonymous test; each-route Analyst denial test | INTENTIONALLY API-ONLY | Compatibility create API; UI uses canonical POST /api/users. Unused createUser wrapper retained for review. |
| GET /api/auth/admin/users | admin_users | admin | No active UI import | Runtime verified; see detailed JSON schema/source keys and test assertions | test_authorized_real_read_contracts; test_datasets for detail; test_real_report_csv_contract for exports; each-route anonymous test; each-route Analyst denial test | INTENTIONALLY API-ONLY | Compatibility listing alias; administration uses canonical /api/users. |
| GET /api/users/me | read_me | authenticated | getMe → frontend/src/components/RequireAdmin.tsx | Runtime verified; see detailed JSON schema/source keys and test assertions | test_authorized_real_read_contracts; test_datasets for detail; test_real_report_csv_contract for exports; each-route anonymous test | CONNECTED AND VERIFIED | Actual router contracts and browser workflows verified. |
| PATCH /api/users/me | update_me | authenticated | No active UI import | Runtime verified; see detailed JSON schema/source keys and test assertions | test_auth_refresh_and_self_service_aliases; test_users/test_auth; admin E2E; each-route anonymous test | INTENTIONALLY API-ONLY | Authenticated self-service password API/PUT alias. No account-password screen promised in current UI; not an Admin password-reset button. |
| PUT /api/users/me | replace_me | authenticated | No active UI import | Runtime verified; see detailed JSON schema/source keys and test assertions | test_auth_refresh_and_self_service_aliases; test_users/test_auth; admin E2E; each-route anonymous test | INTENTIONALLY API-ONLY | Authenticated self-service password API/PUT alias. No account-password screen promised in current UI; not an Admin password-reset button. |
| GET /api/users | list_all | admin | listUsers → frontend/src/pages/admin/AdminUsers.tsx | Runtime verified; see detailed JSON schema/source keys and test assertions | test_authorized_real_read_contracts; test_datasets for detail; test_real_report_csv_contract for exports; each-route anonymous test; each-route Analyst denial test | CONNECTED AND VERIFIED | Actual router contracts and browser workflows verified. |
| PATCH /api/users/{username}/role | set_role | admin | updateUserRole → frontend/src/pages/admin/AdminUsers.tsx | Runtime verified; see detailed JSON schema/source keys and test assertions | test_auth_refresh_and_self_service_aliases; test_users/test_auth; admin E2E; each-route anonymous test; each-route Analyst denial test | CONNECTED AND VERIFIED | Actual router contracts and browser workflows verified. |
| POST /api/users | create_new_user | admin | adminCreateUser → frontend/src/pages/admin/AdminUsers.tsx | Runtime verified; see detailed JSON schema/source keys and test assertions | test_auth_refresh_and_self_service_aliases; test_users/test_auth; admin E2E; each-route anonymous test; each-route Analyst denial test | CONNECTED AND VERIFIED | Actual router contracts and browser workflows verified. |
| PATCH /api/users/{username}/status | set_status | admin | updateUserStatus → frontend/src/pages/admin/AdminUsers.tsx | Runtime verified; see detailed JSON schema/source keys and test assertions | test_auth_refresh_and_self_service_aliases; test_users/test_auth; admin E2E; each-route anonymous test; each-route Analyst denial test | CONNECTED AND VERIFIED | Actual router contracts and browser workflows verified. |
| GET /api/users/roles/metadata | list_roles | admin | getRoleMetadata → frontend/src/pages/admin/AdminRoles.tsx | Runtime verified; see detailed JSON schema/source keys and test assertions | test_authorized_real_read_contracts; test_datasets for detail; test_real_report_csv_contract for exports; each-route anonymous test; each-route Analyst denial test | CONNECTED AND VERIFIED | Actual router contracts and browser workflows verified. |
| GET /api/reports/export | export_report | authenticated | downloadReport → frontend/src/pages/Reports.tsx | Runtime verified; see detailed JSON schema/source keys and test assertions | test_authorized_real_read_contracts; test_datasets for detail; test_real_report_csv_contract for exports; each-route anonymous test | CONNECTED AND VERIFIED | Actual router contracts and browser workflows verified. |
| GET /api/admin/system/status | system_status | admin | getSystemStatus → frontend/src/pages/admin/AdminHealth.tsx | Runtime verified; see detailed JSON schema/source keys and test assertions | test_authorized_real_read_contracts; test_datasets for detail; test_real_report_csv_contract for exports; each-route anonymous test; each-route Analyst denial test | CONNECTED AND VERIFIED | Actual router contracts and browser workflows verified. |
| GET /api/admin/health | health_status | admin | getAdminHealth → frontend/src/pages/admin/AdminHealth.tsx | Runtime verified; see detailed JSON schema/source keys and test assertions | test_authorized_real_read_contracts; test_datasets for detail; test_real_report_csv_contract for exports; each-route anonymous test; each-route Analyst denial test | CONNECTED AND VERIFIED | Actual router contracts and browser workflows verified. |
| GET /api/admin/data/etl/status | etl_status | admin | getEtlStatus → frontend/src/pages/admin/AdminData.tsx | Runtime verified; see detailed JSON schema/source keys and test assertions | test_authorized_real_read_contracts; test_datasets for detail; test_real_report_csv_contract for exports; each-route anonymous test; each-route Analyst denial test | CONNECTED AND VERIFIED | Actual router contracts and browser workflows verified. |
| GET /api/admin/warehouse/status | warehouse_status | admin | getWarehouseStatus → frontend/src/pages/admin/AdminWarehouse.tsx | Runtime verified; see detailed JSON schema/source keys and test assertions | test_authorized_real_read_contracts; test_datasets for detail; test_real_report_csv_contract for exports; each-route anonymous test; each-route Analyst denial test | CONNECTED AND VERIFIED | Actual router contracts and browser workflows verified. |
| GET /api/admin/ml/status | ml_admin_status | admin | getMlAdminStatus → frontend/src/pages/admin/AdminMl.tsx | Runtime verified; see detailed JSON schema/source keys and test assertions | test_authorized_real_read_contracts; test_datasets for detail; test_real_report_csv_contract for exports; each-route anonymous test; each-route Analyst denial test | CONNECTED AND VERIFIED | Actual router contracts and browser workflows verified. |
| GET /api/admin/settings | system_settings | admin | getSystemSettings → frontend/src/pages/admin/AdminSettings.tsx | Runtime verified; see detailed JSON schema/source keys and test assertions | test_authorized_real_read_contracts; test_datasets for detail; test_real_report_csv_contract for exports; each-route anonymous test; each-route Analyst denial test | CONNECTED AND VERIFIED | Actual router contracts and browser workflows verified. |
| GET /api/datasets | list_datasets | authenticated | listDatasets → frontend/src/components/layout/AppLayout.tsx | Runtime verified; see detailed JSON schema/source keys and test assertions | test_authorized_real_read_contracts; test_datasets for detail; test_real_report_csv_contract for exports; each-route anonymous test | CONNECTED AND VERIFIED | Actual router contracts and browser workflows verified. |
| POST /api/datasets/upload | upload | authenticated | uploadDataset → frontend/src/pages/Datasets.tsx | Runtime verified; see detailed JSON schema/source keys and test assertions | test_dataset_pipeline_and_independent_aggregation_contract; dataset/schema E2E; each-route anonymous test | CONNECTED AND VERIFIED | Actual router contracts and browser workflows verified. |
| GET /api/datasets/{dataset_id} | detail | authenticated | No active UI import | Runtime verified; see detailed JSON schema/source keys and test assertions | test_authorized_real_read_contracts; test_datasets for detail; test_real_report_csv_contract for exports; each-route anonymous test | INTENTIONALLY API-ONLY | Programmatic detail lookup; list returns the same schema/profile needed by Inspect UI (GET only). |
| POST /api/datasets/{dataset_id}/select | select_dataset | authenticated | selectDataset → frontend/src/components/layout/AppLayout.tsx | Runtime verified; see detailed JSON schema/source keys and test assertions | test_dataset_pipeline_and_independent_aggregation_contract; dataset/schema E2E; each-route anonymous test | CONNECTED AND VERIFIED | Actual router contracts and browser workflows verified. |
| PATCH /api/datasets/{dataset_id}/schema | update_schema | authenticated | updateDatasetSchema → frontend/src/pages/Datasets.tsx | Runtime verified; see detailed JSON schema/source keys and test assertions | test_dataset_pipeline_and_independent_aggregation_contract; dataset/schema E2E; each-route anonymous test | CONNECTED AND VERIFIED | Actual router contracts and browser workflows verified. |
| DELETE /api/datasets/{dataset_id} | delete_dataset | authenticated | deleteDataset → frontend/src/pages/Datasets.tsx | Runtime verified; see detailed JSON schema/source keys and test assertions | test_dataset_pipeline_and_independent_aggregation_contract; dataset/schema E2E; each-route anonymous test | CONNECTED AND VERIFIED | Actual router contracts and browser workflows verified. |
| GET /health | health | public | No active UI import | Runtime verified; see detailed JSON schema/source keys and test assertions | test_public_framework_and_health_get / test_explicit_registered_framework_head | INTENTIONALLY API-ONLY | Public liveness probe used by server orchestration; no UI button needed. |

## Detailed route contracts

### GET /openapi.json

- Module/handler: `FastAPI documentation.openapi`.
- Purpose: Framework documentation/schema route (not a business API)..
- Access: public; dependencies: `none`.
- Parameters: none
- Body: `null`.
- OpenAPI response: `{}`.
- Source top-level return keys: `[]`; source/declared status codes: `[]`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### HEAD /openapi.json

- Module/handler: `FastAPI documentation.openapi`.
- Purpose: Framework documentation/schema route (not a business API)..
- Access: public; dependencies: `none`.
- Parameters: none
- Body: `null`.
- OpenAPI response: `{}`.
- Source top-level return keys: `[]`; source/declared status codes: `[]`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /docs

- Module/handler: `FastAPI documentation.swagger_ui_html`.
- Purpose: Framework documentation/schema route (not a business API)..
- Access: public; dependencies: `none`.
- Parameters: none
- Body: `null`.
- OpenAPI response: `{}`.
- Source top-level return keys: `[]`; source/declared status codes: `[]`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### HEAD /docs

- Module/handler: `FastAPI documentation.swagger_ui_html`.
- Purpose: Framework documentation/schema route (not a business API)..
- Access: public; dependencies: `none`.
- Parameters: none
- Body: `null`.
- OpenAPI response: `{}`.
- Source top-level return keys: `[]`; source/declared status codes: `[]`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /docs/oauth2-redirect

- Module/handler: `FastAPI documentation.swagger_ui_redirect`.
- Purpose: Framework documentation/schema route (not a business API)..
- Access: public; dependencies: `none`.
- Parameters: none
- Body: `null`.
- OpenAPI response: `{}`.
- Source top-level return keys: `[]`; source/declared status codes: `[]`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### HEAD /docs/oauth2-redirect

- Module/handler: `FastAPI documentation.swagger_ui_redirect`.
- Purpose: Framework documentation/schema route (not a business API)..
- Access: public; dependencies: `none`.
- Parameters: none
- Body: `null`.
- OpenAPI response: `{}`.
- Source top-level return keys: `[]`; source/declared status codes: `[]`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /redoc

- Module/handler: `FastAPI documentation.redoc_html`.
- Purpose: Framework documentation/schema route (not a business API)..
- Access: public; dependencies: `none`.
- Parameters: none
- Body: `null`.
- OpenAPI response: `{}`.
- Source top-level return keys: `[]`; source/declared status codes: `[]`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### HEAD /redoc

- Module/handler: `FastAPI documentation.redoc_html`.
- Purpose: Framework documentation/schema route (not a business API)..
- Access: public; dependencies: `none`.
- Parameters: none
- Body: `null`.
- OpenAPI response: `{}`.
- Source top-level return keys: `[]`; source/declared status codes: `[]`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /api/dashboard/kpis

- Module/handler: `app.api.routes.dashboard.kpis`.
- Purpose: Return verified business KPIs computed from the selected dataset.

Values come from real data via the ETL pipeline (see docs/KPIs.md).
Accepts the shared analytics filter set (see docs/ANALYTICS.md)..
- Access: authenticated; dependencies: `OAuth2PasswordBearer, analytics_filters, auth_gate, dataset_context, get_current_user, get_db, get_optional_user, require_bi_user`.
- Parameters: `dataset_id` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Dataset Id"}`; `date_from` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date From"}`; `date_to` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date To"}`; `category` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Category"}`; `customer_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Customer State"}`; `seller_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Seller State"}`; `order_status` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Order Status"}`; `payment_type` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Payment Type"}`; `review_score` (query, optional): `{"anyOf": [{"type": "integer"}, {"type": "null"}], "title": "Review Score"}`; `column_filters` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Column Filters"}`; `x-dataset-id` (header, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "X-Dataset-Id"}`
- Body: `null`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `['filters', 'kpis']`; source/declared status codes: `['200', '401', '403', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /api/dashboard/monthly-revenue

- Module/handler: `app.api.routes.dashboard.monthly_revenue`.
- Purpose: Monthly Revenue.
- Access: authenticated; dependencies: `OAuth2PasswordBearer, analytics_filters, auth_gate, dataset_context, get_current_user, get_db, get_optional_user, require_bi_user`.
- Parameters: `limit` (query, optional): `{"type": "integer", "maximum": 400, "minimum": 1, "default": 24, "title": "Limit"}`; `dataset_id` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Dataset Id"}`; `date_from` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date From"}`; `date_to` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date To"}`; `category` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Category"}`; `customer_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Customer State"}`; `seller_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Seller State"}`; `order_status` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Order Status"}`; `payment_type` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Payment Type"}`; `review_score` (query, optional): `{"anyOf": [{"type": "integer"}, {"type": "null"}], "title": "Review Score"}`; `column_filters` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Column Filters"}`; `x-dataset-id` (header, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "X-Dataset-Id"}`
- Body: `null`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `['series']`; source/declared status codes: `['200', '401', '403', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /api/dashboard/revenue-by-category

- Module/handler: `app.api.routes.dashboard.revenue_by_category`.
- Purpose: Revenue By Category.
- Access: authenticated; dependencies: `OAuth2PasswordBearer, analytics_filters, auth_gate, dataset_context, get_current_user, get_db, get_optional_user, require_bi_user`.
- Parameters: `limit` (query, optional): `{"type": "integer", "maximum": 100, "minimum": 1, "default": 15, "title": "Limit"}`; `dataset_id` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Dataset Id"}`; `date_from` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date From"}`; `date_to` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date To"}`; `category` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Category"}`; `customer_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Customer State"}`; `seller_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Seller State"}`; `order_status` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Order Status"}`; `payment_type` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Payment Type"}`; `review_score` (query, optional): `{"anyOf": [{"type": "integer"}, {"type": "null"}], "title": "Review Score"}`; `column_filters` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Column Filters"}`; `x-dataset-id` (header, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "X-Dataset-Id"}`
- Body: `null`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `['series']`; source/declared status codes: `['200', '401', '403', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /api/dashboard/orders-by-status

- Module/handler: `app.api.routes.dashboard.orders_by_status`.
- Purpose: Orders By Status.
- Access: authenticated; dependencies: `OAuth2PasswordBearer, analytics_filters, auth_gate, dataset_context, get_current_user, get_db, get_optional_user, require_bi_user`.
- Parameters: `dataset_id` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Dataset Id"}`; `date_from` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date From"}`; `date_to` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date To"}`; `category` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Category"}`; `customer_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Customer State"}`; `seller_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Seller State"}`; `order_status` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Order Status"}`; `payment_type` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Payment Type"}`; `review_score` (query, optional): `{"anyOf": [{"type": "integer"}, {"type": "null"}], "title": "Review Score"}`; `column_filters` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Column Filters"}`; `x-dataset-id` (header, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "X-Dataset-Id"}`
- Body: `null`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `['series']`; source/declared status codes: `['200', '401', '403', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /api/ml/status

- Module/handler: `app.api.routes.ml.ml_status`.
- Purpose: Ml Status.
- Access: authenticated; dependencies: `OAuth2PasswordBearer, analytics_filters, auth_gate, dataset_context, get_current_user, get_db, get_optional_user, require_bi_user`.
- Parameters: `dataset_id` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Dataset Id"}`; `date_from` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date From"}`; `date_to` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date To"}`; `category` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Category"}`; `customer_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Customer State"}`; `seller_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Seller State"}`; `order_status` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Order Status"}`; `payment_type` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Payment Type"}`; `review_score` (query, optional): `{"anyOf": [{"type": "integer"}, {"type": "null"}], "title": "Review Score"}`; `column_filters` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Column Filters"}`; `x-dataset-id` (header, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "X-Dataset-Id"}`
- Body: `null`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `['dataset_id', 'features']`; source/declared status codes: `['200', '401', '403', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /api/ml/models/{name}

- Module/handler: `app.api.routes.ml.ml_model_detail`.
- Purpose: Ml Model Detail.
- Access: authenticated; dependencies: `OAuth2PasswordBearer, analytics_filters, auth_gate, dataset_context, get_current_user, get_db, get_optional_user, require_bi_user`.
- Parameters: `name` (path, required): `{"type": "string", "title": "Name"}`; `dataset_id` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Dataset Id"}`; `date_from` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date From"}`; `date_to` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date To"}`; `category` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Category"}`; `customer_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Customer State"}`; `seller_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Seller State"}`; `order_status` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Order Status"}`; `payment_type` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Payment Type"}`; `review_score` (query, optional): `{"anyOf": [{"type": "integer"}, {"type": "null"}], "title": "Review Score"}`; `column_filters` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Column Filters"}`; `x-dataset-id` (header, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "X-Dataset-Id"}`
- Body: `null`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `['compatibility']`; source/declared status codes: `['200', '401', '403', '404', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /api/ml/forecast

- Module/handler: `app.api.routes.ml.ml_forecast`.
- Purpose: Ml Forecast.
- Access: authenticated; dependencies: `OAuth2PasswordBearer, analytics_filters, auth_gate, dataset_context, get_current_user, get_db, get_optional_user, require_bi_user`.
- Parameters: `periods` (query, optional): `{"type": "integer", "default": 30, "title": "Periods"}`; `target` (query, optional): `{"type": "string", "default": "orders", "title": "Target"}`; `dataset_id` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Dataset Id"}`; `date_from` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date From"}`; `date_to` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date To"}`; `category` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Category"}`; `customer_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Customer State"}`; `seller_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Seller State"}`; `order_status` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Order Status"}`; `payment_type` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Payment Type"}`; `review_score` (query, optional): `{"anyOf": [{"type": "integer"}, {"type": "null"}], "title": "Review Score"}`; `column_filters` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Column Filters"}`; `x-dataset-id` (header, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "X-Dataset-Id"}`
- Body: `null`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `[]`; source/declared status codes: `['200', '400', '401', '403', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /api/ml/segments/customers

- Module/handler: `app.api.routes.ml.ml_customer_segments`.
- Purpose: Ml Customer Segments.
- Access: authenticated; dependencies: `OAuth2PasswordBearer, analytics_filters, auth_gate, dataset_context, get_current_user, get_db, get_optional_user, require_bi_user`.
- Parameters: `dataset_id` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Dataset Id"}`; `date_from` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date From"}`; `date_to` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date To"}`; `category` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Category"}`; `customer_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Customer State"}`; `seller_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Seller State"}`; `order_status` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Order Status"}`; `payment_type` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Payment Type"}`; `review_score` (query, optional): `{"anyOf": [{"type": "integer"}, {"type": "null"}], "title": "Review Score"}`; `column_filters` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Column Filters"}`; `x-dataset-id` (header, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "X-Dataset-Id"}`
- Body: `null`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `[]`; source/declared status codes: `['200', '401', '403', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /api/ml/anomalies

- Module/handler: `app.api.routes.ml.ml_anomalies`.
- Purpose: Ml Anomalies.
- Access: authenticated; dependencies: `OAuth2PasswordBearer, analytics_filters, auth_gate, dataset_context, get_current_user, get_db, get_optional_user, require_bi_user`.
- Parameters: `dataset_id` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Dataset Id"}`; `date_from` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date From"}`; `date_to` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date To"}`; `category` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Category"}`; `customer_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Customer State"}`; `seller_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Seller State"}`; `order_status` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Order Status"}`; `payment_type` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Payment Type"}`; `review_score` (query, optional): `{"anyOf": [{"type": "integer"}, {"type": "null"}], "title": "Review Score"}`; `column_filters` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Column Filters"}`; `x-dataset-id` (header, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "X-Dataset-Id"}`
- Body: `null`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `[]`; source/declared status codes: `['200', '401', '403', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### POST /api/ml/predict/sales

- Module/handler: `app.api.routes.ml.ml_predict_sales`.
- Purpose: Ml Predict Sales.
- Access: authenticated; dependencies: `OAuth2PasswordBearer, analytics_filters, auth_gate, dataset_context, get_current_user, get_db, get_optional_user, require_bi_user`.
- Parameters: `dataset_id` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Dataset Id"}`; `date_from` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date From"}`; `date_to` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date To"}`; `category` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Category"}`; `customer_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Customer State"}`; `seller_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Seller State"}`; `order_status` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Order Status"}`; `payment_type` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Payment Type"}`; `review_score` (query, optional): `{"anyOf": [{"type": "integer"}, {"type": "null"}], "title": "Review Score"}`; `column_filters` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Column Filters"}`; `x-dataset-id` (header, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "X-Dataset-Id"}`
- Body: `{"required": true, "content": {"application/json": {"schema": {"$ref": "#/components/schemas/SalesPredictRequest"}}}}`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `[]`; source/declared status codes: `['200', '401', '403', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /api/ml/product-segmentation

- Module/handler: `app.api.routes.ml.ml_product_segmentation`.
- Purpose: Ml Product Segmentation.
- Access: authenticated; dependencies: `OAuth2PasswordBearer, analytics_filters, auth_gate, dataset_context, get_current_user, get_db, get_optional_user, require_bi_user`.
- Parameters: `dataset_id` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Dataset Id"}`; `date_from` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date From"}`; `date_to` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date To"}`; `category` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Category"}`; `customer_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Customer State"}`; `seller_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Seller State"}`; `order_status` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Order Status"}`; `payment_type` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Payment Type"}`; `review_score` (query, optional): `{"anyOf": [{"type": "integer"}, {"type": "null"}], "title": "Review Score"}`; `column_filters` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Column Filters"}`; `x-dataset-id` (header, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "X-Dataset-Id"}`
- Body: `null`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `[]`; source/declared status codes: `['200', '401', '403', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /api/insights/status

- Module/handler: `app.api.routes.insights.insights_status`.
- Purpose: Insights Status.
- Access: authenticated; dependencies: `OAuth2PasswordBearer, auth_gate, dataset_context, get_current_user, get_db, get_optional_user, require_bi_user`.
- Parameters: `dataset_id` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Dataset Id"}`; `x-dataset-id` (header, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "X-Dataset-Id"}`
- Body: `null`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `[]`; source/declared status codes: `['200', '401', '403', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### POST /api/insights/query

- Module/handler: `app.api.routes.insights.insights_query`.
- Purpose: Insights Query.
- Access: authenticated; dependencies: `OAuth2PasswordBearer, analytics_filters, auth_gate, dataset_context, get_current_user, get_db, get_optional_user, require_bi_user`.
- Parameters: `dataset_id` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Dataset Id"}`; `date_from` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date From"}`; `date_to` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date To"}`; `category` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Category"}`; `customer_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Customer State"}`; `seller_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Seller State"}`; `order_status` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Order Status"}`; `payment_type` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Payment Type"}`; `review_score` (query, optional): `{"anyOf": [{"type": "integer"}, {"type": "null"}], "title": "Review Score"}`; `column_filters` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Column Filters"}`; `x-dataset-id` (header, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "X-Dataset-Id"}`
- Body: `{"required": true, "content": {"application/json": {"schema": {"$ref": "#/components/schemas/QueryRequest"}}}}`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `['answer', 'dataset_id', 'provider', 'role', 'sources', 'status']`; source/declared status codes: `['200', '401', '403', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /api/analytics/filters

- Module/handler: `app.api.routes.analytics.filter_options`.
- Purpose: Distinct values for the shared filter bar (states, categories, ...)..
- Access: authenticated; dependencies: `OAuth2PasswordBearer, auth_gate, dataset_context, get_current_user, get_db, get_optional_user, require_bi_user`.
- Parameters: `dataset_id` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Dataset Id"}`; `x-dataset-id` (header, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "X-Dataset-Id"}`
- Body: `null`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `[]`; source/declared status codes: `['200', '401', '403', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /api/analytics/overview

- Module/handler: `app.api.routes.analytics.overview`.
- Purpose: Dashboard payload: KPIs, series and distributions in one request..
- Access: authenticated; dependencies: `OAuth2PasswordBearer, analytics_filters, auth_gate, dataset_context, get_current_user, get_db, get_optional_user, require_bi_user`.
- Parameters: `grain` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Grain"}`; `dataset_id` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Dataset Id"}`; `date_from` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date From"}`; `date_to` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date To"}`; `category` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Category"}`; `customer_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Customer State"}`; `seller_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Seller State"}`; `order_status` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Order Status"}`; `payment_type` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Payment Type"}`; `review_score` (query, optional): `{"anyOf": [{"type": "integer"}, {"type": "null"}], "title": "Review Score"}`; `column_filters` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Column Filters"}`; `x-dataset-id` (header, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "X-Dataset-Id"}`
- Body: `null`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `[]`; source/declared status codes: `['200', '401', '403', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /api/analytics/sales

- Module/handler: `app.api.routes.analytics.sales`.
- Purpose: Sales.
- Access: authenticated; dependencies: `OAuth2PasswordBearer, analytics_filters, auth_gate, dataset_context, get_current_user, get_db, get_optional_user, require_bi_user`.
- Parameters: `grain` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Grain"}`; `dataset_id` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Dataset Id"}`; `date_from` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date From"}`; `date_to` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date To"}`; `category` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Category"}`; `customer_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Customer State"}`; `seller_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Seller State"}`; `order_status` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Order Status"}`; `payment_type` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Payment Type"}`; `review_score` (query, optional): `{"anyOf": [{"type": "integer"}, {"type": "null"}], "title": "Review Score"}`; `column_filters` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Column Filters"}`; `x-dataset-id` (header, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "X-Dataset-Id"}`
- Body: `null`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `[]`; source/declared status codes: `['200', '401', '403', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /api/analytics/orders

- Module/handler: `app.api.routes.analytics.orders`.
- Purpose: Orders.
- Access: authenticated; dependencies: `OAuth2PasswordBearer, analytics_filters, auth_gate, dataset_context, get_current_user, get_db, get_optional_user, require_bi_user`.
- Parameters: `grain` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Grain"}`; `dataset_id` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Dataset Id"}`; `date_from` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date From"}`; `date_to` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date To"}`; `category` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Category"}`; `customer_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Customer State"}`; `seller_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Seller State"}`; `order_status` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Order Status"}`; `payment_type` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Payment Type"}`; `review_score` (query, optional): `{"anyOf": [{"type": "integer"}, {"type": "null"}], "title": "Review Score"}`; `column_filters` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Column Filters"}`; `x-dataset-id` (header, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "X-Dataset-Id"}`
- Body: `null`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `[]`; source/declared status codes: `['200', '401', '403', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /api/analytics/customers

- Module/handler: `app.api.routes.analytics.customers`.
- Purpose: Customers.
- Access: authenticated; dependencies: `OAuth2PasswordBearer, analytics_filters, auth_gate, dataset_context, get_current_user, get_db, get_optional_user, require_bi_user`.
- Parameters: `dataset_id` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Dataset Id"}`; `date_from` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date From"}`; `date_to` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date To"}`; `category` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Category"}`; `customer_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Customer State"}`; `seller_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Seller State"}`; `order_status` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Order Status"}`; `payment_type` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Payment Type"}`; `review_score` (query, optional): `{"anyOf": [{"type": "integer"}, {"type": "null"}], "title": "Review Score"}`; `column_filters` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Column Filters"}`; `x-dataset-id` (header, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "X-Dataset-Id"}`
- Body: `null`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `[]`; source/declared status codes: `['200', '401', '403', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /api/analytics/products

- Module/handler: `app.api.routes.analytics.products`.
- Purpose: Products.
- Access: authenticated; dependencies: `OAuth2PasswordBearer, analytics_filters, auth_gate, dataset_context, get_current_user, get_db, get_optional_user, require_bi_user`.
- Parameters: `dataset_id` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Dataset Id"}`; `date_from` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date From"}`; `date_to` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date To"}`; `category` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Category"}`; `customer_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Customer State"}`; `seller_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Seller State"}`; `order_status` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Order Status"}`; `payment_type` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Payment Type"}`; `review_score` (query, optional): `{"anyOf": [{"type": "integer"}, {"type": "null"}], "title": "Review Score"}`; `column_filters` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Column Filters"}`; `x-dataset-id` (header, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "X-Dataset-Id"}`
- Body: `null`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `[]`; source/declared status codes: `['200', '401', '403', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /api/analytics/sellers

- Module/handler: `app.api.routes.analytics.sellers`.
- Purpose: Sellers.
- Access: authenticated; dependencies: `OAuth2PasswordBearer, analytics_filters, auth_gate, dataset_context, get_current_user, get_db, get_optional_user, require_bi_user`.
- Parameters: `grain` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Grain"}`; `dataset_id` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Dataset Id"}`; `date_from` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date From"}`; `date_to` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date To"}`; `category` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Category"}`; `customer_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Customer State"}`; `seller_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Seller State"}`; `order_status` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Order Status"}`; `payment_type` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Payment Type"}`; `review_score` (query, optional): `{"anyOf": [{"type": "integer"}, {"type": "null"}], "title": "Review Score"}`; `column_filters` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Column Filters"}`; `x-dataset-id` (header, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "X-Dataset-Id"}`
- Body: `null`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `[]`; source/declared status codes: `['200', '401', '403', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /api/analytics/delivery

- Module/handler: `app.api.routes.analytics.delivery`.
- Purpose: Delivery.
- Access: authenticated; dependencies: `OAuth2PasswordBearer, analytics_filters, auth_gate, dataset_context, get_current_user, get_db, get_optional_user, require_bi_user`.
- Parameters: `dataset_id` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Dataset Id"}`; `date_from` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date From"}`; `date_to` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date To"}`; `category` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Category"}`; `customer_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Customer State"}`; `seller_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Seller State"}`; `order_status` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Order Status"}`; `payment_type` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Payment Type"}`; `review_score` (query, optional): `{"anyOf": [{"type": "integer"}, {"type": "null"}], "title": "Review Score"}`; `column_filters` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Column Filters"}`; `x-dataset-id` (header, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "X-Dataset-Id"}`
- Body: `null`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `[]`; source/declared status codes: `['200', '401', '403', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### POST /api/auth/login

- Module/handler: `app.api.routes.auth.login`.
- Purpose: Login.
- Access: public; dependencies: `OAuth2PasswordRequestForm`.
- Parameters: none
- Body: `{"content": {"application/x-www-form-urlencoded": {"schema": {"$ref": "#/components/schemas/Body_login_api_auth_login_post"}}}, "required": true}`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `[]`; source/declared status codes: `['200', '401', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### POST /api/auth/refresh

- Module/handler: `app.api.routes.auth.refresh`.
- Purpose: Refresh.
- Access: public; dependencies: `none`.
- Parameters: none
- Body: `{"content": {"application/json": {"schema": {"$ref": "#/components/schemas/RefreshRequest"}}}, "required": true}`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `['access_token', 'token_type']`; source/declared status codes: `['200', '401', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /api/auth/me

- Module/handler: `app.api.routes.auth.me`.
- Purpose: Me.
- Access: authenticated; dependencies: `OAuth2PasswordBearer, get_current_user, get_optional_user`.
- Parameters: none
- Body: `null`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}}`.
- Source top-level return keys: `['user']`; source/declared status codes: `['200', '401']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### POST /api/auth/register

- Module/handler: `app.api.routes.auth.register`.
- Purpose: Register.
- Access: admin; dependencies: `OAuth2PasswordBearer, checker('admin',), get_current_user, get_optional_user`.
- Parameters: none
- Body: `{"content": {"application/json": {"schema": {"$ref": "#/components/schemas/RegisterRequest"}}}, "required": true}`.
- OpenAPI response: `{"201": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `['user']`; source/declared status codes: `['201', '401', '403', '409', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /api/auth/admin/users

- Module/handler: `app.api.routes.auth.admin_users`.
- Purpose: Admin Users.
- Access: admin; dependencies: `OAuth2PasswordBearer, checker('admin',), get_current_user, get_optional_user`.
- Parameters: none
- Body: `null`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}}`.
- Source top-level return keys: `['users']`; source/declared status codes: `['200', '401', '403']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /api/users/me

- Module/handler: `app.api.routes.users.read_me`.
- Purpose: Read Me.
- Access: authenticated; dependencies: `OAuth2PasswordBearer, auth_gate, get_current_user, get_optional_user`.
- Parameters: none
- Body: `null`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}}`.
- Source top-level return keys: `['user']`; source/declared status codes: `['200', '401']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### PATCH /api/users/me

- Module/handler: `app.api.routes.users.update_me`.
- Purpose: Update Me.
- Access: authenticated; dependencies: `OAuth2PasswordBearer, auth_gate, get_current_user, get_optional_user`.
- Parameters: none
- Body: `{"content": {"application/json": {"schema": {"$ref": "#/components/schemas/PasswordChange"}}}, "required": true}`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `['status']`; source/declared status codes: `['200', '400', '401', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### PUT /api/users/me

- Module/handler: `app.api.routes.users.replace_me`.
- Purpose: Replace Me.
- Access: authenticated; dependencies: `OAuth2PasswordBearer, auth_gate, get_current_user, get_optional_user`.
- Parameters: none
- Body: `{"content": {"application/json": {"schema": {"$ref": "#/components/schemas/PasswordChange"}}}, "required": true}`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `[]`; source/declared status codes: `['200', '401', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /api/users

- Module/handler: `app.api.routes.users.list_all`.
- Purpose: List All.
- Access: admin; dependencies: `OAuth2PasswordBearer, auth_gate, checker('admin',), get_current_user, get_optional_user`.
- Parameters: none
- Body: `null`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}}`.
- Source top-level return keys: `['users']`; source/declared status codes: `['200', '401', '403']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### PATCH /api/users/{username}/role

- Module/handler: `app.api.routes.users.set_role`.
- Purpose: Set Role.
- Access: admin; dependencies: `OAuth2PasswordBearer, auth_gate, checker('admin',), get_current_user, get_optional_user`.
- Parameters: `username` (path, required): `{"type": "string", "title": "Username"}`
- Body: `{"required": true, "content": {"application/json": {"schema": {"$ref": "#/components/schemas/RoleChange"}}}}`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `['user']`; source/declared status codes: `['200', '401', '403', '404', '409', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### POST /api/users

- Module/handler: `app.api.routes.users.create_new_user`.
- Purpose: Create New User.
- Access: admin; dependencies: `OAuth2PasswordBearer, auth_gate, checker('admin',), get_current_user, get_optional_user`.
- Parameters: none
- Body: `{"content": {"application/json": {"schema": {"$ref": "#/components/schemas/CreateUser"}}}, "required": true}`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `['user']`; source/declared status codes: `['200', '401', '403', '409', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### PATCH /api/users/{username}/status

- Module/handler: `app.api.routes.users.set_status`.
- Purpose: Set Status.
- Access: admin; dependencies: `OAuth2PasswordBearer, auth_gate, checker('admin',), get_current_user, get_optional_user`.
- Parameters: `username` (path, required): `{"type": "string", "title": "Username"}`
- Body: `{"required": true, "content": {"application/json": {"schema": {"$ref": "#/components/schemas/UserStatus"}}}}`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `['user']`; source/declared status codes: `['200', '401', '403', '404', '409', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /api/users/roles/metadata

- Module/handler: `app.api.routes.users.list_roles`.
- Purpose: List Roles.
- Access: admin; dependencies: `OAuth2PasswordBearer, auth_gate, checker('admin',), get_current_user, get_optional_user`.
- Parameters: none
- Body: `null`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}}`.
- Source top-level return keys: `['roles']`; source/declared status codes: `['200', '401', '403']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /api/reports/export

- Module/handler: `app.api.routes.reports.export_report`.
- Purpose: Export Report.
- Access: authenticated; dependencies: `OAuth2PasswordBearer, analytics_filters, auth_gate, dataset_context, get_current_user, get_db, get_optional_user, require_bi_user`.
- Parameters: `report` (query, optional): `{"type": "string", "default": "kpis", "title": "Report"}`; `dataset_id` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Dataset Id"}`; `date_from` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date From"}`; `date_to` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Date To"}`; `category` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Category"}`; `customer_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Customer State"}`; `seller_state` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Seller State"}`; `order_status` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Order Status"}`; `payment_type` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Payment Type"}`; `review_score` (query, optional): `{"anyOf": [{"type": "integer"}, {"type": "null"}], "title": "Review Score"}`; `column_filters` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Column Filters"}`; `x-dataset-id` (header, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "X-Dataset-Id"}`
- Body: `null`.
- OpenAPI response: `{"200": {"description": "Filtered CSV export scoped to the authorized selected dataset.", "content": {"text/csv": {"schema": {"type": "string"}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `[]`; source/declared status codes: `['200', '401', '403', '404', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /api/admin/system/status

- Module/handler: `app.api.routes.admin.system_status`.
- Purpose: System Status.
- Access: admin; dependencies: `OAuth2PasswordBearer, auth_gate, checker('admin',), get_current_user, get_optional_user, require_admin`.
- Parameters: none
- Body: `null`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}}`.
- Source top-level return keys: `['app', 'auth_required', 'database', 'env', 'platform', 'python', 'uptime_seconds', 'version']`; source/declared status codes: `['200', '401', '403']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /api/admin/health

- Module/handler: `app.api.routes.admin.health_status`.
- Purpose: Real health checks for the administration UI..
- Access: admin; dependencies: `OAuth2PasswordBearer, auth_gate, checker('admin',), get_current_user, get_optional_user, require_admin`.
- Parameters: none
- Body: `null`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}}`.
- Source top-level return keys: `['authentication', 'backend', 'database', 'ml_models', 'warehouse']`; source/declared status codes: `['200', '401', '403']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /api/admin/data/etl/status

- Module/handler: `app.api.routes.admin.etl_status`.
- Purpose: Etl Status.
- Access: admin; dependencies: `OAuth2PasswordBearer, auth_gate, checker('admin',), get_current_user, get_optional_user, require_admin`.
- Parameters: none
- Body: `null`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}}`.
- Source top-level return keys: `['loaded', 'olist_dir', 'tables']`; source/declared status codes: `['200', '401', '403']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /api/admin/warehouse/status

- Module/handler: `app.api.routes.admin.warehouse_status`.
- Purpose: Warehouse administration: schema presence, row counts and load state..
- Access: admin; dependencies: `OAuth2PasswordBearer, auth_gate, checker('admin',), dataset_context, get_current_user, get_db, get_optional_user, require_admin, require_bi_user`.
- Parameters: `dataset_id` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Dataset Id"}`; `x-dataset-id` (header, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "X-Dataset-Id"}`
- Body: `null`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `['complete', 'dataset_id', 'dialect', 'expected_tables', 'loaded_tables', 'max_date', 'min_date', 'schema_tables', 'source', 'total_rows', 'warehouse_tables']`; source/declared status codes: `['200', '401', '403', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /api/admin/ml/status

- Module/handler: `app.api.routes.admin.ml_admin_status`.
- Purpose: ML administration: deployed artifacts and training state on disk..
- Access: admin; dependencies: `OAuth2PasswordBearer, auth_gate, checker('admin',), get_current_user, get_optional_user, require_admin`.
- Parameters: none
- Body: `null`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}}`.
- Source top-level return keys: `['artifact_count', 'artifacts', 'data_dir_exists', 'features', 'metadata_entries', 'models_dir', 'retraining']`; source/declared status codes: `['200', '401', '403']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /api/admin/settings

- Module/handler: `app.api.routes.admin.system_settings`.
- Purpose: Non-secret application settings. Secrets are never returned..
- Access: admin; dependencies: `OAuth2PasswordBearer, auth_gate, checker('admin',), dataset_context, get_current_user, get_db, get_optional_user, require_admin, require_bi_user`.
- Parameters: `dataset_id` (query, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Dataset Id"}`; `x-dataset-id` (header, optional): `{"anyOf": [{"type": "string"}, {"type": "null"}], "title": "X-Dataset-Id"}`
- Body: `null`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `['access_token_expire_minutes', 'app', 'auth_required', 'dataset', 'env', 'llm', 'refresh_token_expire_minutes', 'reports', 'roles', 'secrets_exposed', 'version']`; source/declared status codes: `['200', '401', '403', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /api/datasets

- Module/handler: `app.api.routes.datasets.list_datasets`.
- Purpose: List Datasets.
- Access: authenticated; dependencies: `OAuth2PasswordBearer, auth_gate, get_current_user, get_db, get_optional_user, require_bi_user`.
- Parameters: none
- Body: `null`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}}`.
- Source top-level return keys: `['active_dataset_id', 'datasets']`; source/declared status codes: `['200', '401', '403']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### POST /api/datasets/upload

- Module/handler: `app.api.routes.datasets.upload`.
- Purpose: Upload.
- Access: authenticated; dependencies: `OAuth2PasswordBearer, auth_gate, get_current_user, get_db, get_optional_user, require_bi_user`.
- Parameters: none
- Body: `{"content": {"multipart/form-data": {"schema": {"$ref": "#/components/schemas/Body_upload_api_datasets_upload_post"}}}, "required": true}`.
- OpenAPI response: `{"201": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `[]`; source/declared status codes: `['201', '401', '403', '413', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /api/datasets/{dataset_id}

- Module/handler: `app.api.routes.datasets.detail`.
- Purpose: Detail.
- Access: authenticated; dependencies: `OAuth2PasswordBearer, auth_gate, get_current_user, get_db, get_optional_user, require_bi_user`.
- Parameters: `dataset_id` (path, required): `{"type": "string", "title": "Dataset Id"}`
- Body: `null`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `[]`; source/declared status codes: `['200', '401', '403', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### POST /api/datasets/{dataset_id}/select

- Module/handler: `app.api.routes.datasets.select_dataset`.
- Purpose: Select Dataset.
- Access: authenticated; dependencies: `OAuth2PasswordBearer, auth_gate, get_current_user, get_db, get_optional_user, require_bi_user`.
- Parameters: `dataset_id` (path, required): `{"type": "string", "title": "Dataset Id"}`
- Body: `null`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `[]`; source/declared status codes: `['200', '401', '403', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### PATCH /api/datasets/{dataset_id}/schema

- Module/handler: `app.api.routes.datasets.update_schema`.
- Purpose: Update Schema.
- Access: authenticated; dependencies: `OAuth2PasswordBearer, auth_gate, get_current_user, get_db, get_optional_user, require_bi_user`.
- Parameters: `dataset_id` (path, required): `{"type": "string", "title": "Dataset Id"}`
- Body: `{"required": true, "content": {"application/json": {"schema": {"$ref": "#/components/schemas/SchemaUpdate"}}}}`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `[]`; source/declared status codes: `['200', '401', '403', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### DELETE /api/datasets/{dataset_id}

- Module/handler: `app.api.routes.datasets.delete_dataset`.
- Purpose: Delete Dataset.
- Access: authenticated; dependencies: `OAuth2PasswordBearer, auth_gate, get_current_user, get_db, get_optional_user, require_bi_user`.
- Parameters: `dataset_id` (path, required): `{"type": "string", "title": "Dataset Id"}`
- Body: `null`.
- OpenAPI response: `{"204": {"description": "Successful Response"}, "422": {"description": "Validation Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}}}}`.
- Source top-level return keys: `[]`; source/declared status codes: `['204', '401', '403', '409', '422']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

### GET /health

- Module/handler: `app.main.health`.
- Purpose: Health.
- Access: public; dependencies: `none`.
- Parameters: none
- Body: `null`.
- OpenAPI response: `{"200": {"description": "Successful Response", "content": {"application/json": {"schema": {}}}}}`.
- Source top-level return keys: `['status']`; source/declared status codes: `['200']`.
- Safe testing: read-only calls or isolated disposable DB for uploads, user/password/status/role mutations and deletion. Model calls use existing trusted active artifacts; candidate never dispatched.

## Frontend operation definitions and consumers

| Client function | Method / route expression | Imported consumers |
|---|---|---|
| listDatasets | GET `/api/datasets` | frontend/src/components/layout/AppLayout.tsx |
| selectDataset | POST `/api/datasets/${id}/select` | frontend/src/components/layout/AppLayout.tsx |
| deleteDataset | DELETE `/api/datasets/${id}` | frontend/src/pages/Datasets.tsx |
| uploadDataset | POST `/api/datasets/upload` | frontend/src/pages/Datasets.tsx |
| updateDatasetSchema | PATCH `/api/datasets/${id}/schema` | frontend/src/pages/Datasets.tsx |
| health | GET `/health` | Unused compatibility wrapper / review required |
| getKpis | GET `/api/dashboard/kpis${qs` | Unused compatibility wrapper / review required |
| getMonthlyRevenue | GET `/api/dashboard/monthly-revenue` | Unused compatibility wrapper / review required |
| getRevenueByCategory | GET `/api/dashboard/revenue-by-category` | Unused compatibility wrapper / review required |
| getOrdersByStatus | GET `/api/dashboard/orders-by-status` | Unused compatibility wrapper / review required |
| getFilterOptions | GET `/api/analytics/filters` | frontend/src/components/FilterBar.tsx |
| getAnalyticsOverview | GET `/api/analytics/overview${qs` | frontend/src/pages/Dashboard.tsx |
| getAnalyticsSales | GET `/api/analytics/sales${qs` | frontend/src/pages/analytics/Sales.tsx |
| getAnalyticsOrders | GET `/api/analytics/orders${qs` | frontend/src/pages/analytics/Orders.tsx |
| getAnalyticsCustomers | GET `/api/analytics/customers${qs` | frontend/src/pages/analytics/Customers.tsx |
| getAnalyticsProducts | GET `/api/analytics/products${qs` | frontend/src/pages/analytics/Products.tsx |
| getAnalyticsSellers | GET `/api/analytics/sellers${qs` | frontend/src/pages/analytics/Sellers.tsx |
| getAnalyticsDelivery | GET `/api/analytics/delivery${qs` | frontend/src/pages/analytics/Delivery.tsx |
| getMlStatus | GET `/api/ml/status?${new` | frontend/src/pages/ml/MlMetrics.tsx |
| getForecast | GET `/api/ml/forecast?${new` | frontend/src/pages/ml/RevenueForecast.tsx |
| getCustomerSegments | GET `/api/ml/segments/customers?${new` | frontend/src/pages/ml/MlAnalysis.tsx |
| getAnomalies | GET `/api/ml/anomalies?${new` | frontend/src/pages/ml/MlAnalysis.tsx |
| predictSales | POST `/api/ml/predict/sales?${new` | frontend/src/pages/ml/MlAnalysis.tsx |
| getProductSegments | GET `/api/ml/product-segmentation${qs` | frontend/src/pages/ml/ProductSegmentation.tsx |
| queryInsights | POST `/api/insights/query?${new` | frontend/src/pages/Insights.tsx |
| downloadReport | GET `/api/reports/export?${qs}` | frontend/src/pages/Reports.tsx |
| getSystemStatus | GET `/api/admin/system/status` | frontend/src/pages/admin/AdminHealth.tsx |
| getAdminHealth | GET `/api/admin/health` | frontend/src/pages/admin/AdminHealth.tsx |
| getEtlStatus | GET `/api/admin/data/etl/status` | frontend/src/pages/admin/AdminData.tsx |
| getMe | GET `/api/users/me` | frontend/src/components/RequireAdmin.tsx |
| listUsers | GET `/api/users` | frontend/src/pages/admin/AdminUsers.tsx |
| createUser | POST `/api/auth/register` | Unused compatibility wrapper / review required |
| updateUserRole | PATCH `/api/users/${encodeURIComponent` | frontend/src/pages/admin/AdminUsers.tsx |
| getRoleMetadata | GET `/api/users/roles/metadata` | frontend/src/pages/admin/AdminRoles.tsx |
| updateUserStatus | PATCH `/api/users/${encodeURIComponent` | frontend/src/pages/admin/AdminUsers.tsx |
| adminCreateUser | POST `/api/users` | frontend/src/pages/admin/AdminUsers.tsx |
| getWarehouseStatus | GET `/api/admin/warehouse/status` | frontend/src/pages/admin/AdminWarehouse.tsx |
| getMlAdminStatus | GET `/api/admin/ml/status` | frontend/src/pages/admin/AdminMl.tsx |
| getSystemSettings | GET `/api/admin/settings` | frontend/src/pages/admin/AdminSettings.tsx |
| login | POST `/api/auth/login` | frontend/src/pages/Login.tsx |
| refreshAccessToken | POST `/api/auth/refresh` | frontend/src/services/api.ts |

## Classification totals

{'INTENTIONALLY API-ONLY': 21, 'CONNECTED AND VERIFIED': 35}

Source route tests and browser evidence are detailed below in the accompanying verification narrative. No coverage percentage is inferred from literal endpoint strings.

## Verification narrative — 2026-10-13

### A. Repository safety

- Target: `<checkout-root>`; branch `integrate/abi-ml-backend` throughout.
- HEAD before/after: `9aaa1200d7e28797ce177a84a920138b4b4b87c9`; local main remains at that same commit.
- Origin before/after: `https://github.com/Trunal2005/Autonomous-Business-Intellignece-Platform.git` (fetch and push).
- Source inspected: `https://github.com/tanmay180426/ABI.git`, commit `f1d2a5a7c1b70ee9092403af5873e5c624f193c9`. Its reference checkout has empty `git --no-optional-locks status --short` output at final verification. Source modified: NO.
- Prior database-path fix, forecast validation, 17 reliability tests, ABI report, ML handoff, original ABI browser tests, isolated candidate and Docker audit harness are retained. This task adds connectivity work alongside them.
- No commit, merge, push, branch switch, reset, clean, source-model replacement, dependency upgrade, secret/environment-file addition, or private dataset addition. Changes remain local for review.
- `git diff --check` passes. Tracked diff and all new source/test/inventory files were inspected; the dirty tree is expected and preserved.

### B. Complete backend inventory

Counting is by explicit registered method/path pair: 48 application/health pairs plus 8 framework pairs (GET and HEAD for four documentation resources), total **56**. CORS OPTIONS is middleware, not a newly registered endpoint.

| Method | Count |
|---|---:|
| GET | 38 |
| HEAD | 4 |
| POST | 8 |
| PATCH | 4 |
| PUT | 1 |
| DELETE | 1 |

| Module | Count |
|---|---:|
| Analytics | 8 |
| Users | 8 |
| ML | 7 |
| Administration | 6 |
| Datasets | 6 |
| Authentication | 5 |
| Dashboard aggregates | 4 |
| Insights | 2 |
| Reports | 1 |
| Health/app.main | 1 |
| FastAPI documentation | 8 |

There are **45 protected pairs**: 32 available to authenticated Admin/Analyst users and 13 Admin-only. The 11 public pairs are login, refresh, health and eight documentation pairs. Dataset ownership adds resource-level restrictions even for Admin; it is not bypassed by role. Every protected pair was tested for anonymous 401; every Admin-only pair for Analyst 403. Those responses are successful security checks. No duplicate exact method/path registration or conflicting client method/path was found. Compatibility aliases deliberately have separate paths and documented payloads.

Database dependencies are the existing SQLAlchemy session, current-user/role lookup and, for BI/reports, authorized dataset context. Dataset APIs persist registry/schema/profile/capabilities/selection and uploaded rows in disposable test storage. Administration reads settings, warehouse tables and active model metadata. ML additionally uses saved target artifacts/scalers and the existing feature builders; insights uses selected-dataset aggregates and the optional configured provider. The preceding route records list the transitive dependency functions and exact OpenAPI schemas, with source status/return keys. Those source keys are not a complete dynamic response schema: delegated service outputs are checked at runtime by the tests, and no typed schema is invented for dict-returning handlers.

### C. Frontend calls, contracts and fixes

**41 exported network operation definitions** were identified across the existing API/auth modules. **35 have real imported consumers** and map to 35 registered method/path pairs. All 41 wrappers resolve to real backend routes, including six unused wrappers. Classification: **35 CONNECTED AND VERIFIED; 21 INTENTIONALLY API-ONLY**. No connected-but-unverified, broken, missing intended capability or orphaned backend route remains in this audit's implemented workflows.

Unused frontend wrappers retained for review: `health`, `getKpis`, `getMonthlyRevenue`, `getRevenueByCategory`, `getOrdersByStatus`, `createUser`. They are not counted as active UI consumers. The four legacy dashboard APIs remain valid programmatic aggregates while Dashboard uses `/api/analytics/overview`. The unused create wrapper calls the valid compatibility `/api/auth/register`; Admin Users uses canonical `POST /api/users`. No removal was authorized or performed.

Genuine fixes:

1. Added consumers for existing order forecast, customer segments, anomalies and item sales prediction APIs, with loading/error/Not Applicable states. Reused the revenue forecast component for orders with correct units/target rather than changing inference. Registered four lazy routes and ML navigation tabs.
2. CSV download now uses the existing shared authenticated transport, including one refresh/retry on 401. Previously it bypassed refresh. It still reads a blob, downloads the real CSV, and revokes the object URL.
3. Request context now includes session generation in addition to dataset generation and user. JSON, error parsing, refresh and blob completion discard obsolete results, including logout followed by restoring the same user. Concurrent GET coalescing uses the same context; completed responses are not cached.
4. Customer/anomaly/sales calls now propagate selected filters. Sales response typing handles both available and `not_applicable` payloads; the screen does not fabricate predictions for unsupported datasets.
5. Analytics navigation preserves chart grain in the URL. ML wrappers now omit only that presentation setting, preserving dataset/date/dimension filters; daily/entity ML inputs must not receive month/quarter grain and fail with 422. A real navigation test verifies January filtering and February 1 forecast start.
6. The report endpoint's OpenAPI 200 response now documents `text/csv` instead of JSON. Runtime output/calculation/auth are unchanged; an OpenAPI contract test verifies it.
7. Added explicit table-header scopes and an accessible name for the existing new-user role select, making new workflows and stable selectors unambiguous.

Incorrect endpoint paths/methods found: **0**. Fixes address missing consumers, query/response/session/content-type contracts rather than invented routes. No alternate client/service layer or unrelated redesign was introduced.

Frontend inventory JSON records each signature, method, route expression, exact implementation, imported consumer/line references and shared TypeScript type definitions. These include JSON bodies, FormData fields, response generic types and union variants. Runtime validation remains essential: analytics endpoints have existing `any` client annotations, and many backend dict responses have no complete OpenAPI response schema. The build alone was not used as contract evidence.

### Network and client behavior

- Default effective API origin: `http://localhost:8000` from `VITE_API_BASE_URL || ...` in both existing clients; backend documented local bind/port is 8000; frontend default origin is `http://localhost:5173`. Prefixes are `/api/...` and standalone `/health`. Vite has no development API proxy. No frontend local environment file overrides the fallback in the inspected tree.
- Backend CORS explicitly allows `http://localhost:5173`, credentials and required methods/headers. Actual preflight allows Authorization/X-Dataset-ID/Content-Type there and denies an unknown origin. No network configuration change was needed for supported local defaults.
- Real E2E used backend/frontend **8013/5183**; the harness sets `VITE_API_BASE_URL` and its narrowly allowed test origin. Missing-artifact proof used **8023/5193**. All four temporary listeners were released afterward. These were verification servers, not a promised persistent localhost deployment.
- External production hosting was not deployed/tested. A different frontend origin requires updating the existing explicit CORS allowlist as well as configuring the existing API base variable; no new environment variable or deployed-origin claim is made.
- Login sends URL-encoded credentials; refresh sends JSON; mutations/model/AI inputs send JSON; upload sends multipart FormData without incorrectly overriding its browser-generated content type. Authenticated shared requests send bearer token and selected `X-Dataset-ID`; query parameters use URLSearchParams. Delete 204 is handled without JSON parsing. Username paths are encoded.
- Server dates/filters follow existing ISO date-only contracts and UTC/source date aggregation; no new timezone conversion or analytics formula was introduced. Presentation grain remains on analytics and is excluded from ML only. Dynamic column filters and scalar filters retain their existing semantics. Unsupported or empty responses display their existing states rather than loading reference Olist data silently.
- Loading/error state belongs to the actual page/hook: analytics/dashboard and ML read effects clear obsolete results; DatasetContext and FilterBar reset on selection; Insights clears answers on dataset/filter change; Reports shows export progress/error; Admin pages show loading/error/refresh or mutation state; Login disables during submit. New ML effects cancel publication through cleanup flags; sales uses operation generation plus request context. Transport guards protect every shared operation. Native fetch timeout/AbortController is not configured in this client; obsolete responses are ignored, not represented as aborted network requests. Optional LLM timeout is configured server-side. No timeout/cancellation claim is inferred from successful requests.
- Route guards revalidate backend user identity; hidden links do not provide RBAC. Local logout clears tokens/user and advances generation; there is no invented logout HTTP route. Admin and Analyst remain the only roles.

### D. Dataset, analytics and reports

The real lifecycle uses upload/register/process/profile/map/capability creation in `POST /api/datasets/upload`, list/schema/profile from `GET /api/datasets`, schema correction via PATCH, persisted selection via POST, scoped downstream reads, and DELETE. Processing is synchronous in the implemented upload; no imaginary processing endpoint was added. Duplicate-column upload returns the implemented 201 registry record with FAILED status/error, and the UI displays that error. Successful uploads return READY. Tests verify ownership denials, independent selected-data aggregates and stale selected IDs returning 404 after deletion rather than silently falling back. The test explicitly restores the original selection afterward.

Dashboard and all six implemented analytics areas (sales, orders, customers, products, sellers, delivery) are covered by real browser requests and displayed results. Filters, January dates and chart grain are asserted; unsupported student delivery is displayed as unavailable. Synthetic commerce fixtures yield independently expected revenue 1,000/5,000, filtered Pune revenue 200, and student mean marks 70; switched dataset answers/filters cannot retain the previous result.

Reports tests cover all four reference exports and universal dataset rows/numeric statistics, content type, filename and dataset identity. The browser reads the downloaded CSV stream and verifies Pune is included while Delhi, another dataset's revenue and student data are absent. A separate real expired/invalid-access-token scenario performs refresh and successfully downloads filtered KPIs.

### E. ML and AI

Existing active model families are exercised with actual inference: order and revenue daily forecasts, customer K-Means/scaler, product segmentation, Isolation Forest and item-revenue prediction. Forecasts are finite, correctly dated and bound to filtered history; the browser renders 30 rows and the existing Linear Regression model label. Status/admin responses still enumerate only the six deployed target artifacts. Training/feature semantics were not changed in this connectivity task.

Unsupported student datasets produce explicit Not Applicable on revenue/order/customer/anomaly/product/sales workflows as applicable to the existing tests. A separate metadata-only model directory causes artifact-unavailable state in a real browser instead of fabricated numbers/crashes. Original artifacts are untouched. API tests cover compatibility, validation, finite output, security and isolation; ML pipeline tests were rerun.

Numerical AI queries use the real insights router and selected/filter-scoped aggregate path, with expected displayed 1,000, 5,000 and 70 values. The independent API fixture checks filtered 200. Unsupported free-form questions return honest `llm_unavailable` with dataset aggregate source, not a claimed live provider response. External Ollama/other provider generation and quality are not verified; optional provider availability is not a requirement for implemented numerical analytics.

The ABI Gradient Boosting candidate remains **inactive**, outside the active model registry/directory and never dispatched by endpoints. SHA-256 remains `e248090a7a66b2dbbdab7c431924af1036bac2b2691e80a1547df60726fa117a`. Its earlier restricted Docker smoke is prior evidence, not newly rerun here. Candidate training/generation pipeline, verified real/synthetic combination/provenance, target/currency generation, exact temporal split, evaluation/baseline and complete reproducibility evidence remain missing. The source Linear Regression script is not treated as that pipeline. User disclosed an approximately eight-year synthetic extension and original BRL values; these are disclosures, not proof of artifact training. Existing handoff/provenance documentation preserves that distinction. No activation, retraining, replacement or new candidate evaluation result is claimed.

### F. Administration and browser matrix

| Browser route / operation | Real dependency | Assertions / evidence |
|---|---|---|
| `/`, `/login`, logout, guard redirects | login/refresh, users/me; local logout | Existing smoke and ABI tests plus frontend auth/guard tests; actual seeded accounts, backend identity and session clearing |
| `/datasets`, shared selector | list/upload/select/schema/delete | READY/FAILED, confirmation, removal, selection/profile, ownership, switching |
| `/dashboard` | analytics overview + filters | Real heading/data; universal independent values and selected context |
| `/analytics/{sales,orders,customers,products,sellers,delivery}` | matching six APIs + filters | All headings and 200 responses; January filter/grain; unsupported capability state |
| `/ml/metrics` | ML status | Compatibility/active catalog and selected context |
| `/ml/revenue-forecast`, `/ml/order-forecast` | forecast target revenue/orders | Existing LR, finite 30 rows, dates, unavailable/Not Applicable; month grain removed from request |
| `/ml/product-segmentation` | product segmentation | Existing ABI inference/browser test and dataset incompatibility coverage |
| `/ml/customer-segments`, `/ml/anomalies` | segments/customers, anomalies | Real segment rows/monetary header and anomaly summary; incompatible state |
| `/ml/sales-prediction` | predict/sales POST | Real form/features, available displayed prediction, selected unsupported dataset yields Not Applicable |
| `/insights` | insights/query | Numerical answers, switch clears prior answer, student metric, optional provider fallback API |
| `/reports` | reports/export | Actual CSV stream/filter identity and invalid-token refresh |
| `/admin/users` | users GET/POST, role/status PATCH | Create disposable account, change role, deactivate with confirmation/reactivate; backend denial/validation tests |
| `/admin/roles` | users/roles/metadata | Real role metadata and admin heading; only Admin/Analyst |
| `/admin/health` | admin/health and system/status | Real health fields, Refresh makes new real request |
| `/admin/data` | admin/data/etl/status | Real loaded/table information; ETL is existing offline command, no invented Run API |
| `/admin/warehouse` | admin/warehouse/status | Actual dialect/table/completeness response and displayed warehouse |
| `/admin/ml` | admin/ml/status | Existing artifact directory/count; candidate excluded |
| `/admin/settings` | admin/settings | Real readonly settings/roles; secrets_exposed false; no unsupported Save endpoint invented |

The E2E sources retain all previous cases and add seven connectivity scenarios; selectors use roles/labels. Original nine plus seven = sixteen tests in the normal run. Browser calls use actual API servers and storage, without mocked endpoint responses. The separately run missing-artifact case repeats one test under a different environment and is reported separately, not as a seventeenth unique normal test. API-only auth aliases, self-service password PATCH/PUT, model metadata detail, insights diagnostics, dataset detail and documentation/health resources are explicitly classified above; none requires a fabricated screen.

### G. Executed verification

The current pre-edit baseline ran **17 backend reliability tests and 42 frontend unit tests**, all passed. Earlier reported full backend 168, ML 8 and E2E 9 are historical results, not reused as new proof.

| Final check | Exact command / environment | Result |
|---|---|---|
| Complete backend | From backend: `python -m pytest tests -q --reference-db sem5.db`; reference opened read-only and copied by test_storage, only warehouse retained | 275 passed, 0 failed/skipped; 401 warnings; 558.66 seconds |
| New real API contracts | `tests/test_api_connectivity.py`, included in final full run | 107 passed; includes 45 anonymous denials and 13 Analyst/Admin denials |
| Existing forecast reliability | `tests/test_abi_reliability.py`, included in final full run | 17 passed |
| Auth/RBAC, ownership, isolation | Existing `test_auth`, `test_users`, `test_rbac`, `test_datasets` plus new contracts, included in full run | Passed; no route-boundary mocks for API contracts |
| ML pipeline | From root: `python -m pytest ml/tests -q` | 8 passed, 0 failed/skipped |
| Frontend unit | From frontend: `npm test` | 47 passed across 9 files, 0 failed/skipped |
| Lint | `npm run lint` | Passed |
| TypeScript | `npx tsc --noEmit -p tsconfig.json` and `npx tsc --noEmit -p tsconfig.contracts.json` | Both passed |
| Production build | `npm run build` | Passed, 874 modules transformed |
| Full real browser E2E | Python313 on PATH; `SEM5_E2E_BACKEND_PORT=8013`, `SEM5_E2E_FRONTEND_PORT=5183`; `npm run e2e -- --workers=1` | 16 passed, 0 failed/skipped |
| Missing artifact real browser | Temporary metadata-only `ML_MODELS_DIR`; `SEM5_E2E_EXPECT_MISSING_ARTIFACT=true`, ports 8023/5193; `npm run e2e -- e2e/abi-integration.spec.ts --workers=1 --grep 'forecast page honestly reflects real artifact availability' --output='../.universal_work/api-missing-model-proof'` | 1 passed, 0 failed/skipped; temporary model directory removed |
| Git whitespace / source safety | `git diff --check`; source `git --no-optional-locks status --short`; candidate SHA-256; four test ports checked | Passed / source clean / hash unchanged / no listeners |

Intermediate failures are disclosed: the first expanded full backend run had 258 passes and 15 failures because the new deletion test persisted a deleted selection into subsequent tests. The API correctly refused silent fallback. A fixture now explicitly restores the prior selection on teardown; focused 128 passed/5 reference-only skipped, then a full 274 passed before the final CSV OpenAPI change. Final full verification after that change is the result above. Initial new browser runs exposed heading/header/select locator issues; actual labels/header scope and stable selectors were corrected, then all 16 passed. Initial lint caught one unused test variable, removed before final passing checks. None of those intermediate runs is represented as final success.

Unit transport mocks target race/refresh conditions, while real API/E2E tests verify resulting data and security. Destructive requests run exclusively against disposable test storage. Full backend uses read-only SQLite backup; E2E uses its existing disposable reference copy. Test harness cleanup and engine disposal release storage/listeners. No broad filesystem/Docker cleanup was run.

### H. Remaining issues and limits

- Remaining broken contracts, missing implemented backend capabilities, unconnected intended UI actions, orphaned backend routes and detected authorization/ownership defects: **none in the audited local implemented workflows**.
- Six unused compatibility frontend wrappers require review before any removal; retained intentionally and not counted as connected features.
- Candidate activation/reproducibility remains blocked by the missing evidence described in E; it is outside active endpoint coverage, not silently marked verified.
- Live external LLM generation and external production deployment/CORS are not executed; honest local fallback and configured local connectivity are verified. This report does not claim provider quality or deployed hosting verification.
- Existing untyped dict/`any` portions and absence of native fetch timeouts remain engineering limitations, not discovered method/path/data failures. Runtime contract/isolation tests provide the stated local evidence. No load/performance audit or universal every-possible-input claim is made.
- No active intended workflow test is skipped or left environment/artifact-blocked in final runs.

### I. Final verdict

**API COVERAGE COMPLETE — ALL INTENDED WORKFLOWS VERIFIED**

This verdict applies to the current implemented local workflows and 56 registered method/path pairs. It does not activate the inactive ABI candidate or claim external provider/deployment verification. Inventory, consumer traces, real API/RBAC/isolation tests and displayed browser results jointly support it.

## Subsequent free-only audit — 2026-10-13

[FREE_API_AUDIT.md](FREE_API_AUDIT.md) records the later local-only provider policy,
fresh regression results, actual installed Ollama model verification and an
external-network denial run. The same 56 registered method/path pairs remain.
Earlier provider verification limits above describe the earlier API task; local
generation is now separately tested with cloud disabled. No external hosted LLM
or production deployment verification is claimed.
