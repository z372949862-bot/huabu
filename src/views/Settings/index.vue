<template>
  <div class="settings">
    <div class="settings-container">
      <div class="settings-header">
        <div>
          <div class="settings-kicker">WORKSPACE SETTINGS</div>
          <h2>中转站设置</h2>
          <p class="settings-subtitle">管理图片、视频和文本服务的连接信息与模型</p>
        </div>
        <button class="back-canvas-button" @click="returnToCanvas">返回当前画布</button>
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
        <button
          class="tab"
          :class="{ active: activeTab === 'text' }"
          @click="activeTab = 'text'"
        >
          💬 文本中转站 ({{ aiStore.textProviders.length }})
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
          <option value="luoci">洛辞 · Seedream 5 Pro Uncensored</option>
          <option value="piapi">PiAPI · Seedream 5 Pro Less Restriction</option>
        </select>
        <select
          v-else-if="activeTab === 'video'"
          v-model="newVideoKind"
          class="kind-select"
          title="选择要添加的中转站类型"
        >
          <option value="seedance">Seedance (火山方舟)</option>
          <option value="chuhaiying">出海营 (Sora 兼容)</option>
          <option value="unmau">New API · Seedance 2.5 (newapis.unmau.com)</option>
          <option value="yu25">YU25 · Seedance (api.yu25.xyz)</option>
          <option value="xinshuju">心数据 · Seedance 2.5 (xinshuju.net)</option>
          <option value="dmxapi">DMXAPI · Seedance 2.5 (dmxapi.cn)</option>
          <option value="qiling">器灵 (api.qilingze.com)</option>
          <option value="fmgo">FMGO API · Feimiao 2.5 (api.fmgo.top)</option>
          <option value="aiide">AIIDE · Seedance 2.5 HC</option>
          <option value="aimi">AIMI · Seedance 2.5 (aimiapi.com)</option>
          <option value="piapi">PiAPI · Seedance 2.5 (api.piapi.ai)</option>
        </select>
        <select
          v-else-if="activeTab === 'text'"
          v-model="newTextKind"
          class="kind-select"
          title="选择文本中转站类型"
        >
          <option value="deepseek">DeepSeek (api.deepseek.com)</option>
          <option value="openaichat">OpenAI 兼容 (geeknow.ai)</option>
        </select>
        <button class="btn-primary add-btn" @click="addProviderClick">
          + 添加{{ activeTab === 'video' ? '视频' : activeTab === 'text' ? '文本' : '图片' }}中转站
        </button>
      </div>

      <div v-if="visibleProviders.length === 0" class="empty-tip">
        还没有{{ activeTab === 'video' ? '视频' : activeTab === 'image' ? '图片' : '文本' }}中转站，点右上角添加
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
                <span class="type-tag" :class="provider.type">{{ provider.type === 'image' ? '图片' : provider.type === 'text' ? '文本' : '视频' }}</span>
                {{ provider.name || '未命名中转站' }}
              </span>
              <span class="status-indicator" :class="getStatusClass(provider.status)"></span>
            </div>
            <span class="status-text">{{ getStatusText(provider.status) }}</span>
          </div>

          <div class="provider-body">
            <p v-if="provider.kind === 'piapi' && provider.type === 'video'" class="empty-tip" style="text-align:left;padding:8px 0;line-height:1.6">
              使用 PiAPI API Key。测试连接只查询账户信息，不生成视频。
              本地素材经官方临时上传服务上传，需要 Creator 或更高套餐；Base64 限 10 MB（原文件约 7.5 MB），直链有效期 24 小时。更大素材或 MOV 请使用公网直链。节点参数卡可勾选「私有资产」或「选择已入库」，等素材 Active 后以 asset:// 引用；私有资产接口另要求 hobbyist 或更高权限，以平台账户实际权限为准。
            </p>
            <p v-if="provider.kind === 'piapi' && provider.type === 'image'" class="empty-tip" style="text-align:left;padding:8px 0;line-height:1.6">
              Seedream 5 Pro Less Restriction：支持文生图、最多 10 张参考图编辑、1K / 2K。使用 PiAPI API Key，测试连接只查询账户信息。参考图需要公网直链；本地文件先经官方临时上传，需 Creator 或更高权限，原文件约限 7.5 MB。图片接口不使用 Seedance 私有资产 ID。
            </p>
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
                title="验证当前中转站的地址和 API Key，不会生成内容"
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
            <p class="connection-help">测试连接只验证认证信息，不会生成图片或视频。</p>

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
import { useRouter } from 'vue-router'
import { useAIStore } from '@/stores/ai'
import { useNodeStore } from '@/stores/node'
import type { ProviderStatus, Provider } from '@/stores/ai'
import { getModelTemplatesByKind, type VideoProviderKind } from '@/services/modelTemplates'

onErrorCaptured((err) => {
  console.error('[Settings] render error:', err)
  return false // 阻止向上冒泡，避免白屏
})

const aiStore = useAIStore()
const nodeStore = useNodeStore()
const router = useRouter()
const returnToCanvas = () => {
  const projectId = nodeStore.currentProjectId || undefined
  router.push(projectId ? { path: '/nodes', query: { project: projectId } } : '/nodes')
}

const activeTab = ref<'video' | 'image' | 'text'>('video')
// 添加图片中转站时选哪种 kind；默认 chuhaiying（最新接入）
const newImageKind = ref<'geeknow' | 'chuhaiying' | 'luoci'>('chuhaiying')
// 添加文本中转站时选哪种 kind
const newTextKind = ref<'deepseek' | 'openaichat'>('deepseek')
// 添加视频中转站时选哪种 kind；默认 seedance（最常用）
const newVideoKind = ref<VideoProviderKind>('seedance')

