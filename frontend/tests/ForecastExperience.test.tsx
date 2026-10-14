import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { DatasetContext } from '@/hooks/useDataset'
import { ForecastExperience } from '@/pages/ml/RevenueForecast'
import { getForecast, getForecastEvaluation } from '@/services/api'
vi.mock('@/services/api', async original => ({ ...await original<typeof import('@/services/api')>(), getForecast: vi.fn(), getForecastEvaluation: vi.fn() }))
vi.mock('@/components/BusinessEvidence', () => ({ default: () => null }))
vi.mock('@/components/ForecastChart', () => ({ default: ({ points, mode }: { points: unknown[]; mode?: string }) => <div data-testid={mode === 'backtest' ? 'backtest-chart' : 'chart'}>{JSON.stringify(points)}</div> }))
const filters = { date_to:'2025-01-30' }
vi.mock('@/hooks/useFilters', () => ({ useFilters: () => ({ filters }) }))
const dataset = { dataset_id:'a', dataset_name:'Fixture A', updated_at:'1', semantics:{currency_code:null} } as never
const response = (n: number) => ({ status:'available', history_tail:[{date:'2025-01-30',orders:11}], forecast:Array.from({length:n},(_,i)=>({date:new Date(Date.UTC(2025,0,31+i)).toISOString().slice(0,10),orders:20+i})) })
const evaluation = {status:'available' as const,target:'orders' as const,model:'LinearRegression',model_version:'0.3.0',data_scope:'Unified Olist extended dataset holdout',target_definition:'daily order count',training_period:['2016-10-04','2017-12-23'] as [string,string],validation_period:['2017-12-24','2018-05-21'] as [string,string],evaluation_period:['2018-05-22','2018-05-23'] as [string,string],forecast_horizon_days:1,n_evaluated:2,metrics:{mae:2,rmse:2,r2:0.5,mape:12,wape:10},baseline_metrics:{mae:3},candidate_metrics:{LinearRegression:{mae:2,rmse:2,r2:0.5,mape:12,wape:10}},validation_metrics:{LinearRegression:{mae:2}},validation_windows:[],data_sha256:'hash',points:[{date:'2018-05-22',actual:10,predicted:8,residual:2},{date:'2018-05-23',actual:12,predicted:11,residual:1}]}
const wrapper = (id='a') => <MemoryRouter><DatasetContext.Provider value={{active:{...dataset,dataset_id:id},datasets:[],busy:false,reload:async()=>{},select:async()=>{}}}><ForecastExperience target="orders" /></DatasetContext.Provider></MemoryRouter>
beforeEach(() => { vi.mocked(getForecast).mockImplementation(async n => response(n!)); vi.mocked(getForecastEvaluation).mockResolvedValue(evaluation) })
afterEach(() => {cleanup();vi.clearAllMocks()})
it('requests actual horizons, displays real evaluation data, and uses current filters for future inference', async () => {
  render(wrapper())
  await waitFor(() => expect(screen.getByTestId('chart')).toBeVisible())
  await waitFor(() => expect(screen.getByTestId('backtest-chart')).toBeVisible())
  expect(getForecast).toHaveBeenCalledWith(30,'orders',filters)
  expect(getForecastEvaluation).toHaveBeenCalledWith('orders')
  expect(screen.getByText(/unified Olist holdout/)).toBeVisible()
  expect(screen.getAllByText('12.0000%')).toHaveLength(2)
  expect(screen.getByText('mape')).toBeVisible()
  expect(screen.getByText('MAPE')).toBeVisible()
  fireEvent.change(screen.getByLabelText('Forecast horizon'), {target:{value:'7'}})
  await waitFor(() => expect(getForecast).toHaveBeenLastCalledWith(7,'orders',filters))
  await waitFor(() => expect(screen.getByText('Forecast total (7d)')).toBeVisible())
})
it('clears the prior dataset while pending and rejects late responses', async () => {
  const view=render(wrapper())
  await waitFor(() => expect(screen.getByTestId('chart')).toBeVisible())
  let resolve!: (value: ReturnType<typeof response>) => void
  vi.mocked(getForecast).mockReturnValueOnce(new Promise(done => {resolve=done}))
  view.rerender(wrapper('b'))
  expect(screen.queryByTestId('chart')).not.toBeInTheDocument()
  view.rerender(wrapper('c'))
  await waitFor(() => expect(screen.getByTestId('chart')).toBeVisible())
  resolve({ ...response(30), history_tail:[{date:'2025-01-30',orders:999999}] })
  await waitFor(() => expect(screen.getByTestId('chart')).not.toHaveTextContent('999999'))
})
it('does not draw invented data for not-applicable or inference errors', async () => {
  vi.mocked(getForecast).mockResolvedValueOnce({status:'not_applicable',reason:'Consecutive history missing',history_tail:[],forecast:[]})
  const view=render(wrapper())
  await waitFor(() => expect(screen.getByText('Consecutive history missing')).toBeVisible())
  expect(screen.queryByTestId('chart')).not.toBeInTheDocument()
  vi.mocked(getForecast).mockRejectedValueOnce(new Error('Artifact unavailable'))
  view.rerender(wrapper('b'))
  await waitFor(() => expect(screen.getByText('Artifact unavailable')).toBeVisible())
  expect(screen.queryByTestId('chart')).not.toBeInTheDocument()
})

it('shows an explicit evaluation error instead of plotting fabricated holdout data', async () => {
  vi.mocked(getForecastEvaluation).mockRejectedValueOnce(new Error('Evaluation report unavailable'))
  render(wrapper())
  await waitFor(() => expect(screen.getByText('Evaluation report unavailable')).toBeVisible())
  expect(screen.queryByTestId('backtest-chart')).not.toBeInTheDocument()
})
