<template>
  <div class="chat-view">
    <!-- 左侧对话列表 -->
    <div class="chat-sidebar">
      <button class="sidebar-new-btn" @click="newChat">＋ 新对话</button>
      <div class="sidebar-list">
        <div
          v-for="chat in chatList"
          :key="chat.id"
          class="sidebar-item"
          :class="{ active: chat.id === currentChatId }"
          @click="switchChat(chat.id)"
        >
          <div class="sidebar-item-title">{{ chat.title || '新对话' }}</div>
          <div class="sidebar-item-time">{{ formatTime(chat.updatedAt) }}</div>
        </div>
      </div>
    </div>

    <div class="chat-container">
      <!-- 顶部设置条 -->
      <div class="chat-toolbar">
        <ProviderSelector v-model="selectedProviderId" :providers="providerOptions" />
        <ModelSelector v-model="selectedModel" :models="availableModels" label="模型" />
      </div>

      <!-- 空状态 / 对话区域 -->
      <div v-if="messages.length === 0 && !loading" class="chat-empty">
        <div class="empty-icon">💬</div>
        <div class="empty-text">AI 文本助手</div>
        <div class="empty-hint">在下方输入内容，开始对话</div>
      </div>

      <div v-else class="chat-messages" ref="messagesRef">
        <div v-for="msg in messages" :key="msg.id" class="chat-message" :class="msg.role">
          <div v-if="msg.attachments?.length" class="msg-attachments">
            <template v-for="att in msg.attachments" :key="att.id">
              <img v-if="att.type === 'image' && att.url" :src="att.url" class="msg-att-thumb" />
              <span v-else class="msg-att-file">📄 {{ att.name }}</span>
            </template>
          </div>
          <div v-if="msg.reasoning" class="msg-reasoning">
            <div class="reasoning-header" @click="msg._showReasoning = !msg._showReasoning">
              💭 思考过程 {{ msg._showReasoning ? '▲' : '▼' }}
            </div>
            <div v-if="msg._showReasoning" class="reasoning-body">{{ msg.reasoning }}</div>
          </div>
          <div class="msg-content">{{ msg.content }}</div>
          <div class="msg-meta">
            <span v-if="msg.model">{{ msg.model }}</span>
            <span>{{ formatTime(msg.ts) }}</span>
            <button class="msg-copy" @click="copyMsg(msg.content)" title="复制">📋</button>
          </div>
        </div>
        <div v-if="loading" class="chat-message assistant typing">
          <div class="msg-content"><span class="typing-dots">思考中<span>.</span><span>.</span><span>.</span></span></div>
        </div>
      </div>

      <!-- 引用附件 -->
      <div v-if="attachments.length > 0" class="chat-attachments">
        <div v-for="(att, i) in attachments" :key="att.id" class="att-item">
          <img v-if="att.type === 'image' && att.url" :src="att.url" class="att-thumb" />
          <span v-else class="att-file-icon">📄</span>
          <span class="att-name">{{ att.name }}</span>
          <button class="att-remove" @click="attachments.splice(i, 1)">×</button>
        </div>
      </div>

      <!-- 输入区 -->
      <div class="chat-input-area">
        <label class="chat-attach-btn" title="添加附件">
          <span class="attach-plus">+</span>
          <input type="file" accept="image/*,video/*,text/*,application/pdf" multiple @change="onAttachFiles" style="display:none" />
        </label>
        <textarea
          v-model="input"
          class="chat-input"
          placeholder="输入内容，Enter 发送，Shift+Enter 换行..."
          rows="2"
          @keydown="onInputKeydown"
          :disabled="loading"
        ></textarea>
        <button class="chat-send" @click="send" :disabled="loading || !input.trim()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
      <div v-if="currentModelSupportsReasoning" class="reasoning-bar">
        <span class="reasoning-label">思考强度</span>
        <select v-model="reasoningEffort" class="reasoning-select">
          <option value="low">LOW — 快速响应</option>
          <option value="medium">MEDIUM — 适中思考</option>
          <option value="high">HIGH — 深度思考</option>
          <option value="max">MAX — 最强思考</option>
        </select>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted } from 'vue'
import { useAIStore } from '@/stores/ai'
import ProviderSelector from '@/components/ProviderSelector.vue'
import ModelSelector from '@/components/ModelSelector.vue'

interface Attachment {
  id: string
  type: 'image' | 'file'
  url: string
  name: string
  base64: string
  textContent?: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  _showReasoning?: boolean
  model?: string
  ts: number
  attachments?: Attachment[]
}

interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

const aiStore = useAIStore()
const CHAT_STORE_KEY = 'chatSessions'