const visibleProviders = computed(() =>
  activeTab.value === 'video' ? aiStore.videoProviders
  : activeTab.value === 'image' ? aiStore.imageProviders
  : aiStore.textProviders
)

const isDefault = (p: Provider) =>
  (p.type === 'image' ? aiStore.defaultImageProviderId : p.type === 'text' ? aiStore.defaultTextProviderId : aiStore.defaultProviderId) === p.id

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
  return provider.type === 'video'
    ? getModelTemplatesByKind((provider.kind || 'seedance') as VideoProviderKind).filter((t) => !existing.has(t.id))
    : []
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
    const baseName = kind === 'piapi' ? 'PiAPI · Seedream 5 Pro' : kind === 'chuhaiying' ? '出海营' : kind === 'luoci' ? '洛辞 API' : 'GeekNow'
    const existingCount = aiStore.imageProviders.filter((p) => (p.kind || 'geeknow') === kind).length
    aiStore.addProvider({
      name: `${baseName}${existingCount > 0 ? ` ${existingCount + 1}` : ''}`,
      type: 'image',
      kind,
    })
  } else if (activeTab.value === 'text') {
    const kind = newTextKind.value
    const baseName = kind === 'deepseek' ? 'DeepSeek' : 'OpenAI Chat'
    const existingCount = aiStore.textProviders.filter((p) => p.kind === kind).length
    aiStore.addProvider({
      name: `${baseName}${existingCount > 0 ? ` ${existingCount + 1}` : ''}`,
      type: 'text',
      kind,
    })
  } else {
    const kind = newVideoKind.value
    const baseName = kind === 'aiide'
      ? 'AIIDE · Seedance 2.5 HC'
      : kind === 'piapi'
        ? 'PiAPI · Seedance 2.5'
      : kind === 'aimi'
      ? 'AIMI · Seedance 2.5'
      : kind === 'unmau'
      ? 'New API · Seedance 2.5'
      : kind === 'fmgo'
        ? 'FMGO API · Feimiao 2.5'
      : kind === 'xinshuju'
        ? '心数据 · Seedance 2.5'
      : kind === 'dmxapi'
        ? 'DMXAPI · Seedance 2.5'
      : kind === 'yu25'
        ? 'YU25 · Seedance'
        : kind === 'chuhaiying'
          ? '出海营视频'
          : kind === 'qiling'
            ? '器灵'
            : 'Seedance'
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
  max-width: 1180px;
  margin: 0 auto;
  padding: 40px 20px;
}

.settings-header {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.settings-kicker { color: rgba(255,255,255,.38); font-size: 11px; letter-spacing: .12em; }
.settings-subtitle { margin: 6px 0 0; color: rgba(255,255,255,.46); font-size: 13px; }
.back-canvas-button { padding: 9px 14px; border: 1px solid rgba(255,255,255,.18); border-radius: 8px; color: rgba(255,255,255,.82); background: rgba(255,255,255,.08); cursor: pointer; font: inherit; }
.back-canvas-button:hover { background: rgba(255,255,255,.15); border-color: rgba(255,255,255,.34); }

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
  white-space: nowrap;
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
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
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
.connection-help { margin: -7px 0 0; color: rgba(255,255,255,.34); font-size: 11px; }

/* 统一为画布使用的中性灰白层级。 */
.settings { background: #111214; }
.settings-header h2 { margin: 4px 0 0; color: #f1f1f1; font-size: 26px; font-weight: 500; }
.tabs { padding: 8px; border: 1px solid rgba(255,255,255,.10); border-bottom: 1px solid rgba(255,255,255,.10); border-radius: 12px; background: rgba(255,255,255,.035); }
.tab.active { color: #fff; border-color: rgba(255,255,255,.24); background: rgba(255,255,255,.12); }
.provider-card { padding: 18px; border-color: rgba(255,255,255,.11); background: rgba(255,255,255,.035); box-shadow: 0 8px 28px rgba(0,0,0,.16); }
.provider-card:has(.star) { border-color: rgba(255,255,255,.28); box-shadow: 0 8px 28px rgba(0,0,0,.22); }
.provider-header { border-bottom-color: rgba(255,255,255,.10); }
.input-group label, .model-toggle { color: rgba(255,255,255,.60); }
.text-input, .api-key-input, .model-select { border-color: rgba(255,255,255,.16); background: rgba(0,0,0,.18); }
.text-input:focus, .api-key-input:focus { border-color: rgba(255,255,255,.44); box-shadow: 0 0 0 3px rgba(255,255,255,.06); }
.btn-primary { border-color: rgba(255,255,255,.28); color: #fff; background: rgba(255,255,255,.12); }
.btn-primary:hover:not(:disabled) { background: rgba(255,255,255,.20); box-shadow: none; }
.btn-secondary:hover:not(:disabled) { border-color: rgba(255,255,255,.42); color: #fff; }
.kind-select { color: rgba(255,255,255,.86); background: rgba(255,255,255,.06); border-color: rgba(255,255,255,.22); }
.kind-select:hover, .kind-select:focus { color: #fff; background: rgba(255,255,255,.11); border-color: rgba(255,255,255,.42); box-shadow: none; }
.kind-select option { color: #f1f1f1; background: #242526; }
.empty-tip { color: rgba(255,255,255,.54); border-color: rgba(255,255,255,.18); background: rgba(255,255,255,.025); }
.empty-tip::selection { background: rgba(255,255,255,.20); }
@media (max-width: 640px) { .settings-container { padding: 24px 16px; } .settings-header { align-items: flex-start; flex-direction: column; gap: 14px; } .settings-content { grid-template-columns: 1fr; } .tab-spacer { display: none; } .tabs { flex-wrap: wrap; } }
</style>
