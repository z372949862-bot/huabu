<template>
  <div class="settings">
    <div class="settings-container">
      <div class="settings-header">
        <h2>AI 服务配置</h2>
      </div>

      <!-- Tab 切换 -->
      <div class="tabs">
        <button
          class="tab"
          :class="{ active: activeTab === 'video' }"
          @click="activeTab = 'video'"
        >
          🎬 视频中转站 ({{ aiStore.videoProviders.length }})
        </button>
        <button
          class="tab"
          :class="{ active: activeTab === 'image' }"
          @click="activeTab = 'image'"
        >
          🎨 图片中转站 ({{ aiStore.imageProviders.length }})
        </button>
        <div class="tab-spacer" />
        <select
          v-if="activeTab === 'image'"
          v-model="newImageKind"
          class="kind-select"
          title="选择要添加的中转站类型"
        >
          <option value="chuhaiying">出海营 (aiid.edu.kg)</option>
          <option value="geeknow">GeekNow (geeknow.ai)</option>
        </select>
        <select
          v-else
          v-model="newVideoKind"
          class="kind-select"
          title="选择要添加的中转站类型"
        >
          <option value="seedance">Seedance (火山方舟)</option>
          <option value="chuhaiying">出海营 (Sora 兼容)</option>
        </select>
        <button class="btn-primary add-btn" @click="addProviderClick">
          + 添加{{ activeTab === 'video' ? '视频' : '图片' }}中转站
        </button>
      </div>

      <div v-if="visibleProviders.length === 0" class="empty-tip">
        还没有{{ activeTab === 'video' ? '视频' : '图片' }}中转站，点右上角添加
      </div>

      <div class="settings-content">
        <div
          v-for="provider in visibleProviders"
          :key="provider.id"
          class="provider-card"
        >
          <div class="provider-header">
            <div class="provider-info">
              <span class="provider-name">
                <span v-if="isDefault(provider)" class="star" title="默认中转站">⭐</span>
                <span class="type-tag" :class="provider.type">{{ provider.type === 'image' ? '图片' : '视频' }}</span>
                {{ provider.name || '未命名中转站' }}
              </span>
              <span class="status-indicator" :class="getStatusClass(provider.status)"></span>
            </div>
            <span class="status-text">{{ getStatusText(provider.status) }}</span>
          </div>

          <div class="provider-body">
            <div class="input-group">
              <label>名称</label>
              <input
                :value="provider.name"
                @change="onNameChange(provider.id, ($event.target as HTMLInputElement).value)"
                placeholder="例如：出海营"
                class="text-input"
              />
            </div>

            <div class="input-group">
              <label>Base URL</label>
              <input
                :value="provider.baseUrl"
                @change="onBaseUrlChange(provider.id, ($event.target as HTMLInputElement).value)"
                placeholder="https://api.aiid.edu.kg"
                class="text-input"
              />
            </div>

            <div class="input-group">
              <label>API Key</label>
              <div class="input-row">
                <input
                  :value="provider.apiKey"
                  @change="onApiKeyChange(provider.id, ($event.target as HTMLInputElement).value)"
                  :type="showKeys[provider.id] ? 'text' : 'password'"
                  placeholder="sk-..."
                  class="api-key-input"
                />
                <button class="btn-secondary" @click="toggleKey(provider.id)">
                  {{ showKeys[provider.id] ? '隐藏' : '显示' }}
                </button>
              </div>
            </div>

            <!-- 模型管理（视频中转站才显示，图片中转站暂不支持模型管理） -->
            <div v-if="provider.type === 'video'" class="model-section">
              <button class="model-toggle" @click="toggleModelPanel(provider.id)">
                <span>模型 ({{ provider.models.length }})</span>
                <span class="chevron" :class="{ open: modelPanelOpen[provider.id] }">▼</span>
              </button>
              <div v-if="modelPanelOpen[provider.id]" class="model-list">
                <div
                  v-for="model in provider.models"
                  :key="model.id"
                  class="model-item"
                >
                  <div class="model-meta">
                    <span class="model-name">{{ model.name || model.id }}</span>
                    <span v-if="model.name" class="model-id">{{ model.id }}</span>
                  </div>
                  <button class="btn-icon" @click="aiStore.removeModel(provider.id, model.id)" title="删除">
                    🗑
                  </button>
                </div>
                <div v-if="provider.models.length === 0" class="empty-models">
                  这个中转站还没添加任何模型
                </div>

                <div class="add-model-row">
                  <select v-model="addModelChoice[provider.id]" class="model-select">
                    <option value="">— 从模板添加 —</option>
                    <option
                      v-for="t in availableTemplates(provider)"
                      :key="t.id"
                      :value="t.id"
                    >
                      {{ t.name }} ({{ t.id }})
                    </option>
                  </select>
                  <button
                    class="btn-secondary"
                    :disabled="!addModelChoice[provider.id]"
                    @click="addModelClick(provider.id)"
                  >
                    添加
                  </button>
                </div>

                <div class="add-model-row">
                  <input
                    v-model="customModelId[provider.id]"
                    placeholder="或填自定义模型 ID"
                    class="text-input"
                  />
                  <button
                    class="btn-secondary"
                    :disabled="!customModelId[provider.id]"
                    @click="addCustomModelClick(provider.id)"
                  >
                    添加自定义
                  </button>
                </div>
              </div>
            </div>

            <div class="button-group">
              <button
                class="btn-primary"
                :disabled="!provider.apiKey || testing[provider.id]"
                @click="testConnection(provider.id)"
              >
                {{ testing[provider.id] ? '测试中...' : '测试连接' }}
              </button>
              <button
                v-if="!isDefault(provider)"
                class="btn-secondary"
                @click="aiStore.setDefaultProvider(provider.id)"
              >
                设为默认
              </button>
              <button class="btn-danger" @click="confirmDelete(provider.id)">
                删除
              </button>
            </div>

            <div v-if="provider.error" class="error-message">
              ❌ {{ provider.error }}
            </div>

            <div v-if="savedFlash[provider.id]" class="success-message">
              ✅ 已加密保存到本地
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed, ref, onErrorCaptured } from 'vue'
import { useAIStore } from '@/stores/ai'
import type { ProviderStatus, Provider } from '@/stores/ai'
import { MODEL_TEMPLATES } from '@/services/modelTemplates'

