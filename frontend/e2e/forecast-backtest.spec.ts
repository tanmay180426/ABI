import { expect, test } from '@playwright/test'

const api = `http://localhost:${process.env.SEM5_E2E_BACKEND_PORT || '8000'}`

test('renders real Olist holdout graphs and production forecasts for both targets', async ({ page }, info) => {
  test.setTimeout(120_000)
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  const failedRequests: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('requestfailed', request => failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`))
  await page.goto('/login')
  await page.getByLabel('Username').fill('analyst')
  await page.getByLabel('Password').fill('analyst123')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/dashboard/)

  const files: Record<string, string> = {
    orders: 'order_id,customer_id,order_status,order_purchase_timestamp,order_delivered_customer_date,order_estimated_delivery_date\n',
    items: 'order_id,order_item_id,product_id,seller_id,price\n',
    customers: 'customer_id,customer_unique_id,customer_state\n',
    products: 'product_id,product_category_name,product_weight_g\np1,books,100\n',
    sellers: 'seller_id,seller_state\ns1,SP\n',
  }
  for (let i = 0; i < 45; i++) {
    const day = new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10)
    files.orders += `o${i},c${i},delivered,${day},${day},${day}\n`
    files.items += `o${i},1,p1,s1,${80 + i}\n`
    files.customers += `c${i},person${i},SP\n`
  }
  const dataset = await page.evaluate(async ({ files, api }) => {
    const form = new FormData()
    form.append('name', 'Forecast regression fixture (synthetic test data)')
    for (const [name, contents] of Object.entries(files)) {
      form.append('files', new Blob([contents], { type: 'text/csv' }), `${name}.csv`)
      form.append('paths', `${name}.csv`)
    }
    const response = await fetch(`${api}/api/datasets/bundles/upload`, {
      method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('sem5_token')}` }, body: form,
    })
    if (response.status !== 201) throw new Error(`Test bundle upload failed: ${response.status}`)
    return response.json()
  }, { files, api })
  const token = await page.evaluate(() => localStorage.getItem('sem5_token'))
  const headers = { Authorization: `Bearer ${token}`, 'X-Dataset-ID': dataset.dataset_id }
  expect((await page.request.patch(`${api}/api/datasets/${dataset.dataset_id}/schema`, {
    headers, data: { fields: {}, currency_code: 'BRL', domain: 'commerce' },
  })).status()).toBe(200)
  await page.reload()
  await page.getByLabel('Active Dataset', { exact: true }).selectOption(dataset.dataset_id)
  await page.waitForLoadState('networkidle')
  await page.goto('/ml/metrics')

  for (const target of ['orders', 'revenue'] as const) {
    const evaluationResponse = page.waitForResponse(response =>
      response.request().method() === 'GET' && response.url().includes('/api/ml/forecast/evaluation') && response.url().includes(`target=${target}`))
    const forecastResponse = page.waitForResponse(response =>
      response.request().method() === 'GET' && response.url().includes('/api/ml/forecast?') && response.url().includes(`target=${target}`))
    if (target === 'revenue') await page.getByLabel('Forecast target').selectOption('revenue')
    const evaluation = await (await evaluationResponse).json()
    const forecast = await (await forecastResponse).json()
    expect(evaluation.status).toBe('available')
    expect(evaluation.data_scope).toContain('Unified Olist extended dataset')
    expect(evaluation.points.length).toBe(evaluation.n_evaluated)
    expect(evaluation.points[0].date).toBe(evaluation.evaluation_period[0])
    expect(evaluation.points.at(-1).date).toBe(evaluation.evaluation_period[1])
    expect(evaluation.points.every((point: { actual: number; predicted: number; residual: number }, i: number, points: Array<{ date: string; actual: number; predicted: number; residual: number }>) =>
      Number.isFinite(point.actual) && Number.isFinite(point.predicted) && Number.isFinite(point.residual) &&
      Math.abs(point.actual - point.predicted - point.residual) < 1e-7 * Math.max(1, Math.abs(point.actual)) &&
      (i === 0 || Date.parse(`${point.date}T00:00:00Z`) - Date.parse(`${points[i - 1].date}T00:00:00Z`) === 86_400_000))).toBe(true)
    expect(forecast.status).toBe('available')
    expect(forecast.model).toBe(evaluation.model)
    expect(forecast.forecast.length).toBe(30)
    expect(forecast.forecast.every((point: { date: string; [key: string]: unknown }, i: number) =>
      Number.isFinite(point[target]) && Date.parse(`${point.date}T00:00:00Z`) -
      Date.parse(`${i === 0 ? forecast.history_tail.at(-1).date : forecast.forecast[i - 1].date}T00:00:00Z`) === 86_400_000)).toBe(true)
    await expect(page.getByTestId('backtest-chart')).toHaveAttribute('data-evaluation-points', String(evaluation.n_evaluated))
    await expect(page.getByTestId('backtest-chart').locator('.recharts-line-curve')).toHaveCount(2)
    await expect(page.getByRole('heading', { name: 'Residuals over time · actual − predicted' })).toBeVisible()
    await expect(page.getByText('Holdout candidate comparison · MAE selection occurred on validation only')).toBeVisible()
    await expect(page.getByTestId('forecast-chart')).toHaveAttribute('data-forecast-points', '30')
    expect(await page.getByTestId('forecast-chart').locator('.recharts-line-curve')).toHaveCount(2)
    if (target === 'revenue') await expect(page.getByText(/BRL item-price revenue/).first()).toBeVisible()
    await page.screenshot({ path: info.outputPath(`${target}-forecast-backtest.png`), fullPage: true })
  }
  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
  expect(failedRequests).toEqual([])
})
