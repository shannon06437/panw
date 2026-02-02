'use client'

import React, { useState } from 'react'

interface PieChartData {
  category: string
  amount: number
  percentage: number
}

interface PieChartProps {
  data: PieChartData[]
  size?: number
}

export function PieChart({ data, size = 300 }: PieChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  if (data.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
        No data available
      </div>
    )
  }

  const radius = size / 2 - 10
  const centerX = size / 2
  const centerY = size / 2

  // Generate colors
  const colors = [
    '#10b981', // green
    '#3b82f6', // blue
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // purple
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#84cc16', // lime
    '#f97316', // orange
    '#6366f1', // indigo
  ]

  let currentAngle = -Math.PI / 2 // Start at top
  const segments: Array<{
    path: string
    category: string
    amount: number
    percentage: number
    color: string
    index: number
  }> = []

  data.forEach((item, index) => {
    const angle = (item.percentage / 100) * 2 * Math.PI
    const endAngle = currentAngle + angle

    // Handle full circle (100%) case
    if (Math.abs(angle - 2 * Math.PI) < 0.001) {
      // Draw a complete circle
      const path = `
        M ${centerX} ${centerY}
        m -${radius} 0
        a ${radius} ${radius} 0 1 1 ${radius * 2} 0
        a ${radius} ${radius} 0 1 1 -${radius * 2} 0
      `
      segments.push({
        path,
        category: item.category,
        amount: item.amount,
        percentage: item.percentage,
        color: colors[index % colors.length],
        index,
      })
    } else {
      // Normal arc segment
      const x1 = centerX + radius * Math.cos(currentAngle)
      const y1 = centerY + radius * Math.sin(currentAngle)
      const x2 = centerX + radius * Math.cos(endAngle)
      const y2 = centerY + radius * Math.sin(endAngle)

      const largeArcFlag = angle > Math.PI ? 1 : 0

      const path = `
        M ${centerX} ${centerY}
        L ${x1} ${y1}
        A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}
        Z
      `

      segments.push({
        path,
        category: item.category,
        amount: item.amount,
        percentage: item.percentage,
        color: colors[index % colors.length],
        index,
      })
    }

    currentAngle = endAngle
  })

  const hoveredSegment = hoveredIndex !== null ? segments[hoveredIndex] : null

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width={size} height={size} style={{ cursor: 'pointer' }}>
        {segments.map((segment) => (
          <path
            key={segment.index}
            d={segment.path}
            fill={segment.color}
            opacity={hoveredIndex === null || hoveredIndex === segment.index ? 1 : 0.5}
            stroke="white"
            strokeWidth="2"
            onMouseEnter={() => setHoveredIndex(segment.index)}
            onMouseLeave={() => setHoveredIndex(null)}
            style={{
              transition: 'opacity 0.2s',
              transform: hoveredIndex === segment.index ? 'scale(1.05)' : 'scale(1)',
              transformOrigin: `${centerX}px ${centerY}px`,
            }}
          />
        ))}
      </svg>

      {/* Legend */}
      <div style={{ marginTop: '1.5rem', width: '100%' }}>
        {segments.map((segment) => (
          <div
            key={segment.index}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.5rem',
              marginBottom: '0.25rem',
              borderRadius: 'var(--radius-sm)',
              background: hoveredIndex === segment.index ? 'var(--bg-secondary)' : 'transparent',
              transition: 'background 0.2s',
            }}
            onMouseEnter={() => setHoveredIndex(segment.index)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '4px',
                  background: segment.color,
                }}
              />
              <span style={{ fontWeight: hoveredIndex === segment.index ? 600 : 400 }}>
                {segment.category}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                {segment.percentage.toFixed(1)}%
              </span>
              <span style={{ fontWeight: 600, minWidth: '80px', textAlign: 'right' }}>
                ${segment.amount.toFixed(2)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Tooltip */}
      {hoveredSegment && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'var(--bg-primary)',
            padding: '1rem',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-lg)',
            border: '1px solid var(--border)',
            pointerEvents: 'none',
            zIndex: 10,
            textAlign: 'center',
            minWidth: '150px',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
            {hoveredSegment.category}
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
            {hoveredSegment.percentage.toFixed(1)}% of total
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: hoveredSegment.color }}>
            ${hoveredSegment.amount.toFixed(2)}
          </div>
        </div>
      )}
    </div>
  )
}
