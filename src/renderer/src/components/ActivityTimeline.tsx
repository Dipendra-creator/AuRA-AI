/**
 * ActivityTimeline — vertical timeline showing recent system events.
 * Displays events with color-coded icons, titles, timestamps, and sources.
 */

import { type ReactElement, type ReactNode } from 'react'
import type { ActivityEvent } from '../../../shared/types/document.types'
import { Check, RefreshCw, Plus, AlertTriangle } from './Icons'

interface ActivityTimelineProps {
    readonly events: readonly ActivityEvent[]
}

/** Maps event types to CSS color classes */
function getEventColorClass(type: ActivityEvent['type']): string {
    switch (type) {
        case 'processed':
            return 'event-emerald'
        case 'system':
            return 'event-purple'
        case 'created':
            return 'event-cyan'
        case 'review':
            return 'event-amber'
        default:
            return 'event-cyan'
    }
}

/** Maps icon types to Lucide icon elements */
function getEventIcon(icon: ActivityEvent['icon']): ReactNode {
    switch (icon) {
        case 'check':
            return <Check size={14} />
        case 'refresh':
            return <RefreshCw size={14} />
        case 'plus':
            return <Plus size={14} />
        case 'warning':
            return <AlertTriangle size={14} />
        default:
            return <Check size={14} />
    }
}

export function ActivityTimeline({ events }: ActivityTimelineProps): ReactElement {
    return (
        <div className="activity-timeline glass-panel animate-fade-in">
            <h4 className="activity-timeline-title">Activity Timeline</h4>
            <div className="activity-timeline-list">
                {events.map((event, index) => (
                    <div
                        key={event.id}
                        className="timeline-event"
                        style={{ animationDelay: `${index * 80}ms` }}
                    >
                        <div className={`timeline-event-icon ${getEventColorClass(event.type)}`}>
                            <span>{getEventIcon(event.icon)}</span>
                        </div>
                        <div className="timeline-event-content">
                            <p className="timeline-event-title">{event.title}</p>
                            <p className="timeline-event-meta">
                                {event.timestamp} • {event.source}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
