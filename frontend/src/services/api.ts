import { getRefreshToken, getToken, getSessionGeneration, refreshAccessToken, type Role } from './auth'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
let activeDatasetId: string | null = null
let activeCollectionId: string | null = null
let datasetVersion = 0
const pendingGets = new Map<string, Promise<unknown>>()

export function getRequestContext(): string {
  return `${datasetVersion}|${getSessionGeneration()}|${localStorage.getItem('sem5_user')}`
}

export function setDatasetScope(id: string | null) {
  activeDatasetId = id
  activeCollectionId = null
  datasetVersion += 1
}

export function setCollectionScope(id: string | null) {
  activeCollectionId = id
  activeDatasetId = null
  datasetVersion += 1
}

function authHeaders(): Record<string, string> {
  const token = getToken()
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(activeCollectionId ? { 'X-Collection-ID': activeCollectionId } : {}),
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
  created_at?: string | null
  updated_at: string | null
  dataset_id: string; dataset_name: string; status: string; source_type?: string; row_count: number; column_count: number; error: string | null; read_only: boolean
  schema: { columns?: DatasetColumn[] }
  semantics: { fields?: Record<string, string>; currency_code?: string | null; domain?: string; ambiguities?: { role: string; candidates: string[] }[] }
  capabilities: Record<string, { available: boolean; reason: string | null }>
  quality: { missing_values?: number; duplicate_rows?: number; warnings?: string[] }
  provenance?: { source_type?: string; original_filename?: string; relative_path?: string; archive?: string; file_size?: number }
}

export interface UploadLimits {
  max_bytes: number
  max_bytes_mb: number
  max_zip_bytes: number
  max_zip_bytes_mb: number
  max_batch_bytes: number
  max_batch_bytes_mb: number
  max_batch_files: number
  max_extracted_bytes: number
  max_extracted_bytes_mb: number
  max_extracted_files: number
  max_rows: number
  max_columns: number
  max_cells: number
  max_zip_depth: number
  max_compression_ratio: number
  supported_file_types: string[]
  supported_archive_types: string[]
}

export interface CollectionItem {
  collection_id: string
  collection_name: string
  source_mode: 'ZIP_COLLECTION' | 'FOLDER_COLLECTION' | 'INDIVIDUAL_FILE' | 'EXPLICIT_MULTI_FILE_SELECTION'
  source_type: 'zip' | 'folder' | 'single'
  dataset_count: number
  total_rows: number
  dataset_ids: string[]
  datasets: Dataset[]
}

export function getUploadLimits() { return getJson<UploadLimits>('/api/datasets/limits') }
export function getDatasetCollections() { return getJson<{ collections: CollectionItem[] }>('/api/datasets/collections') }
export function listDatasets() { return getJson<{ datasets: Dataset[]; active_dataset_id: string | null; active_source?: { source_mode: CollectionItem['source_mode']; source_id: string | null } }>('/api/datasets') }
export function selectDataset(id: string) { return request<Dataset>(`/api/datasets/${id}/select`, { method: 'POST' }) }
export function selectCollection(id: string) {
  return request<{ collection_id: string; source_mode: CollectionItem['source_mode']; collection_name: string; datasets: Dataset[] }>(`/api/datasets/collections/${encodeURIComponent(id)}/select`, { method: 'POST' })
}
export function deleteDataset(id: string) { return request<void>(`/api/datasets/${id}`, { method: 'DELETE' }) }
export interface BatchUploadResult {
  datasets: Dataset[]
  successful: number
  failed: number
  skipped?: number
  skipped_files?: Array<{ filename?: string; path?: string; reason: string }>
  errors: Array<{ filename: string; path?: string; error: string }>
}

export function uploadDataset(file: File, name: string) {
  const form = new FormData(); form.append('file', file); form.append('name', name)
  return request<Dataset>('/api/datasets/upload', { method: 'POST', body: form })
}

export function uploadBatchDatasets(files: File[], sourceMode: 'FOLDER_COLLECTION' | 'EXPLICIT_MULTI_FILE_SELECTION' = 'EXPLICIT_MULTI_FILE_SELECTION') {
  const form = new FormData()
  files.forEach(f => form.append('files', f))
  form.append('source_mode', sourceMode)
  return request<BatchUploadResult & { collection_id: string | null; source_mode: CollectionItem['source_mode'] }>('/api/datasets/upload-batch', { method: 'POST', body: form })
}

export function uploadZipDataset(file: File) {
  const form = new FormData()
  form.append('file', file)
  return request<BatchUploadResult & { collection_id: string; source_mode: CollectionItem['source_mode'] }>('/api/datasets/upload-zip', { method: 'POST', body: form })
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

export interface ForecastObjective {
  label: string
  target_column: string | null
  description: string
  available: boolean
}

export interface ForecastOptions {
  dataset_id: string
  dataset_name: string
  date_columns: string[]
  target_columns: string[]
  default_date_column?: string
  default_target_column?: string
  objectives?: Record<string, ForecastObjective>
  compatible: boolean
  reason?: string
}

export interface DatasetForecastResult {
  status: string
  compatible: boolean
  reason?: string
  dataset_id: string
  dataset_name: string
  target_column: string
  date_column: string
  grain: string
  periods: number
  historical: Array<{ date: string; actual: number }>
  validation: Array<{ date: string; actual: number; predicted: number }>
  forecast: Array<{ date: string; forecast: number; lower_bound: number; upper_bound: number }>
  metrics: {
    mae: number
    rmse: number
    mape: number
    baseline_mae: number
    baseline_rmse: number
    total_forecast: number
    avg_forecast: number
  }
  model_info: {
    name: string
    features: string[]
    total_observations: number
    train_samples: number
    val_samples: number
    split_date?: string
  }
}

export function getForecastOptions() {
  return getJson<ForecastOptions>('/api/ml/forecast/options')
}

export function generateDatasetForecast(payload: {
  target_column?: string
  date_column?: string
  periods?: number
  grain?: string
}) {
  return postJson<DatasetForecastResult>('/api/ml/forecast/dataset', payload)
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
  dataset_id?: string | null
}

export function queryInsights(question: string, context_limit = 20, params: Record<string, string> = {}) {
  return postJson<InsightsResponse>(`/api/insights/query?${new URLSearchParams(params)}`, { question, context_limit })
}

export interface AutomatedInsight {
  id?: string
  type: string
  title: string
  finding: string
  metric: string
  confidence: 'High' | 'Medium' | 'Low'
  basis?: string
  time_period?: string
  significance?: string
  recommendation?: string
}

export interface AutomatedInsightsResponse {
  dataset_id: string | null
  dataset_name?: string
  insights: AutomatedInsight[]
}

export function getAutomatedInsights(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString()
  return getJson<AutomatedInsightsResponse>(`/api/analytics/automated-insights${qs ? `?${qs}` : ''}`)
}

export function getDatasetInsights(datasetId: string) {
  return getJson<AutomatedInsightsResponse>(`/api/datasets/${encodeURIComponent(datasetId)}/insights`)
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
