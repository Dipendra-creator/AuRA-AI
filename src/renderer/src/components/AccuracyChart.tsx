/**
 * AccuracyChart — SVG-based line chart with gradient fill.
 * Shows AI extraction accuracy trend over time with Day/Week/Month tabs.
 */

import { useState, type ReactElement } from 'react'
import type { ChartDataPoint } from '../../../shared/types/document.types'

interface AccuracyChartProps {
  readonly data: readonly ChartDataPoint[]
}

type TimeRange = 'Day' | 'Week' | 'Month'

/** Get the SVG path for the gradient fill area */
function getAreaPath(
  data: readonly ChartDataPoint[],
  width: number,
  height: number,
  padding: number
): string {
  if (data.length === 0) return ''

  const minVal = Math.min(...data.map((d) => d.value)) - 2
  const maxVal = Math.max(...data.map((d) => d.value)) + 2
  const range = maxVal - minVal || 1

  const points = data.map((point, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2)
    const y = height - padding - ((point.value - minVal) / range) * (height - padding * 2)
    return { x, y }
  })

  let d = `M ${points[0].x},${height - padding}`
  d += ` L ${points[0].x},${points[0].y}`

  for (let i = 1; i < points.length; i++) {
    const prevX = points[i - 1].x
    const cpx1 = prevX + (points[i].x - prevX) * 0.4
    const cpy1 = points[i - 1].y
    const cpx2 = points[i].x - (points[i].x - prevX) * 0.4
    const cpy2 = points[i].y
    d += ` C ${cpx1},${cpy1} ${cpx2},${cpy2} ${points[i].x},${points[i].y}`
  }

  d += ` L ${points[points.length - 1].x},${height - padding}`
  d += ' Z'

  return d
}

/** Get the SVG path for the smooth line */
function getLinePath(
  data: readonly ChartDataPoint[],
  width: number,
  height: number,
  padding: number
): string {
  if (data.length === 0) return ''

  const minVal = Math.min(...data.map((d) => d.value)) - 2
  const maxVal = Math.max(...data.map((d) => d.value)) + 2
  const range = maxVal - minVal || 1

  const points = data.map((point, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2)
    const y = height - padding - ((point.value - minVal) / range) * (height - padding * 2)
    return { x, y }
  })

  let d = `M ${points[0].x},${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    const prevX = points[i - 1].x
    const cpx1 = prevX + (points[i].x - prevX) * 0.4
    const cpy1 = points[i - 1].y
    const cpx2 = points[i].x - (points[i].x - prevX) * 0.4
    const cpy2 = points[i].y
    d += ` C ${cpx1},${cpy1} ${cpx2},${cpy2} ${points[i].x},${points[i].y}`
  }

  return d
}

export function AccuracyChart({ data }: AccuracyChartProps): ReactElement {
  const [activeTab, setActiveTab] = useState<TimeRange>('Day')

  const chartWidth = 560
  const chartHeight = 280
  const padding = 40

  const tabs: readonly TimeRange[] = ['Day', 'Week', 'Month']

  // Generate X-axis labels from data
  const labelInterval = Math.max(1, Math.floor(data.length / 5))
  const xLabels = data.filter((_, i) => i % labelInterval === 0 || i === data.length - 1)

  return (
    <div className="accuracy-chart glass-panel animate-fade-in">
      <div className="accuracy-chart-header">
        <div>
          <h4 className="accuracy-chart-title">AI Extraction Accuracy</h4>
          <p className="accuracy-chart-subtitle">Performance metrics over the last 30 days</p>
        </div>
        <div className="accuracy-chart-tabs">
          {tabs.map((tab) => (
            <button
              key={tab}
              className={`accuracy-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="accuracy-chart-body">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          preserveAspectRatio="none"
          className="accuracy-chart-svg"
        >
          <defs>
            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map((ratio) => (
            <line
              key={ratio}
              x1={padding}
              y1={padding + ratio * (chartHeight - padding * 2)}
              x2={chartWidth - padding}
              y2={padding + ratio * (chartHeight - padding * 2)}
              stroke="rgba(255,255,255,0.05)"
              strokeDasharray="4,4"
            />
          ))}

          {/* Gradient area fill */}
          <path
            d={getAreaPath(data, chartWidth, chartHeight, padding)}
            fill="url(#chartGradient)"
            className="chart-area"
          />

          {/* Main line */}
          <path
            d={getLinePath(data, chartWidth, chartHeight, padding)}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="chart-line"
          />

          {/* Data points */}
          {data.map((point, i) => {
            const x = padding + (i / (data.length - 1)) * (chartWidth - padding * 2)
            const minVal = Math.min(...data.map((d) => d.value)) - 2
            const maxVal = Math.max(...data.map((d) => d.value)) + 2
            const range = maxVal - minVal || 1
            const y =
              chartHeight - padding - ((point.value - minVal) / range) * (chartHeight - padding * 2)
            return (
              <circle
                key={`pt-${i}`}
                cx={x}
                cy={y}
                r="3"
                fill="var(--color-bg-dark)"
                stroke="var(--color-primary)"
                strokeWidth="2"
                className="chart-point"
              />
            )
          })}
        </svg>

        {/* X-axis labels */}
        <div className="accuracy-chart-labels">
          {xLabels.map((point) => (
            <span key={point.date} className="chart-label">
              {point.date}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
