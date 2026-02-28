/**
 * StatCard — glassmorphism stat card with neon glow.
 * Displays a metric with icon, value, label, and change percentage.
 */

import { type ReactElement } from 'react'

interface StatCardProps {
    readonly icon: string
    readonly label: string
    readonly value: string
    readonly change: number
    readonly glowColor: 'cyan' | 'purple' | 'emerald'
    readonly iconColor: 'cyan' | 'purple' | 'emerald'
    readonly isStatic?: boolean
}

export function StatCard({
    icon,
    label,
    value,
    change,
    glowColor,
    iconColor,
    isStatic = false
}: StatCardProps): ReactElement {
    const isNegative = change < 0
    const changeDisplay = isStatic ? 'Static' : `${isNegative ? '' : '+'}${change}%`

    return (
        <div className={`stat-card glass-panel neon-glow-${glowColor} animate-scale-in`}>
            <div className="stat-card-header">
                <div className={`stat-card-icon ${iconColor}`}>
                    <span>{icon}</span>
                </div>
                <span className={`stat-card-change ${isNegative ? 'negative' : ''} ${isStatic ? 'static' : ''}`}>
                    {!isStatic && <span className="icon">{isNegative ? '↓' : '↗'}</span>}
                    {changeDisplay}
                </span>
            </div>
            <p className="stat-card-label">{label}</p>
            <h3 className="stat-card-value">{value}</h3>
        </div>
    )
}
