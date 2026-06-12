<template>
  <div class="custom-node" :class="{ selected: isSelected }">
    <!-- 节点主体 - 动态尺寸 -->
    <div class="node-main" @click.stop="selectNode" :style="{ width: nodeSize.width + 'px', height: nodeSize.height + 'px' }">
      <div class="node-content" :class="{ generating: data.status === 'running' }">
        <!-- 素材引用节点 - 显示上传的素材 -->
        <template v-if="type === 'asset-ref' && data.assetUrl">
          <img v-if="data.assetType === 'image'" :src="data.assetUrl" class="asset-preview" />
          <video v-else-if="data.assetType === 'video'" :src="data.assetUrl" class="asset-preview" controls />
          <div v-else-if="data.assetType === 'audio'" class="audio-preview">
            <svg xmlns="http://www.w3.org/2000/svg" width="90" height="90" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
            </svg>
            <audio :src="data.assetUrl" controls class="audio-controls" />
          </div>
        </template>

        <!-- AI绘图节点 -->
        <template v-else-if="type === 'ai-image'">
          <!-- 错误态 - 显示报错信息 -->
          <div v-if="data.status === 'error' && data.error" class="error-display">
            <div class="error-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ff4444" stroke-width="1.5"><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" fill="rgba(255,68,68,0.15)"/></svg></div>
            <div class="error-text">{{ data.error }}</div>
          </div>
          <!-- 生成中 - 显示进度 -->
          <div v-else-if="data.status === 'running'" class="progress-display">
            <div class="progress-number">{{ data.progress || 0 }}%</div>
            <div class="progress-text">生成中...</div>
          </div>
          <!-- 已完成 - 显示生成的图片，点击预览 -->
          <div v-else-if="data.status === 'completed' && data.outputImage" class="image-thumbnail" @click.stop="previewImage">
            <img :src="data.outputImage" class="generated-preview" />
            <div class="preview-overlay">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="white" stroke-width="2" fill="none" stroke-linecap="round"/>
              </svg>
            </div>
          </div>
          <!-- 默认 - 显示图标 -->
          <div v-else class="node-icon-large">
            <svg xmlns="http://www.w3.org/2000/svg" width="90" height="90" viewBox="0 0 66 66" fill="currentColor">
              <path d="M26.4648 19.2146C26.9874 18.431 28.1396 18.4309 28.6621 19.2146L40.8262 37.4607L44.5361 32.0056C45.06 31.2354 46.1959 31.2353 46.7197 32.0056L55.4453 44.8376C56.041 45.7138 55.4139 46.8998 54.3545 46.9001H10.4746C9.42048 46.9001 8.79159 45.7256 9.37598 44.8484L26.4648 19.2146Z"/>
              <circle cx="42.24" cy="20.46" r="3.96"/>
            </svg>
          </div>
        </template>

        <!-- AI视频节点 -->
        <template v-else-if="type === 'ai-video'">
          <!-- 错误态 - 显示报错信息 -->
          <div v-if="data.status === 'error' && data.error" class="error-display">
            <div class="error-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ff4444" stroke-width="1.5"><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" fill="rgba(255,68,68,0.15)"/></svg></div>
            <div class="error-text">{{ data.error }}</div>
          </div>
          <!-- 生成中 - 显示进度 -->
          <div v-else-if="data.status === 'running'" class="progress-display">
            <div class="progress-number">{{ data.progress || 0 }}%</div>
            <div class="progress-text">生成中...</div>
          </div>
          <!-- 已完成 - 显示视频首帧，点击播放 -->
          <div v-else-if="data.status === 'completed' && data.outputVideo" class="video-thumbnail" @click.stop="playVideo">
            <video
              ref="videoThumbnailRef"
              :src="data.outputVideo"
              class="generated-preview"
              preload="metadata"
              @loadedmetadata="onVideoLoaded"
            />
            <div class="play-overlay">
              <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 16 16" fill="white">
                <path d="M4.66699 2.64248C4.66717 1.82358 5.59736 1.35167 6.25781 1.83584L13.5674 7.19619C14.1117 7.59579 14.1118 8.40897 13.5674 8.8085L6.25781 14.1688C5.59734 14.6528 4.6671 14.1811 4.66699 13.3622V2.64248Z"/>
              </svg>
            </div>
          </div>
          <!-- 默认 - 显示图标 -->
          <div v-else class="node-icon-large">
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.66699 2.64248C4.66717 1.82358 5.59736 1.35167 6.25781 1.83584L13.5674 7.19619C14.1117 7.59579 14.1118 8.40897 13.5674 8.8085L6.25781 14.1688C5.59734 14.6528 4.6671 14.1811 4.66699 13.3622V2.64248Z"/>
            </svg>
          </div>
        </template>

        <!-- AI文本节点 -->
        <template v-else-if="type === 'ai-text'">
          <div v-if="data.status === 'error' && data.error" class="error-display">
            <div class="error-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ff4444" stroke-width="1.5"><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" fill="rgba(255,68,68,0.15)"/></svg></div>
            <div class="error-text">{{ data.error }}</div>
          </div>
          <div v-else-if="data.status === 'running'" class="progress-display">
            <div class="progress-number">{{ data.progress || 0 }}%</div>
            <div class="progress-text">思考中...</div>
          </div>
          <div v-else-if="data.status === 'completed' && data.outputText" class="text-result-display" @click.stop="showTextModal = true">
            <div class="text-result-content">{{ truncateText(data.outputText, 150) }}</div>
            <div class="text-result-hint">查看全文 →</div>
          </div>
          <div v-else class="node-icon-large">
            <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 6h16M4 12h10M4 18h14"/></svg>
          </div>
        </template>

        <!-- 其他节点类型 -->
        <template v-else>
          <div class="node-icon-large">
            <span>{{ icon }}</span>
          </div>
        </template>
      </div>

      <!-- 节点类型标签 -->
      <div class="node-type-label">{{ typeLabel }}</div>

      <!-- 状态指示 -->
      <div v-if="data.status !== 'idle'" class="node-status-badge" :class="'status-' + data.status">
        {{ statusText }}
      </div>

      <!-- 生成中边框光效 -->
      <div v-if="data.status === 'running'" class="node-glow"></div>
    </div>

    <!-- 生成卡片 - 选中时在底部展开 -->
    <transition name="expand">
      <div v-show="isSelected" class="generator-card">
        <div class="generator-content">
          <!-- 历史缩略图条（图片/视频节点才显示，且有历史时才显示） -->
          <div v-if="nodeHistory.length > 0" class="history-strip">
            <div class="history-label">历史 ({{ nodeHistory.length }})</div>
            <div class="history-scroller">
              <div
                v-for="asset in nodeHistory"
                :key="asset.id"
                class="history-thumb"
                :class="{ active: asset.url === currentOutputUrl }"
                :title="asset.prompt"
                @click.stop="switchToHistoryAsset(asset)"
              >
                <img v-if="asset.type === 'image'" :src="asset.url" class="history-thumb-media" />
                <video v-else :src="asset.url" class="history-thumb-media" preload="metadata" muted />
                <button
                  class="history-thumb-delete"
                  title="从历史中删除"
                  @click.stop="deleteHistoryAsset(asset.id)"
                ><svg viewBox="0 0 16 16" width="8" height="8" stroke="currentColor" stroke-width="3" fill="none"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg></button>
              </div>
            </div>
          </div>

          <!-- 视频节点选项卡 -->
          <div v-if="type === 'ai-video'" class="generator-tabs">
            <button
              v-for="tab in videoTabs"
              :key="tab.value"
              :class="['tab-btn', { active: currentTab === tab.value, disabled: tab.disabled }]"
              @click.stop="!tab.disabled && (currentTab = tab.value)"
              :disabled="tab.disabled"
            >
              {{ tab.label }}
            </button>
          </div>

          <!-- 素材缩略图区域 -->
          <div v-if="(type === 'ai-video' || type === 'ai-image') && filteredAssetsForNode.length > 0" class="assets-preview">
            <div class="asset-item" v-for="asset in filteredAssetsForNode" :key="asset.id">
              <!-- 图片缩略图 -->
              <div v-if="asset.type === 'image'" class="asset-thumbnail">
                <img :src="asset.url" :alt="asset.name" />
                <div v-if="asset.fromNode" class="node-badge">节点</div>
                <button class="asset-remove" @click.stop="asset.fromNode ? removeConnectedAsset(asset.id) : removeAsset(asset.id)"><svg viewBox="0 0 16 16" width="10" height="10" stroke="currentColor" stroke-width="2.5" fill="none"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg></button>
              </div>

              <!-- 视频缩略图 -->
              <div v-else-if="asset.type === 'video'" class="asset-thumbnail video">
                <video :src="asset.url" />
                <div class="video-overlay">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 16 16" fill="white">
                    <path d="M4.66699 2.64248C4.66717 1.82358 5.59736 1.35167 6.25781 1.83584L13.5674 7.19619C14.1117 7.59579 14.1118 8.40897 13.5674 8.8085L6.25781 14.1688C5.59734 14.6528 4.6671 14.1811 4.66699 13.3622V2.64248Z"/>
                  </svg>
                </div>
                <div v-if="asset.fromNode" class="node-badge">节点</div>
                <button class="asset-remove" @click.stop="asset.fromNode ? removeConnectedAsset(asset.id) : removeAsset(asset.id)"><svg viewBox="0 0 16 16" width="10" height="10" stroke="currentColor" stroke-width="2.5" fill="none"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg></button>
              </div>

              <!-- 音频缩略图 -->
              <div v-else class="asset-thumbnail audio">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                </svg>
                <div v-if="asset.fromNode" class="node-badge">节点</div>
                <button class="asset-remove" @click.stop="asset.fromNode ? removeConnectedAsset(asset.id) : removeAsset(asset.id)"><svg viewBox="0 0 16 16" width="10" height="10" stroke="currentColor" stroke-width="2.5" fill="none"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg></button>
              </div>
            </div>

            <!-- 上传按钮 -->
            <label class="asset-upload">
              <input
                type="file"
                :accept="type === 'ai-image' ? 'image/*' : 'image/*,video/*,audio/*'"
                multiple
                @change="handleFileUpload"
                style="display: none"
              />
              <div class="upload-icon">+</div>
            </label>
          </div>

          <!-- 首次上传按钮（无素材时） -->
          <div v-if="shouldShowUploadPrompt" class="upload-prompt">
            <label class="upload-prompt-btn">
              <input
                type="file"
                :accept="type === 'ai-image' ? 'image/*' : 'image/*,video/*,audio/*'"
                multiple
                @change="handleFileUpload"
                style="display: none"
              />
              <div class="upload-icon">+</div>
            </label>
          </div>

          <!-- 富文本提示词输入 -->
          <div
            ref="editableRef"
            contenteditable="true"
            @input="handleContentEdit"
            @click.stop
            @mousedown="(e) => e.stopPropagation()"
            class="generator-input editable"
            data-placeholder="描述你想要生成的画面内容，输入 @ 引用素材..."
          ></div>

          <!-- @ 提及素材列表 -->
          <transition name="mention">
            <div
              v-if="showAssetMention && allAssets.length > 0"
              class="asset-mention-list"
              :style="{ top: mentionPosition.top + 'px', left: mentionPosition.left + 'px' }"
              @click.stop
            >
              <div
                v-for="asset in filteredAssets"
                :key="asset.id"
                class="mention-item"
                @click="insertAssetBadge(asset)"
              >
                <div class="mention-thumbnail">
                  <img v-if="asset.type === 'image'" :src="asset.url" alt="" />
                  <video v-else-if="asset.type === 'video'" :src="asset.url" />
                  <svg v-else xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                  </svg>
                </div>
                <div class="mention-info">
                  <div class="mention-name">{{ asset.name }}</div>
                  <div class="mention-type">{{ asset.type }}</div>
                </div>
              </div>
            </div>
          </transition>

          <div class="generator-footer">
            <div class="generator-options">
              <!-- 视频节点：中转站 + 模型 + 比例选择器 -->
              <template v-if="type === 'ai-video'">
                <ProviderSelector v-model="selectedProviderId" :providers="providerOptions" placement="up" />
                <ModelSelector v-model="selectedModel" :models="availableModels" label="视频模型" placement="up" />
                <RatioSelector
                  v-model="selectedRatio"
                  :capabilities="currentModelCapabilities"
                  :resolution="data.resolution"
                  :duration="data.duration"
                  :audio="data.generateAudio"
                  @update:resolution="onResolutionChange"
                  @update:duration="onDurationChange"
                  @update:audio="onAudioChange"
                />
              </template>

              <!-- 图片节点：中转站 + 模型 + 比例 -->
              <template v-else-if="type === 'ai-image'">
                <ProviderSelector v-model="selectedProviderId" :providers="imageProviderOptions" placement="up" />
                <ModelSelector v-model="selectedModel" :models="availableImageModels" label="图片模型" placement="up" />
                <RatioSelector v-model="selectedRatio" :capabilities="currentModelCapabilities" :resolution="data.resolution" @update:resolution="onResolutionChange" />
              </template>

              <!-- 文本节点：中转站 + 模型选择 -->
              <template v-else-if="type === 'ai-text'">
                <ProviderSelector v-model="selectedProviderId" :providers="textProviderOptions" placement="up" />
                <ModelSelector v-model="selectedModel" :models="availableTextModels" label="文本模型" placement="up" />
              </template>

              <!-- 其他节点：简单按钮 -->
              <button v-else class="option-btn">
                <span>选项</span>
                <span class="chevron">▼</span>
              </button>
            </div>

            <button
              class="generate-btn"
              @click.stop="executeNode"
              :disabled="data.status === 'running'"
            >
              <svg v-if="data.status !== 'running'" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.66699 2.64248C4.66717 1.82358 5.59736 1.35167 6.25781 1.83584L13.5674 7.19619C14.1117 7.59579 14.1118 8.40897 13.5674 8.8085L6.25781 14.1688C5.59734 14.6528 4.6671 14.1811 4.66699 13.3622V2.64248Z"/>
              </svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2 2h4v12H2V2zm8 0h4v12h-4V2z"/>
              </svg>
            </button>
          </div>

          <!-- 进度条 -->
          <div v-if="data.progress !== undefined && data.status === 'running'" class="progress-bar">
            <div class="progress-fill" :style="{ width: data.progress + '%' }"></div>
          </div>
        </div>
      </div>
    </transition>

    <!-- 连接点 -->
    <Handle type="target" :position="Position.Left" id="target" class="custom-handle" />
    <Handle type="source" :position="Position.Right" id="source" class="custom-handle" />

    <!-- 视频播放弹窗 -->
    <Teleport to="body">
      <div v-if="showVideoModal" class="video-modal-overlay" @click="closeVideo">
        <div class="video-modal-content" @click.stop>
          <div class="modal-toolbar">
            <button class="modal-download" @click="downloadAsset(data.outputVideo, 'video')">⬇ 下载</button>
            <button class="video-modal-close" @click="closeVideo"><svg viewBox="0 0 16 16" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg></button>
          </div>
          <video
            ref="videoPlayerRef"
            :src="data.outputVideo"
            class="video-modal-player"
            controls
            autoplay
          />
        </div>
      </div>
    </Teleport>

    <!-- 图片预览弹窗 -->
    <Teleport to="body">
      <div v-if="showImageModal" class="image-modal-overlay" @click="closeImage">
        <div class="image-modal-content" @click.stop>
          <div class="modal-toolbar">
            <button class="modal-download" @click="downloadAsset(data.outputImage, 'image')">⬇ 下载</button>
            <button class="image-modal-close" @click="closeImage"><svg viewBox="0 0 16 16" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg></button>
          </div>
          <img
            :src="data.outputImage"
            class="image-modal-preview"
          />
        </div>
      </div>
    </Teleport>

    <!-- 文本查看弹窗 -->
    <Teleport to="body">
      <div v-if="showTextModal" class="text-modal-overlay" @click="showTextModal = false">
        <div class="text-modal-content" @click.stop>
          <div class="modal-toolbar">
            <button class="modal-download" @click="copyTextToClipboard(data.outputText)">📋 复制全文</button>
            <button class="text-modal-close" @click="showTextModal = false">
              <svg viewBox="0 0 16 16" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg>
            </button>
          </div>
          <div class="text-modal-body">{{ data.outputText }}</div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style>
