import { getRefreshToken, getToken, getSessionGeneration, refreshAccessToken, type Role } from './auth'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
let activeDatasetId: string | null = null
let datasetVersion = 0
const pendingGets = new Map<string, Promise<unknown>>()

export function getRequestContext(): string {
  return `${datasetVersion}|${getSessionGeneration()}|${localStorage.getItem('sem5_user')}`
}

export function setDatasetScope(id: string | null) {
  activeDatasetId = id
  datasetVersion += 1
}

function authHeaders(): Record<string, string> {
  const token = getToken()
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(activeDatasetId ? { 'X-Dataset-ID': activeDatasetId } : {}) }
}

async function request<T>(path: string, init: RequestInit = {}, retry = true, version = datasetVersion): Promise<T> {
  const owner = localStorage.getItem('sem5_user')
  const r = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...(init.headers as Record<string, string>), ...authHeaders() },
  })
  if (version !== datasetVersion || owner !== localStorage.getItem('sem5_user')) throw new Error('Dataset context changed; stale response discarded.')
  if (r.status === 401 && retry && getRefreshToken()) {
    const token = await refreshAccessToken()
    if (token) return request<T>(path, init, false, version)
  }
  if (!r.ok) {
    const error = await r.json().catch(() => null)
    throw new Error(typeof error?.detail === 'string' ? error.detail : `Request failed: ${r.status}`)
  }
  if (r.status === 204) return undefined as T
  const data = await r.json()
  if (version !== datasetVersion) throw new Error('Dataset context changed; stale response discarded.')
  return data as T
}

export interface DatasetColumn {
  name: string; dtype: string; role: string; confidence: number; missing: number; unique: number; constant: boolean; ambiguous_date: boolean
}
export interface Dataset {
  updated_at: string | null
  dataset_id: string; dataset_name: string; status: string; source_type?: string; row_count: number; column_count: number; error: string | null; read_only: boolean
  schema: { columns?: DatasetColumn[] }
  semantics: { fields?: Record<string, string>; currency_code?: string | null; domain?: string; ambiguities?: { role: string; candidates: string[] }[] }
  capabilities: Record<string, { available: boolean; reason: string | null }>
  quality: { missing_values?: number; duplicate_rows?: number; warnings?: string[] }
}
export function listDatasets() { return getJson<{ datasets: Dataset[]; active_dataset_id: string | null }>('/api/datasets') }
export function selectDataset(id: string) { return request<Dataset>(`/api/datasets/${id}/select`, { method: 'POST' }) }
export function deleteDataset(id: string) { return request<void>(`/api/datasets/${id}`, { method: 'DELETE' }) }
export interface BatchUploadResult {
  datasets: Dataset[]
  successful: number
  failed: number
  skipped?: number
  skipped_files?: Array<{ filename?: string; path?: string; reason: string }>
  errors: Array<{ filename: string; path?: string; error: string }>
}

export interface AnalysisSession {
  id: string
  name: string
  owner: string
  mode: 'compare' | 'combine' | 'insights'
  dataset_ids: string[]
  datasets?: Dataset[]
  config?: Record<string, unknown>
  created_at: string | null
  updated_at: string | null
}

export interface CompareResult {
  mode: 'compare'
  dataset_count: number
  summaries: Array<{
    dataset_id: string
    dataset_name: string
    source_type: string
    row_count: number
    column_count: number
    missing_values: number
    missing_percentage: number
    date_range: { min: string | null; max: string | null; has_date: boolean }
    revenue: { available: boolean; field: string | null; total: number | null; average: number | null; currency: string | null }
    orders: { available: boolean; field: string | null; total: number | null }
    numeric_summaries: Record<string, { min: number; max: number; mean: number; median: number }>
    categorical_summaries: Record<string, { cardinality: number; top_values: Record<string, number> }>
    columns: Array<{ name: string; dtype: string; role: string }>
  }>
  comparison_table: Array<{
    dataset_name: string
    dataset_id: string
    rows: number
    columns: number
    date_coverage: string
    total_revenue: string
    total_orders: string
    missing_pct: string
  }>
  kpi_cards: Array<{
    title: string
    values: Record<string, string>
  }>
  disclaimers: string[]
}

export interface CombineCompatibilityResult {
  datasets: Array<{ id: string; name: string; row_count: number; columns: string[] }>
  union: {
    compatible: boolean
    match_score_percent: number
    common_columns: string[]
    left_only_columns: string[]
    right_only_columns: string[]
    type_mismatches: Array<{ column: string; left_type: string; right_type: string }>
    expected_row_count: number
  }
  join: {
    has_candidates: boolean
    candidate_keys: Array<{
      key: string
      left_dtype: string
      right_dtype: string
      left_unique: boolean
      right_unique: boolean
      left_nulls: number
      right_nulls: number
      relationship: string
      risk: string
      warning: string | null
    }>
    supported_join_types: string[]
  }
}

