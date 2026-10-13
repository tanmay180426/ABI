import { useEffect, useRef, useState, useMemo } from 'react'
import {
  getRequestContext,
  queryInsights,
  getAutomatedInsights,
  listDatasets,
  type InsightsResponse,
  type AutomatedInsight,
  type Dataset,
} from '@/services/api'
import { useFilters } from '@/hooks/useFilters'
import FilterBar from '@/components/FilterBar'

function getConfidenceBadge(confidence: 'High' | 'Medium' | 'Low') {
  if (confidence === 'High') {
    return 'bg-emerald-950/70 text-emerald-400 border-emerald-800/80'
  }
  if (confidence === 'Medium') {
    return 'bg-blue-950/70 text-blue-400 border-blue-800/80'
  }
  return 'bg-amber-950/70 text-amber-400 border-amber-800/80'
}

function getTypeIcon(type: string) {
  switch (type.toLowerCase()) {
    case 'trend':
      return '📈'
    case 'concentration':
      return '📊'
    case 'correlation':
      return '🔗'
    case 'outlier':
      return '⚠️'
    case 'quality':
      return '🛡️'
    default:
      return '💡'
  }
}

export default function Insights() {
  const { filters } = useFilters()
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState<InsightsResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Active Dataset schema & info
  const [activeDataset, setActiveDataset] = useState<Dataset | null>(null)

  // Automated Insights State
  const [autoInsights, setAutoInsights] = useState<AutomatedInsight[]>([])
  const [autoDatasetName, setAutoDatasetName] = useState<string | null>(null)
  const [loadingAuto, setLoadingAuto] = useState<boolean>(true)

  const filterKey = JSON.stringify(filters)
  const context = getRequestContext()
  const generation = useRef(0)
  const current = useRef({ question, filterKey })
  current.current = { question, filterKey }

  // Load Active Dataset metadata and automated findings
  useEffect(() => {
    generation.current += 1
    setResult(null)
    setError(null)
    setBusy(false)

    listDatasets()
      .then((res) => {
        const found = res.datasets.find((d) => d.dataset_id === res.active_dataset_id)
        setActiveDataset(found || res.datasets[0] || null)
      })
      .catch(() => setActiveDataset(null))

    setLoadingAuto(true)
    getAutomatedInsights(filters)
      .then((res) => {
        setAutoInsights(res.insights || [])
        setAutoDatasetName(res.dataset_name || null)
      })
      .catch(() => {
        setAutoInsights([])
      })
      .finally(() => {
        setLoadingAuto(false)
      })

    return () => {
      generation.current += 1
    }
  }, [filterKey, context])

  // Dynamically compute suggested questions from actual schema fields
  const dynamicQuestions = useMemo(() => {
    if (!activeDataset) {
      return [
        'What is the total revenue and average order value?',
        'How many unique customers and orders are there?',
        'What are the top categories by performance?',
        'What is the on-time delivery rate?',
      ]
    }

    const cols = activeDataset.schema?.columns || []
    const numCols = cols.filter(
      (c) =>
        c.dtype === 'numeric' &&
        !c.name.toLowerCase().startsWith('predicted_') &&
        !c.name.toLowerCase().endsWith('_id') &&
        c.name.toLowerCase() !== 'id'
    )
    const textCols = cols.filter(
      (c) =>
        c.dtype === 'text' &&
        !c.name.toLowerCase().endsWith('_id') &&
        c.name.toLowerCase() !== 'id'
    )
    const dateCols = cols.filter((c) => c.dtype === 'date' || c.role === 'date')
    const semantics = activeDataset.semantics?.fields || {}

    const questions: string[] = []

    // 1. Revenue or sales
    if (semantics.revenue) {
      questions.push(`What is the total ${semantics.revenue} and average order value?`)
    } else if (numCols.some((c) => /revenue|sales|price|amount/i.test(c.name))) {
      const field = numCols.find((c) => /revenue|sales|price|amount/i.test(c.name))!.name
      questions.push(`What is the total ${field} and average ${field}?`)
    }

    // 2. Orders or customers
    if (semantics.order && semantics.customer) {
      questions.push('How many unique customers and orders are there?')
    } else if (semantics.order) {
      questions.push('What is the total order volume?')
    } else if (numCols.length > 0) {
      questions.push(`What is the average and maximum ${numCols[0].name}?`)
    }

    // 3. Category or segment distribution
    if (semantics.category && (semantics.revenue || numCols.length > 0)) {
      const valCol = semantics.revenue || numCols[0]?.name
      questions.push(`What is the total ${valCol} by ${semantics.category}?`)
    } else if (textCols.length > 0) {
      questions.push(`What is the count by ${textCols[0].name}?`)
    }

    // 4. Temporal / Date questions
    if (dateCols.length > 0) {
      questions.push('How has activity changed over time?')
    }

    // 5. Review score or quality rating
    if (semantics.rating) {
      questions.push(`What is the average ${semantics.rating}?`)
    } else if (numCols.length > 1) {
      questions.push(`What is the total and average ${numCols[1].name}?`)
    }

    return questions.slice(0, 5)
  }, [activeDataset])

  // Sync default question if empty
  useEffect(() => {
    if (!question && dynamicQuestions.length > 0) {
      setQuestion(dynamicQuestions[0])
    }
  }, [dynamicQuestions, question])

  const ask = async (q: string) => {
    const request = ++generation.current
    const scope = getRequestContext()
    const selectedFilters = filterKey
    current.current.question = q
    const isCurrent = () =>
      request === generation.current &&
      scope === getRequestContext() &&
      selectedFilters === current.current.filterKey &&
      q === current.current.question
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const r = await queryInsights(q, 20, filters)
      if (isCurrent()) setResult(r)
    } catch (err) {
      if (isCurrent()) setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      if (isCurrent()) setBusy(false)
    }
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">Autonomous Business Insights</h1>
          {activeDataset && (
            <span className="text-xs bg-blue-950/70 border border-blue-800 text-blue-400 px-2 py-0.5 rounded font-mono">
              Dataset: {activeDataset.dataset_name}
            </span>
          )}
        </div>
        <p className="text-sm text-neutral-400 mt-1">
          Evidence-based findings calculated directly from actual dataset records and bounded statistical engines.
        </p>
      </div>

      <FilterBar />

      {/* Automated Evidence-Based Findings Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
          <div>
            <h2 className="text-lg font-medium text-neutral-200">
              Evidence-Based Findings
              {autoDatasetName && <span className="text-blue-400 text-sm ml-2">({autoDatasetName})</span>}
            </h2>
            <p className="text-xs text-neutral-500">
              Deterministic patterns detected across trends, concentrations, correlations, and anomalies.
            </p>
          </div>
          {loadingAuto && <span className="text-xs text-neutral-500 animate-pulse">Computing insights…</span>}
        </div>

        {autoInsights.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-4">
            {autoInsights.map((ins, idx) => (
              <div
                key={ins.id || idx}
                className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-4 flex flex-col justify-between space-y-3 hover:border-neutral-700 transition"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base" role="img" aria-label={ins.type}>
                        {getTypeIcon(ins.type)}
                      </span>
                      <h3 className="text-sm font-semibold text-neutral-200 leading-tight">{ins.title}</h3>
                    </div>
                    <span
                      className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded border shrink-0 ${getConfidenceBadge(
                        ins.confidence
                      )}`}
                    >
                      {ins.confidence} Conf.
                    </span>
                  </div>
                  <p className="text-xs text-neutral-300 leading-relaxed">{ins.finding}</p>
                </div>

                <div className="pt-2 border-t border-neutral-800/80 text-[11px] space-y-1 text-neutral-400">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Observed Metric:</span>
                    <span className="font-mono text-neutral-200">{ins.metric}</span>
                  </div>
                  {ins.time_period && (
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Evaluation Scope:</span>
                      <span className="text-neutral-300">{ins.time_period}</span>
                    </div>
                  )}
                  {ins.significance && (
                    <div className="mt-1 text-neutral-400 italic">
                      💡 {ins.significance}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : !loadingAuto ? (
          <div className="text-xs text-neutral-500 italic p-4 bg-neutral-900/30 border border-neutral-800 rounded">
            No automated findings meet significance thresholds for the current filter scope.
          </div>
        ) : null}
      </section>

      {/* Interactive Analytical Question Engine */}
      <section className="space-y-4">
        <div className="border-b border-neutral-800 pb-2">
          <h2 className="text-lg font-medium text-neutral-200">Interactive Query Engine</h2>
          <p className="text-xs text-neutral-500">
            Ask targeted questions. Queries execute against bounded analytics functions without hallucinating KPIs.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            ask(question)
          }}
          className="space-y-3"
        >
          <textarea
            aria-label="Question"
            value={question}
            onChange={(e) => {
              generation.current += 1
              setResult(null)
              setError(null)
              setBusy(false)
              setQuestion(e.target.value)
            }}
            rows={3}
            className="w-full bg-neutral-900/60 border border-neutral-800 rounded-lg p-3 text-sm text-neutral-200 focus:outline-none focus:border-blue-500"
            placeholder="Ask a question about the active dataset's metrics, categories, or trends…"
          />
          <div className="flex flex-wrap gap-2">
            {dynamicQuestions.map((ex) => (
              <button
                type="button"
                key={ex}
                onClick={() => {
                  setQuestion(ex)
                  ask(ex)
                }}
                className="text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded px-2.5 py-1 transition text-left"
              >
                {ex}
              </button>
            ))}
          </div>
          <button
            type="submit"
            disabled={busy || !question.trim()}
            className="bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 rounded px-4 py-2 text-sm font-medium transition"
          >
            {busy ? 'Asking…' : 'Ask'}
          </button>
        </form>

        {error && <div className="text-red-400 text-sm bg-red-950/40 border border-red-900 rounded p-3">{error}</div>}

        {result && (
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-5 space-y-3">
            <div className="flex items-center gap-3 text-xs">
              <span className="uppercase text-neutral-400 font-mono">status: {result.status}</span>
              {result.provider && <span className="text-neutral-500">provider: {result.provider}</span>}
              <span className="text-neutral-500">role: {result.role}</span>
              {result.dataset_id && <span className="text-neutral-500 font-mono text-[11px]">id: {result.dataset_id}</span>}
            </div>
            <pre className="whitespace-pre-wrap text-sm text-neutral-200 font-sans leading-relaxed">{result.answer}</pre>
            {result.sources.length > 0 && (
              <div className="text-xs text-neutral-500 border-t border-neutral-800 pt-2">
                Grounding Sources: {result.sources.join(', ')}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