/* 全局样式 - 用于动态创建的徽章元素 */
.asset-badge {
  display: inline-flex !important;
  align-items: center !important;
  gap: 4px !important;
  padding: 2px 8px !important;
  background: rgba(0, 217, 255, 0.15) !important;
  border: 1px solid rgba(0, 217, 255, 0.3) !important;
  border-radius: 12px !important;
  color: #00D9FF !important;
  font-size: 12px !important;
  vertical-align: middle !important;
  margin: 0 2px !important;
  cursor: default !important;
  user-select: none !important;
  max-height: 24px !important;
}

.asset-badge img,
.badge-thumbnail {
  width: 16px !important;
  height: 16px !important;
  max-width: 16px !important;
  max-height: 16px !important;
  min-width: 16px !important;
  min-height: 16px !important;
  object-fit: cover !important;
  border-radius: 2px !important;
  flex-shrink: 0 !important;
  display: block !important;
}

.badge-icon {
  width: 12px !important;
  height: 12px !important;
  flex-shrink: 0 !important;
}

.badge-name {
  max-width: 100px !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}
</style>

<script setup lang="ts">
import { ref, computed, watch, provide, onMounted, nextTick } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { useNodeStore } from '@/stores/node'
import { useAIStore } from '@/stores/ai'
import { useAssetStore, type GeneratedAsset } from '@/stores/asset'
import RatioSelector from './RatioSelector.vue'
import ModelSelector from './ModelSelector.vue'
import ProviderSelector from './ProviderSelector.vue'
import type { VideoModelCapabilities } from '@/services/videoModelService'