export interface CombinePreviewResult {
  operation: 'union' | 'join'
  preview_rows: Array<Record<string, unknown>>
  columns: string[]
  total_preview_count: number
  estimated_total_rows?: number
  join_key?: string
  join_type?: string
  lineage?: Record<string, string>
}

export interface CrossDatasetInsightsResult {
  mode: 'insights'
  dataset_count: number
  insights_count: number
  insights: Array<{
    title: string
    finding: string
    magnitude: string
    source_datasets: string[]
    fields_used: string[]
    date_range: string
    method: string
    limitations: string
  }>
}

export function listAnalysisSessions() {
  return request<{ sessions: AnalysisSession[] }>('/api/analysis/sessions')
}

export function createAnalysisSession(data: { name: string; dataset_ids: string[]; mode?: string }) {
  return request<AnalysisSession>('/api/analysis/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function getAnalysisSession(id: string) {
  return request<AnalysisSession>(`/api/analysis/sessions/${id}`)
}

export function updateAnalysisSession(id: string, data: Partial<AnalysisSession>) {
  return request<AnalysisSession>(`/api/analysis/sessions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function addDatasetsToSession(sessionId: string, datasetIds: string[]) {
  return request<AnalysisSession>(`/api/analysis/sessions/${sessionId}/datasets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataset_ids: datasetIds }),
  })
}

export function removeDatasetFromSession(sessionId: string, datasetId: string) {
  return request<AnalysisSession>(`/api/analysis/sessions/${sessionId}/datasets/${datasetId}`, {
    method: 'DELETE',
  })
}

export function deleteAnalysisSession(sessionId: string) {
  return request<{ message: string; session_id: string }>(`/api/analysis/sessions/${sessionId}`, {
    method: 'DELETE',
  })
}

export function runDatasetComparison(datasetIds: string[]) {
  return request<CompareResult>('/api/analysis/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataset_ids: datasetIds }),
  })
}

export function checkCombineCompatibility(datasetIds: string[]) {
  return request<CombineCompatibilityResult>('/api/analysis/combine/compatibility', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataset_ids: datasetIds }),
  })
}

export function previewCombine(params: { operation: 'union' | 'join'; dataset_ids: string[]; join_key?: string; join_type?: string; columns?: string[] }) {
  return request<CombinePreviewResult>('/api/analysis/combine/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
}

export function executeCombine(params: { operation: 'union' | 'join'; dataset_ids: string[]; output_name?: string; join_key?: string; join_type?: string; columns?: string[] }) {
  return request<Dataset>('/api/analysis/combine/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
}

export function runCrossDatasetInsights(datasetIds: string[]) {
  return request<CrossDatasetInsightsResult>('/api/analysis/insights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataset_ids: datasetIds }),
  })
}

export function uploadDataset(file: File, name: string) {
  const form = new FormData(); form.append('file', file); form.append('name', name)
  return request<Dataset>('/api/datasets/upload', { method: 'POST', body: form })
}

export function uploadBatchDatasets(files: File[]) {
  const form = new FormData()
  files.forEach(f => form.append('files', f))
  return request<BatchUploadResult>('/api/datasets/upload-batch', { method: 'POST', body: form })
}

export function uploadZipDataset(file: File) {
  const form = new FormData()
  form.append('file', file)
  return request<BatchUploadResult>('/api/datasets/upload-zip', { method: 'POST', body: form })
}

export function updateDatasetSchema(id: string, schema: { fields: Record<string, string | null>; currency_code: string | null; domain: string; date_order?: string }) {
  return request<Dataset>(`/api/datasets/${id}/schema`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(schema) })
}

function getJson<T>(path: string): Promise<T> {
  // Coalesce only concurrent identical reads (including Strict Mode effects).
  // Results are never cached after completion, and identity includes the user
  // and dataset generation so a switch cannot reuse an old response.
  const key = `${localStorage.getItem('sem5_user')}|${datasetVersion}|${path}`
  const pending = pendingGets.get(key)
  if (pending) return pending as Promise<T>
  const result = request<T>(path).finally(() => pendingGets.delete(key))
  pendingGets.set(key, result)
  return result
}

export function health() {
  return getJson<{ status: string }>('/health')
}

export interface Kpis {
  filters: { date_from: string | null; date_to: string | null; order_status: string | null }
  kpis: {
    total_orders: number
    total_revenue: number
    total_freight: number
    avg_order_value: number
    unique_customers: number
    items_sold: number
    products_sold: number
    active_sellers: number
    avg_review_score: number | null
    avg_delivery_days: number | null
  }
}