onErrorCaptured((err) => {
  console.error('[Settings] render error:', err)
  return false // 阻止向上冒泡，避免白屏
})

const aiStore = useAIStore()

const activeTab = ref<'video' | 'image'>('video')
// 添加图片中转站时选哪种 kind；默认 chuhaiying（最新接入）
const newImageKind = ref<'geeknow' | 'chuhaiying'>('chuhaiying')
// 添加视频中转站时选哪种 kind；默认 seedance（最常用）
const newVideoKind = ref<'seedance' | 'chuhaiying'>('seedance')

const visibleProviders = computed(() =>
  activeTab.value === 'video' ? aiStore.videoProviders : aiStore.imageProviders
)

const isDefault = (p: Provider) =>
  (p.type === 'image' ? aiStore.defaultImageProviderId : aiStore.defaultProviderId) === p.id

const showKeys = reactive<Record<string, boolean>>({})
const testing = reactive<Record<string, boolean>>({})
const savedFlash = reactive<Record<string, boolean>>({})
const modelPanelOpen = reactive<Record<string, boolean>>({})
const addModelChoice = reactive<Record<string, string>>({})
const customModelId = reactive<Record<string, string>>({})

const flash = (id: string) => {
  savedFlash[id] = true
  setTimeout(() => { savedFlash[id] = false }, 2000)
}

const toggleKey = (id: string) => {
  showKeys[id] = !showKeys[id]
}

const toggleModelPanel = (id: string) => {
  modelPanelOpen[id] = !modelPanelOpen[id]
}

const onNameChange = (id: string, value: string) => {
  aiStore.updateProvider(id, { name: value })
  flash(id)
}

const onBaseUrlChange = (id: string, value: string) => {
  aiStore.updateProvider(id, { baseUrl: value })
  flash(id)
}

const onApiKeyChange = (id: string, value: string) => {
  aiStore.updateProvider(id, { apiKey: value })
  flash(id)
}

const availableTemplates = (provider: Provider) => {
  const existing = new Set(provider.models.map((m) => m.id))
  return MODEL_TEMPLATES.filter((t) => !existing.has(t.id))
}

const addModelClick = (providerId: string) => {
  const id = addModelChoice[providerId]
  if (!id) return
  aiStore.addModel(providerId, id)
  addModelChoice[providerId] = ''
}