interface Props {
  id: string
  type: string
  data: {
    label: string
    status?: string
    prompt?: string
    progress?: number
  }
}

const props = defineProps<Props>()
const nodeStore = useNodeStore()
const aiStore = useAIStore()
const assetStore = useAssetStore()

const localPrompt = ref(props.data.prompt || '')
const isSelected = computed(() => nodeStore.selectedNodeId === props.id)
const currentTab = ref('text-to-video')
// 比例从节点 data.ratio 恢复（没有才用默认 16:9）；否则切走再切回会丢失用户选择
const selectedRatio = ref<string>((props.data as any).ratio || '16:9')
// 视频/图片节点共用：先取节点 data 里的 providerId，否则按类型用全局默认
const selectedProviderId = ref<string>(
  (props.data as any).providerId
  || (props.type === 'ai-image' ? aiStore.defaultImageProviderId : aiStore.defaultProviderId)
  || ''
)
// 模型 ID 从节点 data.model 或所选中转站的第一个模型推导
const selectedModel = ref<string>((props.data as any).model || '')
// 视频节点的模型列表跟随当前选中的中转站
const availableModels = computed(() => {
  const config = aiStore.getProviderConfig(selectedProviderId.value)
  return config?.models ?? []
})
// 图片节点的模型列表跟随选中的图片中转站
const availableImageModels = computed(() => {
  const config = aiStore.getProviderConfig(selectedProviderId.value)
  return config?.models ?? []
})
// 视频中转站下拉用
const providerOptions = computed(() =>
  aiStore.videoProviders.map((p) => ({
    id: p.id,
    name: p.name,
    baseUrl: p.baseUrl,
    status: p.status,
    isDefault: p.id === aiStore.defaultProviderId,
  }))
)
// 图片中转站下拉用
const imageProviderOptions = computed(() =>
  aiStore.imageProviders.map((p) => ({
    id: p.id,
    name: p.name,
    baseUrl: p.baseUrl,
    status: p.status,
    isDefault: p.id === aiStore.defaultImageProviderId,
  }))
)
// 切中转站时，若新中转站没有当前模型，自动选第一个
watch(selectedProviderId, (newId) => {
  const models = aiStore.getProviderConfig(newId)?.models ?? []
  if (!models.find((m) => m.id === selectedModel.value)) {
    selectedModel.value = models[0]?.id ?? ''
  }
  // 把中转站的选择同步回 store，避免切节点后丢失
  nodeStore.updateNodeData(props.id, { providerId: newId, model: selectedModel.value })
})

// 模型 / 比例的变化也立刻同步回 store（之前只有点生成按钮时才写回，
// 切节点 → 切回来就丢了用户的选择）
watch(selectedModel, (newModel) => {
  nodeStore.updateNodeData(props.id, { model: newModel })
})
watch(selectedRatio, (newRatio) => {
  nodeStore.updateNodeData(props.id, { ratio: newRatio })
})
// store 里的中转站若被外部修改（删/改），保险兜底
watch(
  () => aiStore.providers.map((p) => p.id).join(','),
  () => {
    if (!aiStore.getProviderConfig(selectedProviderId.value)) {
      selectedProviderId.value =
        (props.type === 'ai-image' ? aiStore.defaultImageProviderId : aiStore.defaultProviderId)
        || ''
    }
  }
)
// 文本节点
const showTextModal = ref(false)
const textProviderOptions = computed(() =>
  aiStore.textProviders.map((p) => ({
    id: p.id,
    name: p.name,
    baseUrl: p.baseUrl,
    status: p.status,
    isDefault: p.id === aiStore.defaultTextProviderId,
  }))
)
const availableTextModels = computed(() => {
  const config = aiStore.getProviderConfig(selectedProviderId.value)
  return config?.models ?? []
})

function truncateText(text: string | undefined, maxLen: number): string {
  if (!text) return ''
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text
}

async function copyTextToClipboard(text: string | undefined) {
  if (!text) return
  try { await navigator.clipboard.writeText(text) } catch { /* ignore */ }
}

const uploadedAssets = ref<Array<{ id: string; type: 'image' | 'video' | 'audio'; url: string; name: string }>>([])

// @ 提及功能
const showAssetMention = ref(false)
const mentionPosition = ref({ top: 0, left: 0 })
const mentionFilter = ref('')
const editableRef = ref<HTMLDivElement>()

// 手动聚焦函数
const focusEditable = () => {
  if (editableRef.value) {
    editableRef.value.focus()
    // 将光标移到末尾
    const range = document.createRange()
    const sel = window.getSelection()
    if (editableRef.value.childNodes.length > 0) {
      const lastNode = editableRef.value.childNodes[editableRef.value.childNodes.length - 1]
      range.setStartAfter(lastNode)
    } else {
      range.selectNodeContents(editableRef.value)
    }
    range.collapse(false)
    sel?.removeAllRanges()
    sel?.addRange(range)
  }
}

// 处理contenteditable输入
const handleContentEdit = (event: Event) => {
  const div = event.target as HTMLDivElement

  // 获取纯文本内容（用于保存）
  localPrompt.value = extractTextContent(div)
  // 立刻写回 store，否则切换节点时 vue-flow 重建 DOM 会丢失未保存的文本
  updatePrompt()

  // 检测@触发
  checkForMention(div)
}

// 提取纯文本和引用标记
const extractTextContent = (div: HTMLDivElement): string => {
  let text = ''
  div.childNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement
      if (el.classList.contains('asset-badge')) {
        const assetId = el.getAttribute('data-asset-id')
        const assetName = el.getAttribute('data-asset-name')
        text += `@[${assetName}](${assetId})`
      } else {
        text += el.textContent
      }
    }
  })
  return text
}

// 检测@触发提及
const checkForMention = (div: HTMLDivElement) => {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return

  const range = sel.getRangeAt(0)
  const textNode = range.startContainer

  if (textNode.nodeType === Node.TEXT_NODE) {
    const text = textNode.textContent || ''
    const offset = range.startOffset
    const textBefore = text.substring(0, offset)
    const lastAtIndex = textBefore.lastIndexOf('@')

    if (lastAtIndex !== -1) {
      const textAfter = textBefore.substring(lastAtIndex + 1)
      if (!textAfter.includes(' ') && textAfter.length <= 20) {
        mentionFilter.value = textAfter
        showAssetMention.value = allAssets.value.length > 0

        // 计算位置
        const rect = div.getBoundingClientRect()
        const card = div.closest('.generator-card') as HTMLElement
        if (card) {
          const cardRect = card.getBoundingClientRect()
          mentionPosition.value = {
            top: rect.top - cardRect.top - 210,
            left: rect.left - cardRect.left + 10
          }
        }
        return
      }
    }
  }

  showAssetMention.value = false
}

