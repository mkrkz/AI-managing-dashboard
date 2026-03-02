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

/**
 * Builds the overrideConfig object with the exact field names expected by Flowise
 * Based on the Flowise UI configuration fields
 */
export function buildOverrideConfig(input: {
  model?: string
  temperature?: number
  systemMessage?: string
}): OverrideConfig {
  const override: OverrideConfig = {}

  // Match the exact field name from Flowise: "modelName" (not "model")
  if (input.model) {
    override.modelName = input.model
  }

  // Match the exact field name from Flowise: "temperature"
  if (typeof input.temperature === 'number') {
    override.temperature = input.temperature
  }

  // Match the exact field name from Flowise: "systemMessage"
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
 * Fetches the current chatflow configuration from Flowise
 */
export async function getChatflowConfig(config: AgentConfig): Promise<{
  success: boolean
  data?: unknown
  message: string
}> {
  try {
    const baseUrl = getFlowiseBaseUrl(config)
    const chatflowId = getFlowiseChatflowId(config)
    const url = `${baseUrl.replace(/\/$/, '')}/api/v1/chatflows/${chatflowId}`

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }

    const apiKey = getFlowiseApiKey(config)
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`
    }

    const response = await fetch(url, {
      method: 'GET',
      headers,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`Failed to fetch chatflow: ${response.status} ${text}`)
    }

    const data = await response.json()

    return {
      success: true,
      data,
      message: 'Chatflow configuration fetched successfully',
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to fetch chatflow configuration',
    }
  }
}

/**
 * Updates the chatflow configuration permanently on Flowise server
 * This modifies the actual chatflow in Flowise's database
 */
export async function updateChatflowConfig(config: AgentConfig): Promise<{
  success: boolean
  message: string
}> {
  try {
    // First, fetch the current chatflow
    const currentConfig = await getChatflowConfig(config)
    
    if (!currentConfig.success || !currentConfig.data) {
      throw new Error('Failed to fetch current chatflow configuration')
    }

    const chatflowData = currentConfig.data as Record<string, unknown>
    
    // Parse the flowData to update the specific node
    let flowData = chatflowData.flowData
    if (typeof flowData === 'string') {
      flowData = JSON.parse(flowData)
    }

    // Find and update the ChatOpenAI node (or similar LLM node)
    const nodes = (flowData as Record<string, unknown>).nodes as Array<Record<string, unknown>>
    
    for (const node of nodes) {
      const nodeData = node.data as Record<string, unknown>
      
      // Look for LLM nodes (ChatOpenAI, OpenAI, etc.)
      if (nodeData.name === 'chatOpenAI' || nodeData.name === 'openAI') {
        const inputs = nodeData.inputs as Record<string, unknown>
        
        // Update the configuration
        if (config.model && inputs.modelName !== undefined) {
          inputs.modelName = config.model
        }
        
        if (typeof config.temperature === 'number' && inputs.temperature !== undefined) {
          inputs.temperature = config.temperature
        }
        
        if (config.agentPrompt && inputs.systemMessage !== undefined) {
          inputs.systemMessage = config.agentPrompt
        }
      }
    }

    // Update the chatflow
    const baseUrl = getFlowiseBaseUrl(config)
    const chatflowId = getFlowiseChatflowId(config)
    const url = `${baseUrl.replace(/\/$/, '')}/api/v1/chatflows/${chatflowId}`

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }

    const apiKey = getFlowiseApiKey(config)
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`
    }

    const updateBody = {
      ...chatflowData,
      flowData: JSON.stringify(flowData),
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(updateBody),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`Failed to update chatflow: ${response.status} ${text}`)
    }

    return {
      success: true,
      message: 'Chatflow configuration updated permanently on Flowise',
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to update chatflow configuration',
    }
  }
}

/**
 * Sends configuration to Flowise server to verify and test the connection
 * Uses overrideConfig (temporary, per-request only)
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
      message: 'Connection successful (temporary override applied)',
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
 * ⚠️ This is TEMPORARY and only applies to the current request
 * Use updateChatflowConfig() for permanent changes
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
      question: 'Configuration applied (temporary override)',
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
      message: 'Configuration applied temporarily (next requests will use this)',
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to apply configuration',
    }
  }
}

