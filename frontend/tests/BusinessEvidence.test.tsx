import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import BusinessEvidence from '@/components/BusinessEvidence'
import { DatasetContext } from '@/hooks/useDataset'
import { getBusinessEvidence, type BusinessEvidenceResponse } from '@/services/api'
vi.mock('@/services/api', async original => ({ ...await original<typeof import('@/services/api')>(), getBusinessEvidence:vi.fn() }))
const data: BusinessEvidenceResponse = {status:'available',source:'SQL selected data',cards:[],series:[],rankings:[],recommendations:[],limitations:['No causal explanation is established.']}
const active={dataset_id:'a',dataset_name:'Fixture',updated_at:'1',semantics:{}} as never
const view=()=>render(<MemoryRouter><DatasetContext.Provider value={{active,datasets:[],busy:false,reload:async()=>{},select:async()=>{}}}><BusinessEvidence domain="revenue" /></DatasetContext.Provider></MemoryRouter>)
afterEach(()=>{cleanup();vi.clearAllMocks()})
it('shows a truthful no-action state rather than filling empty recommendation cards',async()=>{
  vi.mocked(getBusinessEvidence).mockResolvedValue(data)
  view()
  await waitFor(()=>expect(screen.getByText('No actionable signal meets the evidence rules for this selection.')).toBeVisible())
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
  expect(screen.getByText('No causal explanation is established.')).toBeVisible()
})
it('renders measured evidence, window, action and limitation separately',async()=>{
  vi.mocked(getBusinessEvidence).mockResolvedValue({...data,recommendations:[{id:'decline',title:'Review decline',priority:'high',observation:'Revenue decreased 50%.',suggested_action:'Compare categories.',measurement_window:'January 1–14 versus January 15–28',metric_source:'Item revenue',limitations:'Cause unknown; no guaranteed gain.',evidence:{previous:1400,recent:700}}]})
  view()
  await waitFor(()=>expect(screen.getByRole('article')).toHaveTextContent('Review decline'))
  expect(screen.getByRole('article')).toHaveTextContent('Revenue decreased 50%.')
  expect(screen.getByRole('article')).toHaveTextContent('January 1–14 versus January 15–28')
  expect(screen.getByRole('article')).toHaveTextContent('Cause unknown; no guaranteed gain.')
  expect(screen.queryByText(/No actionable/)).not.toBeInTheDocument()
})
