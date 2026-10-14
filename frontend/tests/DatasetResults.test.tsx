import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DatasetResults from '@/components/DatasetResults'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
describe('semantic analytics content', () => {
  it('uses full selected revenue for category shares and full status totals, with unavailable profit',()=>{
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
    render(<DatasetResults dashboard monetaryFields={['Item revenue']} data={{status:'available',grain:'orders',kpis:{total_revenue:200,total_orders:4},metric_cards:[{label:'Item revenue',value:200},{label:'Distinct orders',value:4}],distributions:[{field:'order status',series:[{label:'delivered',rows:3},{label:'canceled',rows:1}]}],entities:[{label:'Top category',rows:1,amount:50}]}} />)
    expect(screen.getByLabelText('Order status shares')).toHaveTextContent('delivered · 3 orders · 75.00%')
    expect(screen.getByLabelText('Order status shares')).toHaveTextContent('canceled · 1 orders · 25.00%')
    expect(screen.getByRole('row',{name:/Top category/})).toHaveTextContent('25.00%')
    expect(screen.getByText('Total Profit').parentElement).toHaveTextContent('Unavailable')
    expect(screen.getByText('Profit Margin').parentElement).toHaveTextContent('Unavailable')
  })
  it('renders observed student measures with neutral units', () => {
    render(<DatasetResults data={{ status: 'available', dataset_name: 'Students', metric_cards: [{ label: 'Average marks', value: 70 }] }} />)
    expect(screen.getByText('Average marks')).toBeVisible()
    expect(screen.getByText('70')).toBeVisible()
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/customers/i)).not.toBeInTheDocument()
  })
  it('explains unavailable capabilities without displaying fake cards', () => {
    render(<DatasetResults data={{ status: 'not_applicable', reason: 'No delivery date field was confirmed.', metric_cards: [] }} />)
    expect(screen.getByRole('status')).toHaveTextContent('Not available for this dataset.')
    expect(screen.getByText('No delivery date field was confirmed.')).toBeVisible()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })
  it('distinguishes zero matching rows from a missing measure', () => {
    render(<DatasetResults data={{ status: 'available', metric_cards: [{ label: 'Rows', value: 0 }, { label: 'Total value', value: null }] }} />)
    expect(screen.getByText('0')).toBeVisible()
    expect(screen.getByText('No observed values')).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('No rows match')
  })
  it('removes old dataset values when content switches', () => {
    const { rerender } = render(<DatasetResults data={{ status: 'available', dataset_name: 'A', metric_cards: [{ label: 'Total revenue', value: 1000 }] }} />)
    rerender(<DatasetResults data={{ status: 'available', dataset_name: 'B', metric_cards: [{ label: 'Total revenue', value: 5000 }] }} />)
    expect(screen.queryByText('1,000')).not.toBeInTheDocument()
    expect(screen.getByText('5,000')).toBeVisible()
  })
  it('uses mapped monetary units and semantic availability, not label guessing', () => {
    render(<DatasetResults dashboard revenueAvailable monetaryFields={['sales']} data={{status:'available',currency_code:'USD',metric_cards:[{label:'Rows',value:2},{label:'Total sales',value:1000}]}} />)
    expect(screen.getByText('$1,000.00')).toBeVisible()
    expect(screen.queryByText(/Revenue unavailable/)).not.toBeInTheDocument()
  })
})