// 处理按键
const handleKeyDown = (event: KeyboardEvent) => {
  // 只阻止冒泡，不阻止默认行为
  event.stopPropagation()
}

// 插入素材徽章
const insertAssetBadge = (asset: any) => {
  const div = editableRef.value
  if (!div) return

  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return

  const range = sel.getRangeAt(0)

  // 删除@和已输入的文字
  const textNode = range.startContainer
  if (textNode.nodeType === Node.TEXT_NODE && textNode.textContent) {
    const offset = range.startOffset
    const text = textNode.textContent
    const lastAtIndex = text.lastIndexOf('@', offset - 1)

    if (lastAtIndex !== -1) {
      range.setStart(textNode, lastAtIndex)
      range.deleteContents()
    }
  }

  // 创建徽章元素
  const badge = document.createElement('span')
  badge.className = 'asset-badge'
  badge.contentEditable = 'false'
  badge.setAttribute('data-asset-id', asset.id)
  badge.setAttribute('data-asset-name', asset.name)

  // 添加缩略图/图标
  if (asset.type === 'image') {
    const img = document.createElement('img')
    img.src = asset.url
    img.className = 'badge-thumbnail'
    badge.appendChild(img)
  } else if (asset.type === 'video') {
    badge.innerHTML += '<svg class="badge-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4.66699 2.64248C4.66717 1.82358 5.59736 1.35167 6.25781 1.83584L13.5674 7.19619C14.1117 7.59579 14.1118 8.40897 13.5674 8.8085L6.25781 14.1688C5.59734 14.6528 4.6671 14.1811 4.66699 13.3622V2.64248Z"/></svg>'
  } else {
    badge.innerHTML += '<svg class="badge-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>'
  }

  const nameSpan = document.createElement('span')
  nameSpan.className = 'badge-name'
  nameSpan.textContent = asset.name
  badge.appendChild(nameSpan)

  // 插入徽章和空格
  range.insertNode(badge)
  range.collapse(false)

  const space = document.createTextNode(' ')
  range.insertNode(space)
  range.setStartAfter(space)
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)

  showAssetMention.value = false

  // 更新localPrompt
  localPrompt.value = extractTextContent(div)
  updatePrompt()
}

// 过滤素材列表
const filteredAssets = computed(() => {
  if (!mentionFilter.value) return allAssets.value
  return allAssets.value.filter(asset =>
    asset.name.toLowerCase().includes(mentionFilter.value.toLowerCase())
  )
})

// 将存储格式 @[name](id) 还原为徽章 HTML
function promptTextToHtml(text: string): string {
  if (!text) return ''
  return text.replace(
    /@\[([^\]]+)\]\(([^)]+)\)/g,
    (_match, name, assetId) => {
      const asset = allAssets.value.find(a => a.id === assetId)
      if (!asset) return _match
      let thumbnail = ''
      if (asset.type === 'image') {
        thumbnail = `<img src="${asset.url.replace(/"/g, '&quot;')}" class="badge-thumbnail" />`
      } else if (asset.type === 'video') {
        thumbnail = `<svg class="badge-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4.66699 2.64248C4.66717 1.82358 5.59736 1.35167 6.25781 1.83584L13.5674 7.19619C14.1117 7.59579 14.1118 8.40897 13.5674 8.8085L6.25781 14.1688C5.59734 14.6528 4.6671 14.1811 4.66699 13.3622V2.64248Z"/></svg>`
      } else {
        thumbnail = `<svg class="badge-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`
      }
      return `<span class="asset-badge" contenteditable="false" data-asset-id="${assetId}" data-asset-name="${name}">${thumbnail}<span class="badge-name">${name}</span></span>`
    }
  )
}

// 初始化
onMounted(async () => {
  // 先从持久化数据恢复本地上传的素材（必须在 promptTextToHtml 之前，否则查不到资产）
  const saved = (props.data as any)._uploads as Array<{ id: string; type: 'image' | 'video' | 'audio'; url: string; name: string }> | undefined
  if (saved?.length) {
    uploadedAssets.value = saved.map(a => ({
      ...a,
      url: filePathToUrl(a.url),
    }))
  }
  // 恢复提示词中的 @[name](id) 徽章（此时 allAssets 已包含上传的素材）
  if (editableRef.value && localPrompt.value) {
    editableRef.value.innerHTML = promptTextToHtml(localPrompt.value)
  }
  // 节点装载后兜底：providerId 不在 store 中就用默认；模型不在中转站里就用第一个
  const isImage = props.type === 'ai-image'
  const isVideo = props.type === 'ai-video'
  const isText = props.type === 'ai-text'
  if (isText) {
    if (!aiStore.getProviderConfig(selectedProviderId.value)) {
      selectedProviderId.value = aiStore.defaultTextProviderId || ''
    }
    const models = aiStore.getProviderConfig(selectedProviderId.value)?.models ?? []
    if (!models.find((m) => m.id === selectedModel.value)) {
      selectedModel.value = models[0]?.id ?? ''
    }
  }
  if (isImage || isVideo) {
    if (!aiStore.getProviderConfig(selectedProviderId.value)) {
      selectedProviderId.value =
        (isImage ? aiStore.defaultImageProviderId : aiStore.defaultProviderId) || ''
    }
    const models = aiStore.getProviderConfig(selectedProviderId.value)?.models ?? []
    if (!models.find((m) => m.id === selectedModel.value)) {
      selectedModel.value = models[0]?.id ?? ''
    }
  }
})


// 监听选中状态，选中时聚焦输入框
watch(() => isSelected.value, (selected) => {
  if (selected) {
    // 使用nextTick和多次尝试确保聚焦
    nextTick(() => {
      setTimeout(() => {
        focusEditable()
      }, 350)
    })
  }
})

// 插入素材引用
const insertAssetMention = (asset: any) => {
  if (!textareaRef.value) return

  const textarea = textareaRef.value
  const cursorPos = textarea.selectionStart
  const textBeforeCursor = textarea.value.substring(0, cursorPos)
  const textAfterCursor = textarea.value.substring(cursorPos)

  // 找到最后一个 @
  const lastAtIndex = textBeforeCursor.lastIndexOf('@')
  if (lastAtIndex !== -1) {
    const beforeAt = textBeforeCursor.substring(0, lastAtIndex)
    const mentionTag = `@[${asset.name}](${asset.id})`
    localPrompt.value = beforeAt + mentionTag + textAfterCursor

    // 更新光标位置
    const newCursorPos = (beforeAt + mentionTag).length
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(newCursorPos, newCursorPos)
    }, 0)
  }

  showAssetMention.value = false
  updatePrompt()
}

// 获取提示词中已引用的素材
const referencedAssets = computed(() => {
  if (!localPrompt.value) return []

  const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g
  const references: any[] = []
  let match

  while ((match = mentionRegex.exec(localPrompt.value)) !== null) {
    const assetId = match[2]
    const asset = allAssets.value.find(a => a.id === assetId)
    if (asset && !references.find(r => r.id === asset.id)) {
      references.push(asset)
    }
  }

  return references
})