const addCustomModelClick = (providerId: string) => {
  const id = customModelId[providerId]?.trim()
  if (!id) return
  aiStore.addModel(providerId, id)
  customModelId[providerId] = ''
}

const addProviderClick = () => {
  // Electron 默认禁用 window.prompt，直接加一条默认名的中转站，
  // 用户可以在卡片的"名称"输入框里改
  if (activeTab.value === 'image') {
    const kind = newImageKind.value
    const baseName = kind === 'chuhaiying' ? '出海营' : 'GeekNow'
    const existingCount = aiStore.imageProviders.filter((p) => (p.kind || 'geeknow') === kind).length
    aiStore.addProvider({
      name: `${baseName}${existingCount > 0 ? ` ${existingCount + 1}` : ''}`,
      type: 'image',
      kind,
    })
  } else {
    const kind = newVideoKind.value
    const baseName = kind === 'chuhaiying' ? '出海营视频' : 'Seedance'
    const existingCount = aiStore.videoProviders.filter((p) => (p.kind || 'seedance') === kind).length
    aiStore.addProvider({
      name: `${baseName}${existingCount > 0 ? ` ${existingCount + 1}` : ''}`,
      type: 'video',
      kind,
    })
  }
}

const confirmDelete = (id: string) => {
  const config = aiStore.getProviderConfig(id)
  if (!config) return
  // 与 prompt 类似，confirm 在某些 Electron 配置下也可能有问题，但目前这台机子是 OK 的
  if (window.confirm(`确定删除中转站「${config.name}」？此操作不可撤销。`)) {
    aiStore.deleteProvider(id)
  }
}

const testConnection = async (id: string) => {
  testing[id] = true
  try {
    await aiStore.testProviderConnection(id)
  } finally {
    testing[id] = false
  }
}

const getStatusClass = (status: ProviderStatus): string => ({
  connected: 'green',
  disconnected: 'yellow',
  error: 'red',
  unconfigured: 'gray',
})[status] || 'gray'

const getStatusText = (status: ProviderStatus): string => ({
  connected: '已配置',
  disconnected: '未连接',
  error: '配置错误',
  unconfigured: '未配置',
})[status] || '未知'
</script>

<style scoped>
.settings {
  width: 100%;
  height: 100%;
  background: #020308;
  overflow-y: auto;
}

.settings-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 40px 20px;
}

.settings-header {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.settings-header h2 {
  font-size: 28px;
  color: #00D9FF;
  font-weight: 300;
}

.tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 24px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(0, 217, 255, 0.2);
}

.tab {
  background: transparent;
  border: 1px solid transparent;
  color: #888;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}
.tab:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.04);
}
.tab.active {
  color: #00D9FF;
  border-color: #00D9FF;
  background: rgba(0, 217, 255, 0.08);
}

.tab-spacer {
  flex: 1;
}

.type-tag {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  margin-right: 4px;
  font-weight: 500;
}
.type-tag.video {
  background: rgba(0, 217, 255, 0.15);
  color: #00D9FF;
}
.type-tag.image {
  background: rgba(180, 50, 255, 0.15);
  color: #B432FF;
}

.add-btn {
  height: 38px;
}

.kind-select {
  height: 38px;
  padding: 0 10px;
  background: rgba(0, 217, 255, 0.05);
  border: 1px solid rgba(0, 217, 255, 0.3);
  border-radius: 6px;
  color: #00D9FF;
  font-size: 13px;
  cursor: pointer;
  outline: none;
  transition: border-color 0.2s, background 0.2s;
}
.kind-select:hover {
  border-color: rgba(0, 217, 255, 0.6);
  background: rgba(0, 217, 255, 0.08);
}
.kind-select option {
  background: #020308;
  color: #00D9FF;
}

.empty-tip {
  text-align: center;
  padding: 40px;
  color: #888;
  border: 1px dashed rgba(0, 217, 255, 0.4);
  border-radius: 12px;
  background: rgba(0, 217, 255, 0.02);
}

.settings-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.provider-card {
  background: rgba(2, 3, 8, 0.6);
  border: 1px solid rgba(0, 217, 255, 0.3);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 20px rgba(0, 217, 255, 0.1);
  transition: border-color 0.3s, box-shadow 0.3s;
}
.provider-card:has(.star) {
  border-color: #00D9FF;
  box-shadow: 0 4px 24px rgba(0, 217, 255, 0.3);
}

