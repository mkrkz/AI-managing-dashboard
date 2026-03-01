export interface AgentConfig {
  model: string
  temperature: number
  agentPrompt: string
  flowiseBaseUrl: string
  flowiseChatflowId: string
  /**
   * Prefer to keep this undefined and use VITE_FLOWISE_API_KEY instead,
   * so the secret lives in your environment, not localStorage.
   */
  flowiseApiKey?: string
}

