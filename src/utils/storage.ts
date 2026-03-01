import type { AgentConfig } from '../types/agent'

const AGENT_CONFIG_KEY = 'ai-agent-dashboard-config'

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function loadAgentConfig(): AgentConfig | null {
  if (!isBrowser()) return null

  try {
    const raw = window.localStorage.getItem(AGENT_CONFIG_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AgentConfig
  } catch (error) {
    console.error('Failed to load saved agent configuration', error)
    return null
  }
}

export function saveAgentConfig(config: AgentConfig): void {
  if (!isBrowser()) return

  try {
    window.localStorage.setItem(AGENT_CONFIG_KEY, JSON.stringify(config))
  } catch (error) {
    console.error('Failed to save agent configuration', error)
  }
}