export function getKpis(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString()
  return getJson<Kpis>(`/api/dashboard/kpis${qs ? `?${qs}` : ''}`)
}

export interface MonthlyPoint {
  period: string
  orders: number
  revenue: number
}

export function getMonthlyRevenue() {
  return getJson<{ series: MonthlyPoint[] }>('/api/dashboard/monthly-revenue')
}

export interface CategoryPoint {
  category: string
  revenue: number
  items: number
}

export function getRevenueByCategory() {
  return getJson<{ series: CategoryPoint[] }>('/api/dashboard/revenue-by-category')
}

export interface StatusPoint {
  status: string
  orders: number
}

export function getOrdersByStatus() {
  return getJson<{ series: StatusPoint[] }>('/api/dashboard/orders-by-status')
}

// ---- Analytics ----

export interface FilterOptions {
  dynamic?: { field: string; label: string; values: string[] }[]
  has_date?: boolean
  categories: string[]
  customer_states: string[]
  seller_states: string[]
  order_statuses: string[]
  payment_types: string[]
  review_scores: number[]
  date_range: { min: string; max: string }
}

export function getFilterOptions() {
  return getJson<FilterOptions>('/api/analytics/filters')
}

export function getAnalyticsOverview(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString()
  return getJson<any>(`/api/analytics/overview${qs ? `?${qs}` : ''}`)
}

export function getAnalyticsSales(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString()
  return getJson<any>(`/api/analytics/sales${qs ? `?${qs}` : ''}`)
}

export function getAnalyticsOrders(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString()
  return getJson<any>(`/api/analytics/orders${qs ? `?${qs}` : ''}`)
}

export function getAnalyticsCustomers(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString()
  return getJson<any>(`/api/analytics/customers${qs ? `?${qs}` : ''}`)
}

export function getAnalyticsProducts(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString()
  return getJson<any>(`/api/analytics/products${qs ? `?${qs}` : ''}`)
}

export function getAnalyticsSellers(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString()
  return getJson<any>(`/api/analytics/sellers${qs ? `?${qs}` : ''}`)
}

export function getAnalyticsDelivery(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString()
  return getJson<any>(`/api/analytics/delivery${qs ? `?${qs}` : ''}`)
}

// ---- ML ----

function postJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export interface MlModel {
  compatibility?: { compatible: boolean; reasons: string[]; training_domain: string }
  metrics_scope?: string
  name: string
  algorithm: string | null
  trained_at: string | null
  metrics: Record<string, unknown> | null
  artifact_available: boolean
}

export interface MlFeature {
  name: string
  status: string
  models: MlModel[]
}

export function getMlStatus(params: Record<string, string> = {}) {
  return getJson<{ features: MlFeature[] }>(`/api/ml/status?${new URLSearchParams(params)}`)
}

export interface ForecastPoint {
  date: string
  orders?: number
  revenue?: number
}

export function getForecast(periods = 30, target: 'orders' | 'revenue' = 'orders', params: Record<string, string> = {}) {
  return getJson<{ history_tail: ForecastPoint[]; forecast: ForecastPoint[]; status?: string; reason?: string }>(
    `/api/ml/forecast?${new URLSearchParams({ ...params, periods: String(periods), target })}`,
  )
}

export interface MlCompatibility {
  compatible: boolean
  reasons: string[]
  contract: Record<string, unknown>
  training_domain: string | null
  dataset_id: string
  artifact_available: boolean
}

export interface MlNotApplicable {
  status: 'not_applicable'
  reason: string
  compatibility: MlCompatibility
  dataset_id: string
}

export type CustomerSegmentsResponse = MlNotApplicable | {
  status: 'available'
  segments: Array<{ segment: number; customers: number; monetary: number }>
  compatibility: MlCompatibility
  dataset_id: string
}

export function getCustomerSegments() {
  return getJson<CustomerSegmentsResponse>('/api/ml/segments/customers')
}

export type AnomaliesResponse = MlNotApplicable | {
  status: 'available'
  n_days: number
  n_anomalies: number
  anomalies: Array<{ date: string; orders: number; revenue: number; anomaly: number; score: number; customers?: number; rows?: number }>
  compatibility: MlCompatibility
  dataset_id: string
}

export function getAnomalies() {
  return getJson<AnomaliesResponse>('/api/ml/anomalies')
}

export interface SalesPredictInput {
  purchase_month: number
  purchase_weekday: number
  purchase_hour: number
  n_items: number
  customer_state: string
  product_category_name: string
}

export function predictSales(input: SalesPredictInput) {
  return postJson<{ predicted_item_revenue: number; currency: string }>(
    '/api/ml/predict/sales',
    input,
  )
}