.provider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid rgba(0, 217, 255, 0.3);
}

.provider-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.provider-name {
  font-size: 18px;
  font-weight: 500;
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.star {
  color: #FFD166;
  font-size: 14px;
}

.status-indicator {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  box-shadow: 0 0 10px currentColor;
}
.status-indicator.green  { background: #00ff88; color: #00ff88; }
.status-indicator.yellow { background: #ffcc00; color: #ffcc00; }
.status-indicator.red    { background: #ff4444; color: #ff4444; }
.status-indicator.gray   { background: #666; color: #666; }

.status-text {
  font-size: 14px;
  color: #888;
}

.provider-body {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.input-group label {
  display: block;
  margin-bottom: 8px;
  color: #00D9FF;
  font-size: 14px;
}

.input-row {
  display: flex;
  gap: 10px;
}

.text-input,
.api-key-input {
  flex: 1;
  width: 100%;
  padding: 10px 15px;
  background: rgba(0, 217, 255, 0.05);
  border: 1px solid #00D9FF;
  border-radius: 6px;
  color: #ffffff;
  font-size: 14px;
}

.api-key-input {
  font-family: monospace;
}

.text-input:focus,
.api-key-input:focus {
  outline: none;
  border-color: #B432FF;
  box-shadow: 0 0 10px rgba(180, 50, 255, 0.3);
}

.model-section {
  border-top: 1px dashed rgba(0, 217, 255, 0.2);
  padding-top: 12px;
  margin-top: 4px;
}

.model-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  background: transparent;
  border: none;
  color: #00D9FF;
  font-size: 14px;
  cursor: pointer;
  padding: 6px 4px;
}

.chevron {
  transition: transform 0.2s;
  font-size: 10px;
}
.chevron.open {
  transform: rotate(180deg);
}

.model-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
}

.model-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  background: rgba(0, 217, 255, 0.05);
  border: 1px solid rgba(0, 217, 255, 0.2);
  border-radius: 6px;
}

.model-meta {
  display: flex;
  flex-direction: column;
}

.model-name {
  color: #ffffff;
  font-size: 13px;
}

.model-id {
  color: #888;
  font-size: 11px;
  font-family: monospace;
}

.btn-icon {
  background: transparent;
  border: none;
  cursor: pointer;
  color: #888;
  padding: 4px 8px;
  border-radius: 4px;
}
.btn-icon:hover {
  color: #ff8a8a;
  background: rgba(255, 68, 68, 0.1);
}

.empty-models {
  padding: 8px 10px;
  color: #888;
  font-size: 12px;
  font-style: italic;
}

.add-model-row {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}

.model-select {
  flex: 1;
  padding: 8px 10px;
  background: rgba(0, 217, 255, 0.05);
  border: 1px solid rgba(0, 217, 255, 0.4);
  border-radius: 6px;
  color: #ffffff;
  font-size: 13px;
}

.button-group {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.btn-primary,
.btn-secondary,
.btn-danger {
  padding: 10px 18px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s;
  border: none;
}

.btn-primary {
  background: rgba(0, 217, 255, 0.2);
  border: 1px solid #00D9FF;
  color: #00D9FF;
}
.btn-primary:hover:not(:disabled) {
  background: rgba(0, 217, 255, 0.3);
  box-shadow: 0 0 15px rgba(0, 217, 255, 0.4);
}
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: transparent;
  border: 1px solid #666;
  color: #aaa;
}
.btn-secondary:hover:not(:disabled) {
  border-color: #00D9FF;
  color: #00D9FF;
}
.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-danger {
  background: transparent;
  border: 1px solid #ff4444;
  color: #ff8a8a;
}
.btn-danger:hover {
  background: rgba(255, 68, 68, 0.15);
}

.error-message {
  padding: 10px;
  background: rgba(255, 68, 68, 0.1);
  border: 1px solid #ff4444;
  border-radius: 6px;
  color: #ff8a8a;
  font-size: 13px;
}

.success-message {
  padding: 10px;
  background: rgba(0, 255, 136, 0.1);
  border: 1px solid #00ff88;
  border-radius: 6px;
  color: #00ff88;
  font-size: 13px;
}
</style>