/** Windows 绝对路径 → local-upload:/// 自定义协议 URL（三斜杠标准格式） */
function filePathToUrl(filePath: string): string {
  if (!filePath) return filePath
  // 已是 data: / http: / blob: / local-upload: → 原样返回
  if (/^(data|https?|blob|local-upload):/i.test(filePath)) return filePath
  // file:/// 旧格式 → 转为 local-upload:///
  if (/^file:\/\/\//i.test(filePath)) {
    return filePath.replace(/^file:\/\/\//i, 'local-upload:///')
  }
  // Windows 绝对路径 C:\... → local-upload:///C:/...
  const normalized = filePath.replace(/\\/g, '/')
  if (/^[A-Za-z]:\//.test(normalized)) {
    return 'local-upload:///' + normalized
  }
  return filePath
}

// 把本地上传的素材同步到节点 data 里持久化（存文件路径，不存 data URL）
function persistUploadedAssets() {
  nodeStore.updateNodeData(props.id, {
    _uploads: uploadedAssets.value.map(a => ({ id: a.id, type: a.type, url: a.url, name: a.name }))
  })
}

// 处理文件上传
const handleFileUpload = async (event: Event) => {
  console.log('[upload] handleFileUpload FIRED', event)
  const input = event.target as HTMLInputElement
  const files = input.files
  console.log('[upload] files count:', files?.length)
  if (!files) return

  for (const file of Array.from(files)) {
    const type = file.type.startsWith('image/') ? 'image'
                : file.type.startsWith('video/') ? 'video'
                : 'audio'
    if (props.type === 'ai-image' && type !== 'image') continue

    const reader = new FileReader()
    const dataUrl = await new Promise<string>((resolve) => {
      reader.onload = () => resolve(reader.result as string)
      reader.readAsDataURL(file)
    })

    // 落盘存储（data URL → 磁盘文件），持久化为文件路径而非 base64 巨串
    let displayUrl = dataUrl
    const base64 = dataUrl.includes('base64,') ? dataUrl.split('base64,')[1] : dataUrl
    if (window.electronAPI?.upload?.save) {
      try {
        const savedPath = await window.electronAPI.upload.save(base64, file.name)
        if (savedPath) {
          displayUrl = filePathToUrl(savedPath)
          console.log('[upload] saved to disk:', savedPath, '→', displayUrl)
        } else {
          console.warn('[upload] save returned null, falling back to data URL')
        }
      } catch (err) {
        console.warn('[upload] save failed:', err, '- falling back to data URL')
      }
    } else {
      console.warn('[upload] electronAPI.upload.save not available')
    }

    uploadedAssets.value.push({
      id: `asset_${Date.now()}_${Math.random()}`,
      type,
      url: displayUrl,
      name: file.name
    })
    persistUploadedAssets()
  }
}

// 移除素材
const removeAsset = (assetId: string) => {
  const asset = uploadedAssets.value.find(a => a.id === assetId)
  // 清理磁盘文件（从 local-upload:/// 或 file:/// URL 反推文件路径）
  if (asset && window.electronAPI?.upload?.delete) {
    let filePath = ''
    if (asset.url.startsWith('local-upload:///')) {
      filePath = asset.url.replace('local-upload:///', '')
    } else if (asset.url.startsWith('file:///')) {
      filePath = asset.url.replace('file:///', '')
    }
    if (filePath && /^[A-Za-z]:[\/\\]/.test(filePath)) {
      window.electronAPI.upload.delete(filePath.replace(/\//g, '\\')).catch(() => {})
    }
  }
  uploadedAssets.value = uploadedAssets.value.filter(a => a.id !== assetId)
  persistUploadedAssets()
}

// 删除连接的素材（断开边连接）
const removeConnectedAsset = (assetId: string) => {
  // assetId格式为 "node_XXX"，提取节点ID
  const nodeId = assetId.replace('node_', '')
  // 找到连接这个节点的边并删除
  const edgeToRemove = nodeStore.edges.find(edge => edge.source === nodeId && edge.target === props.id)
  if (edgeToRemove) {
    nodeStore.removeEdge(edgeToRemove.id)
  }
}

// 加载图片节点模型（视频节点不再这里加载，availableModels 已是 computed）
// 注：原来还有一个 onMounted 重复加载，已合并到上方初始化块

// 当前选中模型的能力（视频和图片节点共用，从 selectedProviderId + selectedModel 反查）
const currentModelCapabilities = computed(() => {
  const config = aiStore.getProviderConfig(selectedProviderId.value)
  const model = config?.models.find(m => m.id === selectedModel.value)
  return model?.capabilities
})

// 当前打开的选择器（用于互斥）
const openSelector = ref<string | null>(null)

// 提供给子组件的方法
provide('openSelector', openSelector)
provide('requestOpen', (selectorId: string) => {
  openSelector.value = selectorId
})

// 根据比例计算节点尺寸
const nodeSize = computed(() => {
  // 视频节点和绘图节点都支持比例变化
  if (props.type !== 'ai-video' && props.type !== 'ai-image') {
    return { width: 350, height: 350 }
  }

  const baseHeight = 350
  const ratioMap: Record<string, number> = {
    'auto': 1, // Auto显示为正方形
    '16:9': 16 / 9,
    '21:9': 21 / 9,
    '9:16': 9 / 16,
    '1:1': 1 / 1,
    '4:3': 4 / 3,
    '3:4': 3 / 4,
    '3:2': 3 / 2,
    '2:3': 2 / 3,
  }

  const ratio = ratioMap[selectedRatio.value] || 16 / 9
  // 节点尺寸完全按比例渲染（上方预览框严格匹配选中比例）
  // 生成卡片宽度独立写死在 .generator-card，不受这里影响
  const width = Math.round(baseHeight * ratio)

  return { width, height: baseHeight }
})

// 检查是否有图片节点连接
const hasImageInput = computed(() => {
  const incomingEdges = nodeStore.edges.filter(edge => edge.target === props.id)
  return incomingEdges.some(edge => {
    const sourceNode = nodeStore.nodes.find(n => n.id === edge.source)
    return sourceNode?.type === 'ai-image'
  })
})

// 检查是否有任何输入连接
const hasAnyInput = computed(() => {
  return nodeStore.edges.some(edge => edge.target === props.id)
})

// 获取连接的源节点的输出图片
const connectedAssets = computed(() => {
  const incomingEdges = nodeStore.edges.filter(edge => edge.target === props.id)
  const assets: Array<{ id: string; type: 'image' | 'video' | 'audio'; url: string; name: string; fromNode: boolean }> = []

  incomingEdges.forEach(edge => {
    const sourceNode = nodeStore.nodes.find(n => n.id === edge.source)

    // 检查asset-ref节点（上传的素材）
    if (sourceNode?.type === 'asset-ref' && sourceNode.data?.assetUrl) {
      assets.push({
        id: `node_${sourceNode.id}`,
        type: sourceNode.data.assetType || 'image',
        url: sourceNode.data.assetUrl,
        name: sourceNode.data.assetName || sourceNode.data.label || '上传素材',
        fromNode: true
      })
    }
    // 检查AI节点的输出
    else if (sourceNode?.data?.outputImage) {
      // 如果源节点有输出图片
      assets.push({
        id: `node_${sourceNode.id}`,
        type: 'image',
        url: sourceNode.data.outputImage,
        name: sourceNode.data.label || '节点输出',
        fromNode: true // 标记为来自节点的素材
      })
    } else if (sourceNode?.data?.outputVideo) {
      // 如果源节点有输出视频
      assets.push({
        id: `node_${sourceNode.id}`,
        type: 'video',
        url: sourceNode.data.outputVideo,
        name: sourceNode.data.label || '节点输出',
        fromNode: true
      })
    }
  })

  return assets
})

// 合并上传的素材和连接的素材
const allAssets = computed(() => {
  return [...connectedAssets.value, ...uploadedAssets.value]
})

// 根据节点类型过滤素材
// 绘图节点：只显示图片
// 视频节点：显示所有类型
const filteredAssetsForNode = computed(() => {
  if (props.type === 'ai-image') {
    return allAssets.value.filter(asset => asset.type === 'image')
  }
  return allAssets.value
})

// 是否显示首次上传按钮
const shouldShowUploadPrompt = computed(() => {
  // 没有素材时显示上传按钮
  if (filteredAssetsForNode.value.length > 0) return false

  // 绘图节点：始终显示
  if (props.type === 'ai-image') return true

  // 视频节点：非文生视频时显示
  if (props.type === 'ai-video' && currentTab.value !== 'text-to-video') return true

  return false
})

// 视频节点选项卡 - 根据输入动态启用
const videoTabs = computed(() => [
  { label: '文生视频', value: 'text-to-video', disabled: hasAnyInput.value }, // 有输入时禁用
  { label: '全能参考', value: 'universal-ref', disabled: !hasAnyInput.value }, // 有输入时启用
  { label: '图生视频', value: 'image-to-video', disabled: !hasImageInput.value }, // 有图片输入时启用
  { label: '首尾帧', value: 'first-last-frame', disabled: !hasImageInput.value }, // 有图片输入时启用
  { label: '图片参考', value: 'image-ref', disabled: !hasImageInput.value }, // 有图片输入时启用
])

// 当输入变化时，自动切换到可用的选项卡
watch([hasAnyInput, hasImageInput], ([anyInput, imageInput]) => {
  const currentTabObj = videoTabs.value.find(t => t.value === currentTab.value)
  if (currentTabObj?.disabled) {
    // 当前选中的选项卡被禁用，切换到第一个可用的
    const firstAvailable = videoTabs.value.find(t => !t.disabled)
    if (firstAvailable) {
      currentTab.value = firstAvailable.value
    }
  }
})

watch(() => props.data.prompt, (newPrompt) => {
  const value = newPrompt || ''
  localPrompt.value = value
  // 兜底：store 端数据被外部改动（粘贴恢复、撤销等）时，主动同步到 DOM。
  // 但只在 editable 没被聚焦时同步，避免打断用户输入时的光标。
  const el = editableRef.value
  if (el && document.activeElement !== el && el.textContent !== value) {
    el.innerHTML = promptTextToHtml(value)
  }
})

const selectNode = () => {
  nodeStore.selectNode(props.id)
}

// 视频相关
const videoThumbnailRef = ref<HTMLVideoElement>()
const videoPlayerRef = ref<HTMLVideoElement>()
const showVideoModal = ref(false)
const showImageModal = ref(false)

// 视频加载完成，定位到第一帧
const onVideoLoaded = (event: Event) => {
  const video = event.target as HTMLVideoElement
  video.currentTime = 0.1 // 定位到0.1秒显示首帧
}

// 播放视频（弹窗）
const playVideo = () => {
  showVideoModal.value = true
}

// 关闭视频弹窗
const closeVideo = () => {
  showVideoModal.value = false
  if (videoPlayerRef.value) {
    videoPlayerRef.value.pause()
  }
}

// 预览图片（弹窗）
const previewImage = () => {
  showImageModal.value = true
}

// 关闭图片弹窗
const closeImage = () => {
  showImageModal.value = false
}

// 下载当前预览的图片/视频到本地
const downloadAsset = async (url: string | undefined, type: 'image' | 'video') => {
  if (!url) return
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const mime = blob.type || (type === 'image' ? 'image/png' : 'video/mp4')
    const ext = (mime.split('/')[1] || (type === 'image' ? 'png' : 'mp4')).split(';')[0]
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = `${type}_${stamp}.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  } catch (err) {
    console.error('下载失败', err)
    window.alert('下载失败：' + (err instanceof Error ? err.message : String(err)))
  }
}

const updatePrompt = () => {
  nodeStore.updateNodeData(props.id, { prompt: localPrompt.value })
}

// ============= 节点内历史 =============
// 按节点 id 过滤出本节点的生成历史；只显示与当前节点类型匹配的资产
const nodeHistory = computed(() => {
  const wantType = props.type === 'ai-image' ? 'image' : props.type === 'ai-video' ? 'video' : null
  if (!wantType) return []
  return assetStore.assetsForNode(props.id).filter((a) => a.type === wantType)
})

// 当前节点 data 上显示的输出 url（用于历史条里高亮当前那张）
const currentOutputUrl = computed(() => {
  if (props.type === 'ai-image') return (props.data as any).outputImage as string | undefined
  if (props.type === 'ai-video') return (props.data as any).outputVideo as string | undefined
  return undefined
})

// 点击历史缩略图：把节点显示切回那次生成的结果
const switchToHistoryAsset = (asset: GeneratedAsset) => {
  if (asset.type === 'image') {
    nodeStore.updateNodeData(props.id, {
      status: 'completed',
      progress: 100,
      outputImage: asset.url,
      output: { url: asset.url, timestamp: asset.createdAt },
      error: undefined,
    })
  } else if (asset.type === 'video') {
    nodeStore.updateNodeData(props.id, {
      status: 'completed',
      progress: 100,
      outputVideo: asset.url,
      error: undefined,
    })
  }
}

// 从历史里删除一条（不影响当前节点上正在显示的，除非删的就是它，
// 那这里也清空，避免用户对不上号）
const deleteHistoryAsset = (assetId: string) => {
  const target = assetStore.assets.find((a) => a.id === assetId)
  assetStore.removeAsset(assetId)
  if (target && target.url === currentOutputUrl.value) {
    if (props.type === 'ai-image') {
      nodeStore.updateNodeData(props.id, { outputImage: undefined, status: 'idle' })
    } else if (props.type === 'ai-video') {
      nodeStore.updateNodeData(props.id, { outputVideo: undefined, status: 'idle' })
    }
  }
}

const onResolutionChange = (val: string) => {
  if (val) nodeStore.updateNodeData(props.id, { resolution: val })
}
const onDurationChange = (val: number) => {
  if (val != null) nodeStore.updateNodeData(props.id, { duration: val })
}
const onAudioChange = (val: boolean) => {
  nodeStore.updateNodeData(props.id, { generateAudio: val })
}

// 视频/图片节点参考素材：blob:/data: URL 直接传给 store，store 调用前会上传图床转公网 URL
const executeNode = async () => {
  if (props.data.status === 'running') return

  // 收集所有参考图 URL（不仅是第一张）
  const refImageUrls: string[] = []
  let inputVideo: string | undefined = undefined
  if (props.type === 'ai-video' || props.type === 'ai-image') {
    for (const a of allAssets.value) {
      if (a.type === 'image' && a.url) refImageUrls.push(a.url)
    }
  }
  if (props.type === 'ai-video') {
    const refVideo = allAssets.value.find((a) => a.type === 'video' && a.url)
    if (refVideo) inputVideo = refVideo.url
  }
  console.log('[executeNode] refImages:', refImageUrls.length, 'video:', !!inputVideo)

  nodeStore.updateNodeData(props.id, {
    prompt: localPrompt.value,
    providerId: selectedProviderId.value,
    model: selectedModel.value,
    ratio: selectedRatio.value,
    inputImage: refImageUrls[0],
    inputVideo,
    inputImages: refImageUrls,
  } as any)
  nodeStore.executeNode(props.id)
}

const icon = computed(() => {
  const icons: Record<string, string> = {
    'ai-image': '🎨',
    'ai-video': '🎬',
    'ai-text': '💬',
    'asset-ref': '📦',
    'post-process': '⚡',
  }
  return icons[props.type] || '📄'
})

const statusText = computed(() => {
  const statuses: Record<string, string> = {
    running: '生成中',
    completed: '已完成',
    error: '失败',
  }
  return statuses[props.data.status || ''] || ''
})

const typeLabel = computed(() => {
  const labels: Record<string, string> = {
    'ai-image': 'AI 绘图',
    'ai-video': 'AI 视频',
    'ai-text': 'AI 文本',
    'asset-ref': '素材',
  }
  return labels[props.type] || ''
})
</script>

<style scoped>
.custom-node {
  position: relative;
}

/* 节点主体 */
.node-main {
  width: 350px;
  height: 350px;
  background: #262626;
  border: 1px solid rgba(0, 217, 255, 0.3);
  border-radius: 12px;
  cursor: pointer;
  transition: width 0.3s, height 0.3s, border-color 0.3s, box-shadow 0.3s;
  overflow: hidden;
}

.custom-node.selected .node-main {
  border-color: #00D9FF;
  box-shadow: inset 0 0 0 2px #00D9FF;
}

.node-main:hover {
  border-color: #00D9FF;
}

.node-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 24px;
  gap: 16px;
}

.node-icon-large {
  color: rgba(255, 255, 255, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
}

.node-icon-large span {
  font-size: 64px;
}

/* 素材预览 */
.asset-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 8px;
}

.audio-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  height: 100%;
}

.audio-preview svg {
  color: rgba(0, 217, 255, 0.8);
}

.audio-controls {
  width: 90%;
  max-width: 300px;
}

/* 进度显示 */
.progress-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  gap: 8px;
}

.progress-number {
  font-size: 80px;
  font-weight: 700;
  color: #00D9FF;
  text-shadow: 0 0 20px rgba(0, 217, 255, 0.6);
  line-height: 1;
}

.progress-text {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.8);
  letter-spacing: 2px;
}

.error-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 16px;
  gap: 12px;
}

.error-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}
.error-icon svg {
  filter: drop-shadow(0 0 12px rgba(255, 68, 68, 0.5));
}

.error-text {
  font-size: 13px;
  color: #ff8a8a;
  text-align: center;
  line-height: 1.5;
  max-height: 80px;
  overflow-y: auto;
  word-break: break-word;
}

/* 生成中的动态背景 */
.node-content.generating {
  background: linear-gradient(
    45deg,
    rgba(0, 217, 255, 0.1) 0%,
    rgba(180, 50, 255, 0.1) 50%,
    rgba(0, 217, 255, 0.1) 100%
  );
  background-size: 200% 200%;
  animation: gradientShift 3s ease infinite;
}

@keyframes gradientShift {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}

/* 生成结果预览 */
.generated-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 8px;
}

/* 视频首帧缩略图 */
.video-thumbnail {
  position: relative;
  width: 100%;
  height: 100%;
  cursor: pointer;
  overflow: hidden;
  border-radius: 8px;
}

.play-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  border: 2px solid rgba(255,255,255,0.3);
  border-radius: 50%;
  backdrop-filter: blur(8px);
  transition: all 0.3s;
  pointer-events: none;
}
.play-overlay svg {
  width: 24px; height: 24px;
}

.video-thumbnail:hover .play-overlay {
  background: rgba(0, 217, 255, 0.5);
  transform: translate(-50%, -50%) scale(1.1);
}

.play-overlay svg {
  filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.5));
}

/* 视频播放弹窗 */
.video-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  animation: fadeIn 0.3s;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.video-modal-content {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.video-modal-player {
  max-width: 100%;
  max-height: 90vh;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 217, 255, 0.3);
}

.video-modal-close {
  position: absolute;
  top: -50px;
  right: 0;
  width: 40px;
  height: 40px;
  background: rgba(0, 217, 255, 0.2);
  border: 1px solid #00D9FF;
  border-radius: 50%;
  color: #00D9FF;
  font-size: 28px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
  line-height: 1;
  padding: 0;
}

.video-modal-close:hover {
  background: rgba(0, 217, 255, 0.4);
  transform: rotate(90deg);
}

/* 弹窗顶部工具条（下载 + 关闭） */
.modal-toolbar {
  position: absolute;
  top: -50px;
  right: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: 10;
}
.modal-download {
  height: 40px;
  padding: 0 16px;
  background: rgba(0, 217, 255, 0.2);
  border: 1px solid #00D9FF;
  border-radius: 20px;
  color: #00D9FF;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.modal-download:hover {
  background: rgba(0, 217, 255, 0.4);
  box-shadow: 0 0 12px rgba(0, 217, 255, 0.4);
}
/* 把已有的 close 按钮从绝对定位收回 toolbar 内 */
.modal-toolbar .video-modal-close,
.modal-toolbar .image-modal-close {
  position: static;
}

/* 图片缩略图 */
.image-thumbnail {
  position: relative;
  width: 100%;
  height: 100%;
  cursor: pointer;
  overflow: hidden;
  border-radius: 8px;
}

.preview-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.42);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 50%;
  backdrop-filter: blur(2px);
  transition: opacity 0.25s, background 0.25s, transform 0.25s;
  pointer-events: none;
  opacity: 0;
}

.image-thumbnail:hover .preview-overlay {
  opacity: 1;
  background: rgba(0, 0, 0, 0.55);
  transform: translate(-50%, -50%) scale(1.05);
}

.preview-overlay svg {
  opacity: 0.9;
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.5));
}

/* 图片预览弹窗 */
.image-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  animation: fadeIn 0.3s;
}

.image-modal-content {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-modal-preview {
  max-width: 100%;
  max-height: 90vh;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 217, 255, 0.3);
}

.image-modal-close {
  position: absolute;
  top: -50px;
  right: 0;
  width: 40px;
  height: 40px;
  background: rgba(0, 217, 255, 0.2);
  border: 1px solid #00D9FF;
  border-radius: 50%;
  color: #00D9FF;
  font-size: 28px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
  line-height: 1;
  padding: 0;
}

.image-modal-close:hover {
  background: rgba(0, 217, 255, 0.4);
  transform: rotate(90deg);
}

.node-title-main {
  font-size: 16px;
  color: #ffffff;
  font-weight: 500;
}

.node-hint {
  font-size: 14px;
  color: #888;
  margin-top: 8px;
}

.node-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.node-action-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: #ffffff;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.node-action-btn:hover {
  background: rgba(255, 255, 255, 0.05);
}

.action-icon {
  font-size: 16px;
}

.node-type-label {
  position: absolute;
  top: 8px;
  left: 12px;
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  background: rgba(0, 217, 255, 0.12);
  color: rgba(0, 217, 255, 0.8);
  backdrop-filter: blur(4px);
  pointer-events: none;
}

.node-glow {
  position: absolute;
  inset: -2px;
  border-radius: 14px;
  border: 2px solid transparent;
  background: linear-gradient(135deg, #00D9FF, #B432FF, #00D9FF) border-box;
  -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  animation: glowPulse 2s ease-in-out infinite;
  pointer-events: none;
}
@keyframes glowPulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

.node-status-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  backdrop-filter: blur(8px);
}

.node-status-badge.status-running {
  background: rgba(0, 217, 255, 0.2);
  color: #00D9FF;
}

.node-status-badge.status-completed {
  background: rgba(0, 255, 136, 0.2);
  color: #00ff88;
}

.node-status-badge.status-error {
  background: rgba(255, 68, 68, 0.2);
  color: #ff4444;
}

/* 生成卡片 - 在节点下方展开，宽度独立于节点（节点尺寸只跟视频比例走） */
.generator-card {
  position: absolute;
  top: calc(100% + 16px);
  left: 50%;
  transform: translateX(-50%);
  max-width: 720px;
  width: calc(100vw - 60px);
  background: #262626;
  border: 1px solid rgba(0, 217, 255, 0.3);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  z-index: 10;
  padding: 16px;
}

/* 历史缩略图条 */
.history-strip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 4px;
  margin-bottom: 10px;
  border-bottom: 1px dashed rgba(0, 217, 255, 0.15);
}
.history-label {
  font-size: 11px;
  color: rgba(0, 217, 255, 0.6);
  flex-shrink: 0;
  letter-spacing: 1px;
}
.history-scroller {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  overflow-y: hidden;
  flex: 1;
  padding-bottom: 2px;
}
.history-scroller::-webkit-scrollbar {
  height: 4px;
}
.history-scroller::-webkit-scrollbar-thumb {
  background: rgba(0, 217, 255, 0.3);
  border-radius: 2px;
}
.history-thumb {
  position: relative;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border-radius: 6px;
  overflow: hidden;
  border: 2px solid transparent;
  cursor: pointer;
  background: rgba(0, 0, 0, 0.3);
  transition: border-color 0.15s, transform 0.15s;
}
.history-thumb:hover {
  border-color: rgba(0, 217, 255, 0.5);
  transform: translateY(-1px);
}
.history-thumb.active {
  border-color: #00D9FF;
  box-shadow: 0 0 8px rgba(0, 217, 255, 0.6);
}
.history-thumb-media {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
}
.history-thumb-delete {
  position: absolute;
  top: 1px;
  right: 1px;
  width: 16px;
  height: 16px;
  border: none;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  border-radius: 50%;
  font-size: 14px;
  cursor: pointer;
  padding: 0;
  display: none;
  align-items: center;
  justify-content: center;
}
.history-thumb:hover .history-thumb-delete {
  display: flex;
}
.history-thumb-delete:hover {
  background: #ff4444;
}

.generator-content {
  position: relative;
}

.generator-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  padding: 4px;
  overflow-x: auto;
}

.assets-preview {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  overflow-x: auto;
  padding: 4px;
}

.asset-item {
  flex-shrink: 0;
}

.asset-thumbnail {
  position: relative;
  width: 60px;
  height: 60px;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
}

.asset-thumbnail img,
.asset-thumbnail video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.asset-thumbnail.video .video-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  pointer-events: none;
}

.asset-thumbnail.audio {
  color: #00D9FF;
}

.asset-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.7);
  border: none;
  color: white;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.asset-remove:hover {
  background: #ff4444;
  transform: scale(1.1);
}

.node-badge {
  position: absolute;
  bottom: 4px;
  left: 4px;
  padding: 2px 6px;
  background: rgba(0, 217, 255, 0.8);
  border-radius: 4px;
  font-size: 10px;
  color: white;
  font-weight: 500;
}

.asset-upload {
  width: 60px;
  height: 60px;
  border-radius: 8px;
  border: 2px dashed rgba(0, 217, 255, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.asset-upload:hover {
  border-color: #00D9FF;
  background: rgba(0, 217, 255, 0.05);
}

.asset-upload .upload-icon {
  font-size: 24px;
  color: rgba(0, 217, 255, 0.5);
}

.upload-prompt {
  margin-bottom: 12px;
  width: 60px;
  height: 60px;
  border: 2px dashed rgba(0, 217, 255, 0.3);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.upload-prompt:hover {
  border-color: #00D9FF;
  background: rgba(0, 217, 255, 0.05);
}

.upload-prompt-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  cursor: pointer;
  color: rgba(0, 217, 255, 0.5);
  transition: color 0.2s;
}

.upload-prompt-btn:hover {
  color: #00D9FF;
}

.upload-prompt-btn .upload-icon {
  font-size: 24px;
}

/* @ 提及列表 */
.asset-mention-list {
  position: absolute;
  width: 300px;
  max-height: 200px;
  overflow-y: auto;
  background: #262626;
  border: 1px solid rgba(0, 217, 255, 0.3);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  z-index: 10000;
  padding: 4px;
}

.mention-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
}

.mention-item:hover {
  background: rgba(0, 217, 255, 0.1);
}

.mention-thumbnail {
  width: 40px;
  height: 40px;
  border-radius: 4px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.mention-thumbnail img,
.mention-thumbnail video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.mention-thumbnail svg {
  color: #00D9FF;
}

.mention-info {
  flex: 1;
  min-width: 0;
}

.mention-name {
  font-size: 13px;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mention-type {
  font-size: 11px;
  color: #888;
  text-transform: capitalize;
}

/* 提及动画 */
.mention-enter-active,
.mention-leave-active {
  transition: all 0.2s ease;
}

.mention-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.mention-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.tab-btn {
  padding: 6px 16px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  color: #ffffff;
  font-size: 13px;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn.active {
  background: rgba(255, 255, 255, 0.1);
  border-color: #4a4a4a;
}

.tab-btn.disabled {
  color: #666;
  cursor: not-allowed;
  opacity: 0.5;
}

.tab-btn:not(.disabled):not(.active):hover {
  background: rgba(255, 255, 255, 0.05);
}

.generator-input {
  width: 100%;
  padding: 12px;
  background: rgba(0, 217, 255, 0.05);
  border: 1px solid rgba(0, 217, 255, 0.3);
  border-radius: 8px;
  color: #ffffff;
  font-size: 14px;
  font-family: inherit;
  resize: none;
  margin-bottom: 12px;
  line-height: 1.5;
  outline: none;
  min-height: 80px;
}

.generator-input.editable {
  overflow-y: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
  cursor: text;
}

.generator-input.editable * {
  cursor: text;
}

.generator-input.editable img {
  max-width: 16px !important;
  max-height: 16px !important;
}

.generator-input.editable:empty:before {
  content: attr(data-placeholder);
  color: #666;
  pointer-events: none;
}

.generator-input:focus {
  border-color: #00D9FF;
}

/* 素材徽章 */
.asset-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: rgba(0, 217, 255, 0.15);
  border: 1px solid rgba(0, 217, 255, 0.3);
  border-radius: 12px;
  color: #00D9FF;
  font-size: 12px;
  vertical-align: middle;
  margin: 0 2px;
  cursor: default;
  user-select: none;
  max-height: 24px;
}

.asset-badge img {
  width: 16px !important;
  height: 16px !important;
  max-width: 16px !important;
  max-height: 16px !important;
  min-width: 16px !important;
  min-height: 16px !important;
  object-fit: cover !important;
}

.badge-thumbnail {
  width: 16px;
  height: 16px;
  border-radius: 2px;
  object-fit: cover;
  flex-shrink: 0;
  display: block;
}

.badge-icon {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}

.badge-name {
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.generator-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.generator-options {
  display: flex;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.option-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #ffffff;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.option-btn:hover {
  background: rgba(255, 255, 255, 0.05);
}

.chevron {
  font-size: 10px;
  color: #888;
}

.generate-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 48px;
  height: 36px;
  padding: 0 20px;
  background: rgba(0, 217, 255, 0.2);
  border: 1px solid #00D9FF;
  border-radius: 8px;
  color: #00D9FF;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.3s;
  white-space: nowrap;
}

.generate-btn:hover:not(:disabled) {
  background: rgba(0, 217, 255, 0.3);
  box-shadow: 0 0 15px rgba(0, 217, 255, 0.4);
}

.generate-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.generate-btn svg {
  flex-shrink: 0;
}

.progress-bar {
  width: 100%;
  height: 3px;
  background: rgba(0, 217, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
  margin-top: 12px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #00D9FF, #B432FF);
  transition: width 0.3s;
}

/* 连接点样式 */
:deep(.custom-handle) {
  width: 20px;
  height: 20px;
  background: #00D9FF !important;
  border: 3px solid #262626 !important;
  border-radius: 50%;
  pointer-events: auto;
  opacity: 0 !important;
  transition: opacity 0.2s !important;
  box-shadow: 0 0 12px #00D9FF;
}

:deep(.custom-handle:hover) {
  opacity: 1 !important;
}

:deep(.custom-handle.connecting) {
  opacity: 1 !important;
}

:deep(.custom-handle.connectionindicator) {
  opacity: 1 !important;
}

:deep(.custom-handle.connectablestart) {
  opacity: 1 !important;
}

:deep(.custom-handle.connectableend) {
  opacity: 1 !important;
}

/* 扩大交互区域 */
:deep(.custom-handle::before) {
  content: '';
  position: absolute;
  width: 80px;
  height: 80px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  pointer-events: auto;
}

/* 展开动画 */
.expand-enter-active,
.expand-leave-active {
  transition: all 0.3s ease;
}

.expand-enter-from {
  opacity: 0;
  transform: translateY(-20px);
}

.expand-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}

/* 文本节点 */
.text-result-display {
  position: relative;
  width: 100%; height: 100%;
  padding: 14px;
  cursor: pointer;
  border-radius: 8px;
  overflow: hidden;
}
.text-result-content {
  font-size: 13px;
  line-height: 1.7;
  color: rgba(255,255,255,0.85);
  white-space: pre-wrap;
  word-break: break-word;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 8;
  -webkit-box-orient: vertical;
}
.text-result-hint {
  position: absolute;
  bottom: 6px; right: 10px;
  font-size: 11px;
  color: #00D9FF;
  opacity: 0.6;
  padding: 2px 8px;
  background: rgba(2,3,8,0.85);
  border-radius: 8px;
}

.text-modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.92);
  display: flex; align-items: center; justify-content: center;
  z-index: 10000;
}
.text-modal-content {
  position: relative;
  max-width: 700px; max-height: 85vh;
  display: flex; flex-direction: column;
}
.text-modal-body {
  overflow-y: auto;
  padding: 28px;
  color: #e0e0e0;
  font-size: 15px;
  line-height: 1.9;
  white-space: pre-wrap;
  word-break: break-word;
  background: rgba(2,3,8,0.95);
  border: 1px solid rgba(0,217,255,0.2);
  border-radius: 12px;
}
.text-modal-close {
  width: 40px; height: 40px;
  background: rgba(0,217,255,0.2);
  border: 1px solid #00D9FF;
  border-radius: 50%;
  color: #00D9FF;
  font-size: 24px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.2s;
  line-height: 1; padding: 0;
}
.text-modal-close:hover {
  background: rgba(0,217,255,0.4);
  transform: rotate(90deg);
}
</style>