// 所有对话
const chatSessions = ref<ChatSession[]>([])
const currentChatId = ref<string>('')
const loading = ref(false)
const reasoningEffort = ref<'low' | 'medium' | 'high' | 'max'>('medium')
const attachments = ref<Attachment[]>([])
const input = ref('')
const messagesRef = ref<HTMLDivElement>()

// 当前对话的便捷访问
const messages = computed(() => {
  const s = chatSessions.value.find(s => s.id === currentChatId.value)
  return s?.messages ?? []
})
const chatList = computed(() =>
  [...chatSessions.value].sort((a, b) => b.updatedAt - a.updatedAt)
)

const selectedProviderId = ref(aiStore.defaultTextProviderId || '')
const selectedModel = ref('')

const providerOptions = computed(() =>
  aiStore.textProviders.map((p) => ({
    id: p.id, name: p.name, baseUrl: p.baseUrl, status: p.status,
    isDefault: p.id === aiStore.defaultTextProviderId,
  }))
)

const availableModels = computed(() => {
  const config = aiStore.getProviderConfig(selectedProviderId.value)
  return config?.models ?? []
})

const currentModelSupportsReasoning = computed(() => {
  const config = aiStore.getProviderConfig(selectedProviderId.value)
  const model = config?.models.find((m: any) => m.id === selectedModel.value)
  return (model as any)?.supportsReasoning === true
})

watch(selectedProviderId, (newId) => {
  const models = aiStore.getProviderConfig(newId)?.models ?? []
  if (!models.find((m) => m.id === selectedModel.value)) {
    selectedModel.value = models[0]?.id ?? ''
  }
})

function newChat() {
  const id = 'chat_' + Date.now().toString(36)
  chatSessions.value.push({ id, title: '', messages: [], createdAt: Date.now(), updatedAt: Date.now() })
  currentChatId.value = id
  attachments.value = []
  input.value = ''
  saveHistory()
}

function switchChat(id: string) {
  currentChatId.value = id
  attachments.value = []
  input.value = ''
  nextTick(() => scrollToBottom())
}

async function loadHistory() {
  const raw = await window.electronAPI?.store?.get(CHAT_STORE_KEY)
  if (raw) {
    try {
      chatSessions.value = JSON.parse(raw)
    } catch { /* ignore */ }
  }
  if (chatSessions.value.length === 0) {
    newChat()
  } else {
    currentChatId.value = chatSessions.value[0].id
  }
}

let saveDebounce: number | null = null
function saveHistory() {
  if (saveDebounce) clearTimeout(saveDebounce)
  saveDebounce = window.setTimeout(() => {
    window.electronAPI?.store?.set(CHAT_STORE_KEY, JSON.stringify(chatSessions.value))
  }, 500)
}

watch(chatSessions, () => saveHistory(), { deep: true })

onMounted(async () => {
  await loadHistory()
  if (!selectedProviderId.value) {
    selectedProviderId.value = aiStore.defaultTextProviderId || ''
  }
  const models = aiStore.getProviderConfig(selectedProviderId.value)?.models ?? []
  if (!models.find((m) => m.id === selectedModel.value)) {
    selectedModel.value = models[0]?.id ?? ''
  }
  scrollToBottom()
})

