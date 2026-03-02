import { useEffect, useMemo, useState } from 'react'
import {
  Settings,
  Thermometer,
  Brain,
  Code,
  Send,
  Save,
  RotateCcw,
  MessageCircle,
  CheckCircle,
  AlertCircle,
  Upload,
  CloudUpload,
} from 'lucide-react'
import type { AgentConfig } from '../types/agent'
import { loadAgentConfig, saveAgentConfig } from '../utils/storage'
import { sendChatMessage, updateChatflowConfig } from '../api/flowiseClient'

type ChatMessage = {
  id: number
  role: 'user' | 'assistant'
  content: string
}

type NotificationType = 'success' | 'info' | 'warning' | 'error'

type Notification = {
  id: number
  type: NotificationType
  message: string
}

const models = [
  { value: 'gpt-4.1-nano', label: 'GPT 4.1 Nano' },
  { value: 'gpt-4.1-mini', label: 'GPT 4.1 Mini' },
  { value: 'gpt-5-nano', label: 'GPT 5 Nano' },
  { value: 'gpt-5-mini', label: 'GPT 5 Mini' },
]

// Default configuration values
const DEFAULT_CONFIG: AgentConfig = {
  model: 'gpt-4.1-mini',
  temperature: 0.7,
  agentPrompt: '',
  flowiseBaseUrl: (import.meta.env.VITE_FLOWISE_BASE_URL as string | undefined) || '',
  flowiseChatflowId: (import.meta.env.VITE_FLOWISE_CHATFLOW_ID as string | undefined) || '',
  flowiseApiKey: undefined,
}

function getEnvFlag(name: string): boolean {
  const value = import.meta.env[name as keyof ImportMetaEnv]
  return typeof value === 'string' && value.length > 0
}