export interface ProductSegment {
  segment: number
  products: number
  revenue: number
  quantity: number
  avg_price: number
  revenue_share: number
  quantity_share: number
}

export interface TopProduct {
  product: string
  category: string
  segment: number
  revenue: number
  quantity: number
  avg_price: number
}

export interface ProductSegmentationResponse {
  status?: string
  reason?: string
  segments: ProductSegment[]
  top_products: TopProduct[]
  k: number
}

export function getProductSegments(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString()
  return getJson<ProductSegmentationResponse>(
    `/api/ml/product-segmentation${qs ? `?${qs}` : ''}`
  )
}

// ---- AI Insights ----

export interface InsightsResponse {
  answer: string
  sources: string[]
  status: string
  provider: string | null
  role: string
}

export function queryInsights(question: string, context_limit = 20, params: Record<string, string> = {}) {
  return postJson<InsightsResponse>(`/api/insights/query?${new URLSearchParams(params)}`, { question, context_limit })
}

// ---- Reports ----

export async function downloadReport(report: string, params: Record<string, string> = {}) {
  const version = datasetVersion
  const qs = new URLSearchParams({ report, ...params }).toString()
  const r = await fetch(`${API_BASE}/api/reports/export?${qs}`, { headers: authHeaders() })
  if (!r.ok) {
    const error = await r.json().catch(() => null)
    throw new Error(typeof error?.detail === 'string' ? error.detail : `Export failed: ${r.status}`)
  }
  const blob = await r.blob()
  if (version !== datasetVersion) throw new Error('Dataset changed; export discarded.')
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${report}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Keep the blob alive until the browser has started consuming the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ---- Admin ----

export interface SystemStatus {
  app: string
  version: string
  env: string
  auth_required: boolean
  database: string
  python: string
  platform: string
  uptime_seconds: number
}

export function getSystemStatus() {
  return getJson<SystemStatus>('/api/admin/system/status')
}

export interface AdminHealthStatus {
  backend: string
  database: string
  warehouse: string
  ml_models: string
  authentication: string
}

export function getAdminHealth() {
  return getJson<AdminHealthStatus>('/api/admin/health')
}

export interface EtlStatus {
  loaded: boolean
  tables: Record<string, number | null>
  olist_dir: string
}

export function getEtlStatus() {
  return getJson<EtlStatus>('/api/admin/data/etl/status')
}

// ---- Users ----

export interface PublicUser {
  id: number
  username: string
  role: Role
  is_active: boolean
  created_at: string | null
}

export function getMe() {
  return getJson<{ user: PublicUser }>('/api/users/me')
}

export function listUsers() {
  return getJson<{ users: PublicUser[] }>('/api/users')
}

export function createUser(username: string, password: string, role: Role) {
  return postJson<{ user: PublicUser }>('/api/auth/register', { username, password, role })
}

export function updateUserRole(username: string, role: Role) {
  return request<{ user: PublicUser }>(`/api/users/${encodeURIComponent(username)}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  })
}

export interface RoleMetadata {
  name: string
  description: string
  permissions: Record<string, boolean>
}

export function getRoleMetadata() {
  return getJson<{ roles: RoleMetadata[] }>('/api/users/roles/metadata')
}

export function updateUserStatus(username: string, is_active: boolean) {
  return request<{ user: PublicUser }>(`/api/users/${encodeURIComponent(username)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_active }),
  })
}

export function adminCreateUser(username: string, password: string, role: Role) {
  return postJson<{ user: PublicUser }>('/api/users', { username, password, role })
}

// ---- Administration ----

export interface WarehouseStatus {
  dialect: string
  schema_tables: string[]
  warehouse_tables: Record<string, number | null>
  expected_tables: number
  loaded_tables: number
  total_rows: number
  complete: boolean
  source: string
  min_date?: string | null
  max_date?: string | null
}

export function getWarehouseStatus() {
  return getJson<WarehouseStatus>('/api/admin/warehouse/status')
}

export interface ArtifactInfo {
  file: string
  size_bytes: number
  modified_at: string
}

export interface MlAdminStatus {
  models_dir: string
  artifacts: ArtifactInfo[]
  artifact_count: number
  metadata_entries: number
  features: MlFeature[]
  data_dir_exists: boolean
  retraining: string
}

export function getMlAdminStatus() {
  return getJson<MlAdminStatus>('/api/admin/ml/status')
}

export interface SystemSettings {
  app: string
  version: string
  env: string
  auth_required: boolean
  access_token_expire_minutes: number
  refresh_token_expire_minutes: number
  roles: Role[]
  llm: { enabled: boolean; provider: string; timeout_seconds: number }
  dataset: string
  reports: string[]
  secrets_exposed: boolean
}

export function getSystemSettings() {
  return getJson<SystemSettings>('/api/admin/settings')
}