function scrollToBottom() {
  nextTick(() => {
    const el = messagesRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

async function send() {
  const text = input.value.trim()
  if (!text || loading.value) return

  const providerConfig = aiStore.getProviderConfig(selectedProviderId.value)
  if (!providerConfig || !providerConfig.apiKey) {
    messages.value.push({ id: uid(), role: 'assistant', content: '⚠️ 请先在「设置」中配置文本中转站的 API Key', ts: Date.now() })
    scrollToBottom()
    return
  }
  const provider = aiStore.getTextProvider(selectedProviderId.value)
  if (!provider) {
    messages.value.push({ id: uid(), role: 'assistant', content: '⚠️ 文本中转站初始化失败', ts: Date.now() })
    scrollToBottom()
    return
  }

  const session = chatSessions.value.find(s => s.id === currentChatId.value)
  if (!session) return

  const atts = [...attachments.value]
  let finalText = text
  const textFiles = atts.filter(a => a.type === 'file' && a.textContent)
  if (textFiles.length) {
    finalText = textFiles.map(a => `[文件: ${a.name}]\n${a.textContent}`).join('\n\n') + '\n\n---\n' + text
  }
  session.messages.push({ id: uid(), role: 'user', content: text, attachments: atts, ts: Date.now() })
  // 自动标题：用第一条用户消息前20字
  if (!session.title && session.messages.length === 1) {
    session.title = text.slice(0, 20)
  }
  session.updatedAt = Date.now()
  input.value = ''
  attachments.value = []
  loading.value = true
  scrollToBottom()

  try {
    const result = await provider.chat({
      model: selectedModel.value || providerConfig.models[0]?.id || 'gemini-2.5-flash',
      prompt: finalText,
      imageUrls: atts.filter(a => a.type === 'image').map(a => a.url),
      enableThinking: currentModelSupportsReasoning.value ? reasoningEffort.value : undefined,
    })
    session.messages.push({
      id: uid(),
      role: 'assistant',
      content: result.text || '(空响应)',
      reasoning: result.reasoning || undefined,
      _showReasoning: false,
      model: result.model || selectedModel.value,
      ts: Date.now(),
    })
    session.updatedAt = Date.now()
  } catch (err) {
    messages.value.push({
      id: uid(),
      role: 'assistant',
      content: '❌ ' + (err instanceof Error ? err.message : '请求失败'),
      ts: Date.now(),
    })
  } finally {
    loading.value = false
    scrollToBottom()
  }
}

function onAttachFiles(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (!files) return
  Array.from(files).forEach(file => {
    const isImage = file.type.startsWith('image/')
    const reader = new FileReader()
    if (isImage) {
      reader.onload = () => {
        const dataUrl = reader.result as string
        attachments.value.push({
          id: 'att_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
          type: 'image', url: dataUrl, name: file.name,
          base64: dataUrl.includes('base64,') ? dataUrl.split('base64,')[1] : dataUrl,
        })
      }
      reader.readAsDataURL(file)
    } else {
      reader.onload = () => {
        attachments.value.push({
          id: 'att_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
          type: 'file', url: '', name: file.name, base64: '',
          textContent: reader.result as string,
        })
      }
      reader.readAsText(file)
    }
  })
}

function onInputKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

function copyMsg(text: string) {
  navigator.clipboard.writeText(text).catch(() => {})
}

function formatTime(ts: number) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

function uid() {
  return 'm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}
</script>

<style scoped>
.chat-view {
  width: 100%; height: 100%;
  background: #020308;
  display: flex; flex-direction: row;
}

.chat-sidebar {
  width: 220px; flex-shrink: 0;
  border-right: 1px solid rgba(0,217,255,0.12);
  display: flex; flex-direction: column;
  overflow: hidden;
}
.sidebar-new-btn {
  margin: 12px;
  padding: 8px 0;
  background: rgba(0,217,255,0.12);
  border: 1px solid rgba(0,217,255,0.25);
  border-radius: 8px;
  color: #00D9FF;
  font-size: 13px; cursor: pointer;
  transition: all 0.2s;
}
.sidebar-new-btn:hover { background: rgba(0,217,255,0.2); }
.sidebar-list { flex: 1; overflow-y: auto; padding: 0 8px 8px; }
.sidebar-item {
  padding: 10px 12px; margin-bottom: 2px;
  border-radius: 6px; cursor: pointer;
  transition: background 0.15s;
}
.sidebar-item:hover { background: rgba(255,255,255,0.04); }
.sidebar-item.active { background: rgba(0,217,255,0.1); }
.sidebar-item-title {
  font-size: 13px; color: rgba(255,255,255,0.75);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  margin-bottom: 2px;
}
.sidebar-item-time {
  font-size: 10px; color: rgba(255,255,255,0.3);
}

.chat-container {
  flex: 1; height: 100%; min-width: 0;
  display: flex; flex-direction: column;
  padding: 16px;
}

.chat-toolbar {
  display: flex; gap: 10px; align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(0,217,255,0.15);
  flex-shrink: 0;
}

.reasoning-bar {
  display: flex; align-items: center; gap: 10px;
  padding-top: 8px;
}
.reasoning-label { font-size: 12px; color: rgba(255,255,255,0.4); white-space: nowrap; }
.reasoning-select {
  padding: 4px 10px;
  background: rgba(0,217,255,0.05);
  border: 1px solid rgba(0,217,255,0.2);
  border-radius: 6px;
  color: #00D9FF;
  font-size: 12px;
  cursor: pointer;
  outline: none;
}
.reasoning-select:hover { border-color: rgba(0,217,255,0.4); }
.reasoning-select option { background: #020308; color: #00D9FF; }

.msg-reasoning { margin-bottom: 8px; }
.reasoning-header {
  font-size: 12px; color: rgba(255,255,255,0.45); cursor: pointer;
  padding: 4px 0;
}
.reasoning-header:hover { color: rgba(0,217,255,0.6); }
.reasoning-body {
  font-size: 13px; line-height: 1.6;
  color: rgba(255,255,255,0.5);
  padding: 10px 12px; margin-top: 4px;
  background: rgba(0,217,255,0.04);
  border-left: 2px solid rgba(0,217,255,0.3);
  border-radius: 0 8px 8px 0;
  white-space: pre-wrap; word-break: break-word;
}

.chat-empty {
  flex: 1;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  color: rgba(255,255,255,0.4);
}
.empty-icon { font-size: 56px; margin-bottom: 12px; }
.empty-text { font-size: 20px; margin-bottom: 6px; color: rgba(255,255,255,0.7); }
.empty-hint { font-size: 13px; }

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px 0;
  display: flex; flex-direction: column;
  gap: 14px;
}

.chat-message {
  max-width: 85%;
  padding: 12px 16px;
  border-radius: 14px;
  line-height: 1.65;
  font-size: 14px;
}
.chat-message.user {
  align-self: flex-end;
  background: rgba(0,217,255,0.15);
  border: 1px solid rgba(0,217,255,0.25);
  color: #e0eefe;
  border-bottom-right-radius: 4px;
}
.chat-message.assistant {
  align-self: flex-start;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.06);
  color: #e0e0e0;
  border-bottom-left-radius: 4px;
}
.chat-message.assistant.typing {
  opacity: 0.6;
}

.msg-content {
  white-space: pre-wrap;
  word-break: break-word;
}
.msg-meta {
  display: flex; align-items: center; gap: 8px;
  margin-top: 6px;
  font-size: 11px;
  color: rgba(255,255,255,0.3);
}
.msg-copy {
  background: none; border: none;
  cursor: pointer; font-size: 12px;
  opacity: 0; transition: opacity 0.2s;
  padding: 0;
}
.chat-message:hover .msg-copy { opacity: 0.6; }
.msg-copy:hover { opacity: 1 !important; }

.typing-dots span {
  animation: blink 1.4s infinite;
}
.typing-dots span:nth-child(2) { animation-delay: 0.2s; }
.typing-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes blink { 0%,80%,100% { opacity: 0; } 40% { opacity: 1; } }

.chat-attachments {
  display: flex; gap: 8px; flex-wrap: wrap;
  padding-bottom: 8px;
}
.att-item {
  position: relative; display: flex; align-items: center; gap: 6px;
  padding: 4px 8px 4px 4px;
  background: rgba(0,217,255,0.06); border: 1px solid rgba(0,217,255,0.15);
  border-radius: 8px;
}
.att-thumb { width: 36px; height: 36px; object-fit: cover; border-radius: 4px; }
.att-name { font-size: 11px; color: rgba(255,255,255,0.5); max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.att-remove {
  background: none; border: none; color: rgba(255,255,255,0.4); cursor: pointer;
  font-size: 16px; padding: 0 2px; line-height: 1;
}
.att-remove:hover { color: #ff4444; }

.chat-attach-btn {
  display: flex; align-items: center; justify-content: center;
  width: 36px; height: 36px;
  border-radius: 8px;
  border: 1px dashed rgba(255,255,255,0.15);
  color: rgba(255,255,255,0.35);
  cursor: pointer; transition: all 0.2s;
  flex-shrink: 0;
}
.chat-attach-btn:hover { border-color: #00D9FF; color: #00D9FF; background: rgba(0,217,255,0.06); }
.attach-plus { font-size: 22px; font-weight: 300; line-height: 1; }

.msg-attachments { display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
.msg-att-thumb { width: 60px; height: 60px; object-fit: cover; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); }

.chat-input-area {
  display: flex; gap: 10px; align-items: flex-end;
  padding-top: 12px;
  border-top: 1px solid rgba(0,217,255,0.15);
  flex-shrink: 0;
}
.chat-input {
  flex: 1;
  padding: 12px 16px;
  background: rgba(0,217,255,0.05);
  border: 1px solid rgba(0,217,255,0.25);
  border-radius: 12px;
  color: #fff;
  font-size: 14px;
  font-family: inherit;
  resize: none;
  outline: none;
  line-height: 1.5;
  max-height: 120px;
}
.chat-input:focus { border-color: #00D9FF; }
.chat-input:disabled { opacity: 0.4; }

.chat-send {
  width: 44px; height: 44px;
  border-radius: 12px;
  background: rgba(0,217,255,0.2);
  border: 1px solid #00D9FF;
  color: #00D9FF;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s;
}
.chat-send:hover:not(:disabled) {
  background: rgba(0,217,255,0.35);
  box-shadow: 0 0 16px rgba(0,217,255,0.4);
}
.chat-send:disabled { opacity: 0.3; cursor: not-allowed; }
</style>
