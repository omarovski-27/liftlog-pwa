import { Dumbbell, History, Rows3 } from 'lucide-react'

export type AppTab = 'train' | 'history' | 'program'

interface BottomNavProps {
  activeTab: AppTab
  onChange: (tab: AppTab) => void
}

const items: Array<{
  id: AppTab
  label: string
  icon: typeof Dumbbell
}> = [
  { id: 'train', label: 'Train', icon: Dumbbell },
  { id: 'history', label: 'History', icon: History },
  { id: 'program', label: 'Program', icon: Rows3 },
]

export function BottomNav({ activeTab, onChange }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <button
            aria-current={activeTab === item.id ? 'page' : undefined}
            className="nav-item"
            key={item.id}
            onClick={() => onChange(item.id)}
            type="button"
          >
            <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
            <span>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
