import type { AgentConfig } from '../types/agent'

type OverrideConfig = Record<string, unknown>

interface FlowiseCallOptions {
  config: AgentConfig
  question: string
  chatId?: string
  overrideConfig?: OverrideConfig
}

interface FlowiseCallResult {
  text: string
  raw: unknown
  chatId?: string
}

function getEnvString(name: string): string | undefined {
  const value = import.meta.env[name as keyof ImportMetaEnv]
  if (typeof value === 'string' && value.length > 0) {
    return value
  }
  return undefined
}

function getFlowiseBaseUrl(config?: AgentConfig): string {
  if (config?.flowiseBaseUrl) {
    return config.flowiseBaseUrl
  }
  const value = import.meta.env.VITE_FLOWISE_BASE_URL
  if (!value) {
    throw new Error('VITE_FLOWISE_BASE_URL is not defined')
  }
  return value
}

function getFlowiseChatflowId(config?: AgentConfig): string {
  if (config?.flowiseChatflowId) {
    return config.flowiseChatflowId
  }
  const value = import.meta.env.VITE_FLOWISE_CHATFLOW_ID
  if (!value) {
    throw new Error('VITE_FLOWISE_CHATFLOW_ID is not defined')
  }
  return value
}

function getFlowiseApiKey(config?: AgentConfig): string | undefined {
  if (config?.flowiseApiKey) {
    return config.flowiseApiKey
  }
  return import.meta.env.VITE_FLOWISE_API_KEY
}

export function buildOverrideConfig(input: {
  model?: string
  temperature?: number
  systemMessage?: string
}): OverrideConfig {
  const override: OverrideConfig = {}

  if (input.model) {
    override.modelName = input.model
  }

  if (typeof input.temperature === 'number') {
    override.temperature = input.temperature
  }

  if (input.systemMessage) {
    override.systemMessage = input.systemMessage
  }

  return override
}

async function callFlowise(options: {
  question: string
  chatId?: string
  overrideConfig?: Record<string, unknown>
  config?: AgentConfig
}): Promise<FlowiseCallResult> {
  const baseUrl = getFlowiseBaseUrl(options.config)
  const chatflowId = getFlowiseChatflowId(options.config)

  const url = `${baseUrl.replace(/\/$/, '')}/api/v1/prediction/${chatflowId}`

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }

  const apiKey = getFlowiseApiKey(options.config)
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  const body: Record<string, unknown> = {
    question: options.question,
  }

  if (options.overrideConfig) {
    body.overrideConfig = options.overrideConfig
  }

  if (options.chatId) {
    body.chatId = options.chatId
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Flowise request failed with ${response.status}: ${text}`)
  }

  const data = await response.json()

  return {
    text: data?.text || data?.answer || '',
    raw: data,
    chatId: data?.chatId,
  }
}

export async function sendChatMessage(
  message: string,
  options?: { chatId?: string; config?: AgentConfig }
) {
  const overrideConfig = buildOverrideConfig({
    model: options?.config?.model,
    temperature: options?.config?.temperature,
    systemMessage: options?.config?.agentPrompt,
  })

  const result = await callFlowise({
    question: message,
    chatId: options?.chatId,
    overrideConfig,
    config: options?.config,
  })

  return {
    reply: result.text,
    chatId: result.chatId,
    raw: result.raw,
  }
}

/**
 * Sends configuration to Flowise server to verify and test the connection
 * @param config The agent configuration to test
 * @returns Promise with the test result
 */
export async function testFlowiseConnection(config: AgentConfig): Promise<{
  success: boolean
  message: string
  raw?: unknown
}> {
  try {
    const overrideConfig = buildOverrideConfig({
      model: config.model,
      temperature: config.temperature,
      systemMessage: config.agentPrompt,
    })

    const result = await callFlowise({
      question: 'test connection',
      overrideConfig,
      config,
    })

    return {
      success: true,
      message: 'Connection successful',
      raw: result.raw,
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Connection failed',
    }
  }
}

/**
 * Applies configuration to Flowise by sending it as overrideConfig
 * This doesn't permanently save on Flowise server, but applies it for subsequent requests
 * @param config The agent configuration to apply
 */
export async function applyFlowiseConfig(config: AgentConfig): Promise<{
  success: boolean
  message: string
}> {
  try {
    const overrideConfig = buildOverrideConfig({
      model: config.model,
      temperature: config.temperature,
      systemMessage: config.agentPrompt,
    })

    const baseUrl = getFlowiseBaseUrl(config)
    const chatflowId = getFlowiseChatflowId(config)
    const url = `${baseUrl.replace(/\/$/, '')}/api/v1/prediction/${chatflowId}`

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }

    const apiKey = getFlowiseApiKey(config)
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`
    }

    const body = {
      question: 'Configuration applied',
      overrideConfig,
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`Failed to apply config: ${response.status} ${text}`)
    }

    return {
      success: true,
      message: 'Configuration applied to Flowise successfully',
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to apply configuration',
    }
  }
}