export function AgentDashboard() {
  const [model, setModel] = useState(DEFAULT_CONFIG.model)
  const [temperature, setTemperature] = useState(DEFAULT_CONFIG.temperature)
  const [agentPrompt, setAgentPrompt] = useState(DEFAULT_CONFIG.agentPrompt)
  const [flowiseBaseUrl, setFlowiseBaseUrl] = useState(DEFAULT_CONFIG.flowiseBaseUrl)
  const [flowiseChatflowId, setFlowiseChatflowId] = useState(DEFAULT_CONFIG.flowiseChatflowId)
  const [flowiseApiKey, setFlowiseApiKey] = useState('')

  const [isSaving, setIsSaving] = useState(false)
  const [isUpdatingFlowise, setIsUpdatingFlowise] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatError, setChatError] = useState<string | null>(null)
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [chatId, setChatId] = useState<string | undefined>(undefined)

  const hasEnvApiKey = useMemo(() => getEnvFlag('VITE_FLOWISE_API_KEY'), [])

  useEffect(() => {
    const saved = loadAgentConfig()
    if (saved) {
      setModel(saved.model)
      setTemperature(saved.temperature)
      setAgentPrompt(saved.agentPrompt)
      setFlowiseBaseUrl(saved.flowiseBaseUrl || DEFAULT_CONFIG.flowiseBaseUrl)
      setFlowiseChatflowId(saved.flowiseChatflowId || DEFAULT_CONFIG.flowiseChatflowId)
      setFlowiseApiKey(saved.flowiseApiKey || '')
    }
  }, [])

  const currentConfig: AgentConfig = useMemo(
    () => ({
      model,
      temperature,
      agentPrompt,
      flowiseBaseUrl,
      flowiseChatflowId,
      flowiseApiKey: flowiseApiKey || undefined,
    }),
    [
      agentPrompt,
      flowiseApiKey,
      flowiseBaseUrl,
      flowiseChatflowId,
      model,
      temperature,
    ],
  )

  const addNotification = (type: NotificationType, message: string) => {
    const notification: Notification = {
      id: Date.now(),
      type,
      message,
    }
    setNotifications((prev) => [...prev, notification])
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== notification.id))
    }, 4000)
  }

  const handleSave = async () => {
    setIsSaving(true)
    
    try {
      await new Promise((resolve) => setTimeout(resolve, 300))
      saveAgentConfig(currentConfig)
      addNotification('success', 'Configuration saved locally!')
    } catch (error) {
      addNotification('error', 'Failed to save configuration.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleUpdateFlowise = async () => {
    setIsUpdatingFlowise(true)
    
    try {
      // Save locally first
      saveAgentConfig(currentConfig)
      
      // Then update on Flowise server permanently
      const result = await updateChatflowConfig(currentConfig)
      
      if (result.success) {
        addNotification('success', 'Configuration permanently updated on Flowise server!')
      } else {
        addNotification('error', result.message)
      }
    } catch (error) {
      addNotification('error', 'Failed to update Flowise configuration.')
    } finally {
      setIsUpdatingFlowise(false)
    }
  }

  const handleRestoreDefaults = () => {
    setModel(DEFAULT_CONFIG.model)
    setTemperature(DEFAULT_CONFIG.temperature)
    setAgentPrompt(DEFAULT_CONFIG.agentPrompt)
    setFlowiseBaseUrl(DEFAULT_CONFIG.flowiseBaseUrl)
    setFlowiseChatflowId(DEFAULT_CONFIG.flowiseChatflowId)
    setFlowiseApiKey('')
    
    addNotification('info', 'Configuration restored to defaults.')
  }

  const handleSendChat = async () => {
    const message = chatInput.trim()
    if (!message) return

    const newUserMessage: ChatMessage = {
      id: Date.now(),
      role: 'user',
      content: message,
    }

    setChatMessages((prev) => [...prev, newUserMessage])
    setChatInput('')
    setChatError(null)
    setIsChatLoading(true)

    try {
      const result = await sendChatMessage(message, {
        chatId,
        config: currentConfig,
      })

      const assistantMessage: ChatMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: result.reply,
      }

      setChatMessages((prev) => [...prev, assistantMessage])

      if (result.chatId) {
        setChatId(result.chatId)
      }
    } catch (error) {
      console.error(error)
      setChatError(
        error instanceof Error ? error.message : 'Failed to send message to Flowise.',
      )
    } finally {
      setIsChatLoading(false)
    }
  }

  const handleResetChat = () => {
    setChatMessages([])
    setChatId(undefined)
    setChatError(null)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
  
        {/* HEADER */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900">
              AI Agent Dashboard
            </h1>
          </div>
          <p className="text-slate-600">
            Configure and manage your AI email agent
          </p>
        </div>

        {/* NOTIFICATIONS */}
        <div className="fixed top-6 right-6 z-50 space-y-2 max-w-md">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg border animate-slide-in ${
                notification.type === 'success'
                  ? 'bg-green-50 border-green-200 text-green-800'
                  : notification.type === 'info'
                  ? 'bg-blue-50 border-blue-200 text-blue-800'
                  : notification.type === 'error'
                  ? 'bg-red-50 border-red-200 text-red-800'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}
            >
              {notification.type === 'success' ? (
                <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              )}
              <span className="text-sm font-medium">{notification.message}</span>
            </div>
          ))}
        </div>
  
        {/* ================= CHAT SECTION ================= */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-semibold text-slate-900">
                Chat with Flowise Agent
              </h2>
            </div>
            <button
              type="button"
              onClick={handleResetChat}
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
            >
              <RotateCcw className="w-3 h-3" />
              Reset Conversation
            </button>
          </div>
  
          <div className="h-72 border border-slate-200 rounded-lg p-3 overflow-y-auto bg-slate-50">
            {chatMessages.length === 0 ? (
              <p className="text-sm text-slate-500">
                Start chatting with your AI email agent.
              </p>
            ) : (
              <div className="space-y-2">
                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      msg.role === 'user'
                        ? 'ml-auto bg-blue-600 text-white'
                        : 'mr-auto bg-white text-slate-900 border border-slate-200'
                    }`}
                  >
                    {msg.content}
                  </div>
                ))}
                {isChatLoading && (
                  <div className="mr-auto max-w-[80%] rounded-lg px-3 py-2 text-sm bg-white text-slate-500 border border-dashed border-slate-300">
                    Thinking…
                  </div>
                )}
              </div>
            )}
          </div>
  
          {chatError && (
            <p className="mt-2 text-sm text-red-600">{chatError}</p>
          )}
  
          <form
            className="mt-3 flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void handleSendChat()
            }}
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask the agent to draft or improve an email..."
              className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
            />
            <button
              type="submit"
              disabled={isChatLoading || !chatInput.trim()}
              className="inline-flex items-center gap-1 bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60 text-sm"
            >
              <Send className="w-4 h-4" />
              Send
            </button>
          </form>
        </div>
  
        {/* ================= CONFIGURATION SECTION ================= */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-semibold text-slate-900">
                Agent Configuration
              </h2>
            </div>
            <div className="text-xs text-slate-500 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
              💡 Chat uses local config with temporary overrides
            </div>
          </div>
  
          {/* MODEL */}
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">
              AI Model
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg"
            >
              {models.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
  
          {/* TEMPERATURE */}
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">
                Temperature: {temperature.toFixed(2)}
            </label>

            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full accent-blue-600"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>0.0</span>
              <span>0.5</span>
              <span>1.0</span>
              <span>1.5</span>
              <span>2.0</span>
            </div>
          </div>
  
          {/* SYSTEM PROMPT */}
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">
              Agent System Prompt
            </label>
            <textarea
              value={agentPrompt}
              onChange={(e) => setAgentPrompt(e.target.value)}
              placeholder="Enter system instructions for the AI agent..."
              className="w-full h-24 px-4 py-3 border border-slate-300 rounded-lg resize-none"
            />
          </div>
  
          {/* BODY SCHEMA PANEL */}
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">
              Default Body Schema
            </label>
            <textarea
              readOnly
              value={`{
  "recipient": {
    "type": "string",
    "required": true,
    "description": "Receiver email address"
  },
  "subject": {
    "type": "string",
    "required": true,
    "description": "Email subject"
  },
  "message": {
    "type": "string",
    "required": true,
    "description": "Email message"
  }
}`}
              className="w-full h-40 px-4 py-3 border border-slate-300 rounded-lg bg-slate-50 font-mono text-xs"
            />
          </div>
  
          {/* FLOWISE CONNECTION */}
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">
              Flowise Base URL
            </label>
            <input
              type="url"
              value={flowiseBaseUrl}
              onChange={(e) => setFlowiseBaseUrl(e.target.value)}
              placeholder="https://cloud.flowiseai.com"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
  
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">
              Chatflow ID
            </label>
            <input
              type="text"
              value={flowiseChatflowId}
              onChange={(e) => setFlowiseChatflowId(e.target.value)}
              placeholder="e8309376"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
  
          {/* ACTION BUTTONS */}
          <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
            <button
              type="button"
              onClick={handleRestoreDefaults}
              className="flex items-center gap-2 text-slate-600 px-4 py-2.5 rounded-lg hover:bg-slate-100 transition-colors border border-slate-300"
            >
              <RotateCcw className="w-4 h-4" />
              Restore Defaults
            </button>
            
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 bg-green-600 text-white px-5 py-2.5 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Local
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleUpdateFlowise}
                disabled={isUpdatingFlowise}
                className="flex items-center gap-2 bg-purple-600 text-white px-5 py-2.5 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                title="Permanently updates the chatflow configuration on Flowise server"
              >
                {isUpdatingFlowise ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <CloudUpload className="w-4 h-4" />
                    Update Flowise
                  </>
                )}
              </button>
            </div>
          </div>

          {/* INFO BOX */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900">
                <p className="font-medium mb-1">Configuration Modes:</p>
                <ul className="space-y-1 list-disc list-inside text-blue-800">
                  <li><strong>Save Local:</strong> Saves to browser storage only</li>
                  <li><strong>Update Flowise:</strong> Permanently updates the chatflow on Flowise server</li>
                  <li><strong>Chat:</strong> Uses local config with temporary overrides per request</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

