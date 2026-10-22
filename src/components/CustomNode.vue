<template>
  <div class="custom-node" :class="{ selected: isSelected, 'connection-receiving': receivingNodeId === id, 'connection-disabled': videoConnection && isImageNode, 'media-generating': (type === 'ai-image' || type === 'ai-video') && data.status === 'running', 'media-error': (type === 'ai-image' || type === 'ai-video') && data.status === 'error' }" :style="{ '--handle-scale': 1 / viewport.zoom, '--receiving-offset-x': receivingNodeId === id ? receivingOffset.x + 'px' : '0px', '--receiving-offset-y': receivingNodeId === id ? receivingOffset.y + 'px' : '0px' }">
    <!-- 节点主体 - 动态尺寸 -->
    <div class="node-surface" :style="{ width: nodeSize.width + 'px', height: nodeSize.height + 'px' }">
    <div class="node-caption">{{ nodeCaption }}</div>
    <div v-if="appearingNodes.has(id)" class="node-creation-glow" aria-hidden="true" @animationend="appearingNodes.delete(id)"></div>
    <div class="node-main" :class="{ 'media-generating': (type === 'ai-image' || type === 'ai-video') && data.status === 'running', 'media-error': (type === 'ai-image' || type === 'ai-video') && data.status === 'error' }" @click="selectNode" :style="{ width: nodeSize.width + 'px', height: nodeSize.height + 'px', ...receivingFrameStyle }">
      <div class="node-content" :class="{ generating: data.status === 'running', 'asset-content': type === 'asset-ref' }">
        <!-- 素材引用节点 - 显示上传的素材 -->
        <template v-if="type === 'asset-ref' && data.assetUrl">
          <img
            v-if="data.assetType === 'image'"
            :src="data.assetUrl"
            class="asset-preview asset-preview-clickable"
            @click.stop="previewImage"
            @load="onAssetImageLoaded"
          />
          <video v-else-if="data.assetType === 'video'" v-hover-video :src="data.assetUrl" class="asset-preview" controls disablePictureInPicture controlsList="nodownload noplaybackrate" loop playsinline preload="metadata" @loadedmetadata="onAssetVideoLoaded" />
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
          <div v-if="data.status === 'error'" class="error-display media-error-display" role="alert">
            <div class="error-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" fill="currentColor" fill-opacity=".12"/></svg></div>
            <div class="error-copy"><div class="error-title">生成失败</div><div class="error-text nodrag nopan nowheel" @wheel.stop>{{ data.error || '暂未返回失败原因，请检查参数后重试。' }}</div></div>
          </div>
          <!-- 生成中 - 显示进度 -->
          <div v-else-if="data.status === 'running'" class="media-loading-display" role="status" aria-label="正在生成">
            <div class="loading-dot-grid" :style="loadingGridStyle" aria-hidden="true">
              <span
                v-for="dot in loadingDots"
                :key="dot.id"
                class="loading-dot"
                :style="{ '--dot-delay': dot.delay, '--dot-duration': dot.duration, '--dot-opacity': dot.opacity }"
              ></span>
            </div>
            <span class="sr-only">正在生成，请稍候</span>
          </div>
          <!-- 已完成 - 显示生成的图片，单击展开生成卡片，双击预览大图 -->
          <div
            v-else-if="data.status === 'completed' && data.outputImage"
            class="image-thumbnail"
            @dblclick.stop="previewImage"
          >
            <img :src="data.outputImage" class="generated-preview" />
            <div class="preview-overlay">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="white" stroke-width="2" fill="none" stroke-linecap="round"/>
              </svg>
              <span class="preview-overlay-hint">双击预览</span>
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
          <div v-if="data.status === 'error'" class="error-display media-error-display" role="alert">
            <div class="error-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" fill="currentColor" fill-opacity=".12"/></svg></div>
            <div class="error-copy"><div class="error-title">生成失败</div><div class="error-text nodrag nopan nowheel" @wheel.stop>{{ data.error || '暂未返回失败原因，请检查参数后重试。' }}</div></div>
          </div>
          <!-- 生成中 - 显示进度 -->
          <div v-else-if="data.status === 'running'" class="media-loading-display" role="status" aria-label="正在生成">
            <div class="loading-dot-grid" :style="loadingGridStyle" aria-hidden="true">
              <span
                v-for="dot in loadingDots"
                :key="dot.id"
                class="loading-dot"
                :style="{ '--dot-delay': dot.delay, '--dot-duration': dot.duration, '--dot-opacity': dot.opacity }"
              ></span>
            </div>
            <span class="sr-only">正在生成，请稍候</span>
          </div>
          <!-- 已完成 - 显示视频首帧，单击展开生成卡片，双击播放大图 -->
          <div
            v-else-if="data.status === 'completed' && data.outputVideo"
            class="video-thumbnail"
            v-hover-video
            @dblclick.stop="playVideo"
          >
            <video
              ref="videoThumbnailRef"
              loop playsinline
              :src="data.outputVideo"
              class="generated-preview"
              preload="metadata"
              @loadedmetadata="onVideoLoaded"
            />
            <div class="play-overlay">
              <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 16 16" fill="white">
                <path d="M4.66699 2.64248C4.66717 1.82358 5.59736 1.35167 6.25781 1.83584L13.5674 7.19619C14.1117 7.59579 14.1118 8.40897 13.5674 8.8085L6.25781 14.1688C5.59734 14.6528 4.6671 14.1811 4.66699 13.3622V2.64248Z"/>
              </svg>
              <span class="play-overlay-hint">双击播放</span>
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

      <!-- 图片/视频生成进度沿节点边框绘制，不占用节点内部内容区域。 -->
      <div
        v-if="(type === 'ai-image' || type === 'ai-video') && data.status === 'running'"
        class="media-progress-ring"
        aria-hidden="true"
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="presentation">
          <rect class="media-progress-ring-track" x=".8" y=".8" width="98.4" height="98.4" rx="2" ry="2" pathLength="100" />
          <rect
            class="media-progress-ring-value"
            x=".8" y=".8" width="98.4" height="98.4" rx="2" ry="2"
            pathLength="100"
            :stroke-dasharray="`${generationProgress} ${100 - generationProgress}`"
          />
        </svg>
      </div>

      <!-- 状态指示 -->
      <div v-if="type !== 'ai-image' && type !== 'ai-video' && data.status !== 'idle'" class="node-status-badge" :class="'status-' + data.status">
        {{ statusText }}
      </div>

      <!-- 即梦式历史入口：同一图片或视频节点生成过多条结果时才显示。 -->
      <button
        v-if="(type === 'ai-image' || type === 'ai-video') && nodeHistory.length > 1"
        type="button"
        class="node-history-trigger nodrag nopan"
        :aria-label="`查看历史记录（${nodeHistory.length} 条）`"
        @click.stop="openHistoryGallery"
      >
        <span>{{ nodeHistory.length }}</span>
        <span class="node-history-chevron" aria-hidden="true">›</span>
      </button>

      <!-- 生成中边框光效 -->
      <div v-if="type !== 'ai-image' && type !== 'ai-video' && data.status === 'running'" class="node-glow"></div>
    </div>

    <!-- 生成卡片 - 选中时在底部展开 -->
    </div>
    <transition name="expand">
      <div v-show="showGeneratorPanel" class="node-panel-stack nodrag nopan nowheel">
        <div class="generator-card">
        <div class="generator-content">
          <!-- 参考内容：上传素材和画布连线会进入同一列表。 -->
          <div v-if="type === 'ai-video' || type === 'ai-image'" class="reference-section-header">
            <span>参考内容</span>
            <span v-if="referenceCapacityHint" class="reference-capacity">{{ referenceCapacityHint }}</span>
          </div>

          <!-- 素材缩略图区域 -->
          <div v-if="(type === 'ai-video' || type === 'ai-image') && filteredAssetsForNode.length > 0"
            class="assets-preview"
            :class="{ 'refs-blocked': refImageBlocked }">
            <div class="asset-item" v-for="asset in filteredAssetsForNode" :key="asset.id" @mouseenter="showReferencePreview(asset, $event)" @mouseleave="hideReferencePreview">
              <!-- 图片缩略图 -->
              <div v-if="asset.type === 'image'" class="asset-thumbnail">
                <img :src="asset.url" :alt="asset.name" />
                <button
                  v-if="type === 'ai-image' && !refImageBlocked"
                  class="ref-tag-badge"
                  :class="['ref-tag-' + (refTagOf(asset.id) || 'none')]"
                  @click.stop="cycleRefTag(asset.id)"
                >{{ refTagLetter(refTagOf(asset.id)) }}</button>
                <button class="asset-remove" @click.stop="asset.fromNode ? removeConnectedAsset(asset.id) : removeAsset(asset.id)"><svg viewBox="0 0 16 16" width="10" height="10" stroke="currentColor" stroke-width="2.5" fill="none"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg></button>
              </div>

              <!-- 视频缩略图 -->
              <div v-else-if="asset.type === 'video'" v-hover-video="isSelected" data-hover-muted="true" class="asset-thumbnail video">
                <video :src="asset.url" muted loop playsinline preload="metadata" @loadedmetadata="onReferenceVideoLoaded(asset.id, $event)" />
                <span v-if="videoDurations[asset.id] > 0" class="asset-video-duration">{{ formatVideoDuration(videoDurations[asset.id]) }}</span>
                <button class="asset-remove" @click.stop="asset.fromNode ? removeConnectedAsset(asset.id) : removeAsset(asset.id)"><svg viewBox="0 0 16 16" width="10" height="10" stroke="currentColor" stroke-width="2.5" fill="none"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg></button>
              </div>

              <!-- 音频缩略图 -->
              <div v-else class="asset-thumbnail audio">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                </svg>
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
          <div v-if="shouldShowUploadPrompt" class="upload-prompt"
            :class="{ 'refs-blocked': refImageBlocked }">
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

          <div v-if="data.referenceWarning" class="reference-warning" role="status">{{ data.referenceWarning }}</div>
          <div v-if="data.dmxTask && data.status !== 'running'" class="reference-warning">
            <button class="option-btn" @click.stop="nodeStore.executeNode(id)">继续查询上次任务</button>
            <span>任务已保存，不会重新提交生成。</span>
          </div>

          <!-- 富文本提示词输入 -->
          <div class="prompt-input-wrap">
            <div
              ref="editableRef"
              contenteditable="true"
              @input="handleContentEdit"
              @blur="formatInlinePrompt"
              @wheel.stop
              @click.stop="handlePromptClick"
              @mousedown="(e) => e.stopPropagation()"
              @mouseover="handlePromptMouseOver"
              @mouseout="handlePromptMouseOut"
              @dragstart="handlePromptBadgeDragStart"
              @dragover.prevent="handlePromptBadgeDragOver"
              @drop.prevent="handlePromptBadgeDrop"
              @dragend="handlePromptBadgeDragEnd"
              class="generator-input editable"
              data-placeholder="描述你想要生成的画面内容，输入 @ 引用素材..."
            ></div>
            <span class="prompt-char-count">{{ promptCharacterCount }} 字</span>
            <button
              class="prompt-fullscreen-btn"
              type="button"
              @click.stop="openPromptModal"
              @mousedown.stop
            >⛶</button>
            <div
              v-if="type === 'ai-image'"
              class="prompt-enhance"
              @click.stop
              @mousedown.stop
            >
              <StylePresetPicker @pick="onPickPreset" />
              <button
                class="prompt-enhance-btn"
                :class="{ running: enhancing }"
                :disabled="enhancing"
                @click="enhanceMenuOpen = !enhanceMenuOpen"
              >
                <span v-if="!enhancing">✨</span>
                <span v-else class="enhance-spinner">⟳</span>
              </button>
              <transition name="enhance-menu">
                <div v-if="enhanceMenuOpen && !enhancing" class="prompt-enhance-menu">
                  <button
                    v-for="opt in ENHANCE_OPTIONS"
                    :key="opt.value"
                    class="enhance-item"
                    @click="onEnhance(opt.value)"
                  >{{ opt.label }}</button>
                </div>
              </transition>
            </div>
          </div>

          <!-- 更多参数：只显示当前模型真实支持的字段。 -->
          <template v-if="type === 'ai-image'">
            <button class="advanced-toggle" type="button" @click.stop="advancedOpen = !advancedOpen">
              <span class="advanced-arrow" :class="{ open: advancedOpen }">▶</span>
              <span class="advanced-label">更多参数</span>
            </button>
            <transition name="expand-advanced">
              <div v-if="advancedOpen" class="advanced-panel" @click.stop @mousedown.stop>
                <label class="advanced-field" :class="{ disabled: !negativePromptSupported }">
                  <span class="advanced-field-label">
                    负面提示词
                    <span v-if="!negativePromptSupported" class="field-unsupported">当前模型不支持</span>
                  </span>
                  <input
                    type="text"
                    v-model="localNegativePrompt"
                    :placeholder="negativePromptSupported ? '不希望出现的内容（如：模糊、低分辨率）' : '当前模型会忽略此字段'"
                    :disabled="!negativePromptSupported"
                    class="advanced-input"
                  />
                </label>
                <label class="advanced-field" :class="{ disabled: !seedSupported }">
                  <span class="advanced-field-label">
                    Seed
                    <span v-if="!seedSupported" class="field-unsupported">当前模型不支持</span>
                  </span>
                  <div class="seed-row">
                    <input
                      type="number"
                      v-model.number="localSeed"
                      :placeholder="seedSupported ? '0 = 随机' : '当前模型会忽略此字段'"
                      :disabled="!seedSupported"
                      min="0"
                      max="2147483647"
                      class="advanced-input"
                    />
                    <button class="seed-dice" :disabled="!seedSupported" @click.stop="rerollSeed">🎲</button>
                  </div>
                </label>
              </div>
            </transition>
          </template>

          <template v-else-if="type === 'ai-video' && hasVideoAdvancedParameters">
            <button class="advanced-toggle" type="button" @click.stop="videoAdvancedOpen = !videoAdvancedOpen">
              <span class="advanced-arrow" :class="{ open: videoAdvancedOpen }">▶</span>
              <span class="advanced-label">更多参数</span>
            </button>
            <transition name="expand-advanced">
              <div v-if="videoAdvancedOpen" class="advanced-panel video-advanced-panel" @click.stop @mousedown.stop>
                <label v-if="audioGenerationSupported" class="advanced-switch-field">
                  <span><strong>生成音频</strong><small>成片同时生成音轨</small></span>
                  <button type="button" class="switch-control" :class="{ active: data.generateAudio === true }" :aria-pressed="data.generateAudio === true" @click.stop="onAudioChange(data.generateAudio !== true)"><span></span></button>
                </label>
                <div v-if="frameRateSupported" class="advanced-select-field">
                  <span><strong>帧率</strong><small>按中转站支持的帧率提交</small></span>
                  <div class="segmented-options">
                    <button v-for="fps in frameRateOptions" :key="fps" type="button" :class="{ active: selectedFps === fps }" @click.stop="onFpsChange(fps)">{{ fps }} fps</button>
                  </div>
                </div>
                <div v-if="isDmxApi25" class="advanced-select-field">
                  <span><strong>输出格式</strong><small>DMXAPI 成片封装格式</small></span>
                  <div class="segmented-options">
                    <button v-for="format in outputFormatOptions" :key="format" type="button" :class="{ active: selectedOutputFormat === format }" @click.stop="onOutputFormatChange(format)">{{ format.toUpperCase() }}</button>
                  </div>
                </div>
                <label v-if="isDmxApi25" class="advanced-switch-field">
                  <span><strong>返回尾帧</strong><small>DMXAPI 额外返回末帧图片</small></span>
                  <button type="button" class="switch-control" :class="{ active: data.returnLastFrame === true }" :aria-pressed="data.returnLastFrame === true" @click.stop="onReturnLastFrameChange(data.returnLastFrame !== true)"><span></span></button>
                </label>
              </div>
            </transition>
          </template>

          <div class="generator-footer">
            <div class="generator-options">
              <!-- 中转站和模型沿用原有选择逻辑；其它参数独立成即梦式入口。 -->
              <template v-if="type === 'ai-video'">
                <ProviderSelector v-model="selectedProviderId" :providers="providerOptions" placement="up" />
                <ModelSelector v-model="selectedModel" :models="availableModels" label="视频模型" placement="up" />
                <GenerationSizeSelector
                  v-model="selectedRatio"
                  :capabilities="currentModelCapabilities"
                  :resolution="data.resolution"
                  @update:resolution="onResolutionChange"
                />
                <GenerationModeSelector v-model="currentTab" :options="videoModeOptions" />
                <GenerationDurationSelector
                  v-if="durationSupported"
                  :model-value="data.duration"
                  :range="currentModelCapabilities?.durationRange"
                  :options="currentModelCapabilities?.durationOptions"
                  @update:model-value="onDurationChange"
                />
              </template>

              <!-- 图片节点：中转站 + 模型 + 尺寸入口 -->
              <template v-else-if="type === 'ai-image'">
                <ProviderSelector v-model="selectedProviderId" :providers="imageProviderOptions" placement="up" />
                <ModelSelector v-model="selectedModel" :models="availableImageModels" label="图片模型" placement="up" />
                <GenerationSizeSelector v-model="selectedRatio" :capabilities="currentModelCapabilities" :default-resolution="selectedModel === 'seedream-5-pro' ? '1K' : undefined" label="图片尺寸" :resolution="data.resolution" @update:resolution="onResolutionChange" />
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
              @click.stop="handleGenerateClick"
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
      </div>
    </transition>

    <!-- 连接点 -->
    <Handle type="target" :position="Position.Left" id="target" class="custom-handle" :class="handleClass('target')" :style="handleStyle('target')" />
    <Handle type="source" :position="Position.Right" id="source" class="custom-handle" :class="handleClass('source')" :style="handleStyle('source')" />

    <!-- 视频播放弹窗 -->
    <Teleport to="body">
      <div v-if="showVideoModal" class="video-modal-overlay" @click="closeVideo">
        <div class="video-modal-content" @click.stop>
          <div class="modal-toolbar">
            <span v-if="currentVideoAsset?.saveStatus === 'saving'" style="color: white">正在保存到本地…</span>
            <button v-else-if="currentVideoAsset?.localPath" class="modal-download" @click="revealSavedVideo">已保存本地 · 打开文件夹</button>
            <button v-else-if="currentVideoAsset" class="modal-download" @click="assetStore.retrySaveVideo(currentVideoAsset.id)">{{ currentVideoAsset.saveStatus === 'error' ? '本地保存失败 · 重试保存' : '保存到本地' }}</button>
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

    <!-- 历史记录画廊：由图片或视频节点右上角的数量入口打开。视频缩略图只在悬浮时静音播放。 -->
    <Teleport to="body">
      <div
        v-if="showHistoryGallery"
        class="history-gallery-overlay"
        :class="{ fullscreen: historyGalleryFullscreen }"
        @click.self="closeHistoryGallery"
      >
        <div class="history-gallery" @click.stop>
          <header class="history-gallery-header">
            <div class="history-gallery-title">历史记录 {{ nodeHistory.length }}</div>
            <div class="history-gallery-actions">
              <button type="button" class="history-gallery-action" @click="historyGalleryFullscreen = !historyGalleryFullscreen">
                <span aria-hidden="true">⛶</span>
                <span>{{ historyGalleryFullscreen ? '退出全屏' : '全屏查看' }}</span>
              </button>
              <button type="button" class="history-gallery-icon-action" aria-label="更多操作" @click.stop="historyMenuOpen = !historyMenuOpen">•••</button>
              <button type="button" class="history-gallery-icon-action" aria-label="关闭" @click="closeHistoryGallery">×</button>
            </div>
            <div v-if="historyMenuOpen" class="history-gallery-menu" @click.stop>
              <button type="button" @click="addAllHistoryToCanvas">全部添加到画布</button>
              <button type="button" @click="downloadAllHistory">下载全部</button>
            </div>
          </header>

          <div class="history-gallery-body">
            <section v-if="nodeHistory[0]" class="history-primary-section">
              <div class="history-gallery-section-label">主{{ historyMediaLabel }}</div>
              <button
                type="button"
                class="history-large-card"
                :class="{ active: nodeHistory[0].url === currentOutputUrl }"
                @click="switchToHistoryAsset(nodeHistory[0])"
              >
                <img
                  v-if="nodeHistory[0].type === 'image'"
                  :src="nodeHistory[0].url"
                  class="history-gallery-media"
                  alt=""
                />
                <video
                  v-else
                  v-hover-video="showHistoryGallery"
                  data-hover-muted="true"
                  :src="nodeHistory[0].url"
                  class="history-gallery-media"
                  muted
                  loop
                  playsinline
                  preload="metadata"
                />
                <span v-if="nodeHistory[0].type === 'video'" class="history-play-button" aria-hidden="true">▶</span>
              </button>
            </section>

            <section v-if="nodeHistory.length > 1" class="history-earlier-section">
              <div class="history-gallery-section-label">更早</div>
              <div class="history-gallery-grid">
                <button
                  v-for="asset in nodeHistory.slice(1)"
                  :key="asset.id"
                  type="button"
                  class="history-gallery-card"
                  :class="{ active: asset.url === currentOutputUrl }"
                  @click="switchToHistoryAsset(asset)"
                >
                  <img
                    v-if="asset.type === 'image'"
                    :src="asset.url"
                    class="history-gallery-media"
                    alt=""
                  />
                  <video
                    v-else
                    v-hover-video="showHistoryGallery"
                    data-hover-muted="true"
                    :src="asset.url"
                    class="history-gallery-media"
                    muted
                    loop
                    playsinline
                    preload="metadata"
                  />
                  <span v-if="asset.type === 'video'" class="history-play-button" aria-hidden="true">▶</span>
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 图片预览弹窗 -->
    <Teleport to="body">
      <div v-if="showImageModal" class="image-modal-overlay" @click="closeImage">
        <div class="image-modal-content" @click.stop>
          <div class="modal-toolbar">
            <button class="modal-download" @click="downloadAsset(previewImageUrl, 'image')">⬇ 下载</button>
            <button v-if="type === 'ai-image'" class="modal-edit" @click="openInpaint">✏️ 编辑选区</button>
            <button class="image-modal-close" @click="closeImage"><svg viewBox="0 0 16 16" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg></button>
          </div>
          <img
            :src="previewImageUrl"
            class="image-modal-preview"
          />
        </div>
      </div>
    </Teleport>

    <!-- 参考素材悬停预览：位置固定在视口内，避免被参数卡的滚动区域裁切。 -->
    <Teleport to="body">
      <transition name="reference-preview">
        <div
          v-if="hoveredReferenceAsset"
          class="reference-hover-preview"
          :style="referencePreviewStyle"
          @mouseenter="cancelReferencePreviewHide"
          @mouseleave="scheduleReferencePreviewHide"
          @mousedown.stop
        >
          <img v-if="hoveredReferenceAsset.type === 'image'" :src="hoveredReferenceAsset.url" :alt="hoveredReferenceAsset.name" />
          <video v-else-if="hoveredReferenceAsset.type === 'video'" :src="hoveredReferenceAsset.url" autoplay muted loop playsinline preload="metadata" />
          <div v-else class="reference-hover-audio">
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
            <span>{{ hoveredReferenceAsset.name }}</span>
          </div>
        </div>
      </transition>
    </Teleport>

    <!-- @ 提及素材列表：脱离参数卡和全屏编辑器的裁剪区域，始终固定在输入位置上方。 -->
    <Teleport to="body">
      <transition name="mention">
        <div
          v-if="showAssetMention && filteredAssets.length > 0"
          class="asset-mention-list"
          :style="{ top: mentionPosition.top + 'px', left: mentionPosition.left + 'px' }"
          @mousedown.prevent
          @click.stop
        >
          <div
            v-for="asset in filteredAssets"
            :key="asset.id"
            class="mention-item"
            v-hover-video="isSelected"
            data-hover-muted="true"
            @click="insertAssetBadge(asset)"
          >
            <div class="mention-thumbnail">
              <img v-if="asset.type === 'image'" :src="asset.url" alt="" />
              <video v-else-if="asset.type === 'video'" :src="asset.url" muted playsinline preload="metadata" />
              <svg v-else xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
              </svg>
            </div>
            <div class="mention-info">
              <div class="mention-name">{{ asset.name }}</div>
              <div class="mention-type">{{ assetTypeLabel(asset.type) }}</div>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>

    <!-- 提示词全屏编辑器 -->
    <Teleport to="body">
      <div v-if="showPromptModal" class="prompt-modal-overlay" @click.self="closePromptModal">
        <div class="prompt-modal-content" @click.stop @mousedown.stop>
          <div class="prompt-modal-header">
            <div>
              <div class="prompt-modal-title">提示词</div>
              <div class="prompt-modal-hint">点击素材缩略图可选中，拖拽即可调整它在提示词中的位置。</div>
            </div>
            <div class="prompt-modal-actions">
              <span class="prompt-char-count fullscreen">{{ promptCharacterCount }} 字</span>
              <button class="prompt-modal-close" type="button" @click="closePromptModal">完成</button>
            </div>
          </div>
          <div
            ref="fullscreenEditableRef"
            contenteditable="true"
            class="prompt-modal-editor"
            data-placeholder="描述你想要生成的画面内容..."
            @input="handleFullscreenContentEdit"
            @blur="formatFullscreenPrompt"
            @wheel.stop
            @keydown.esc.prevent="closePromptModal"
            @click="handlePromptClick"
            @mouseover="handlePromptMouseOver"
            @mouseout="handlePromptMouseOut"
            @dragstart="handlePromptBadgeDragStart"
            @dragover.prevent="handlePromptBadgeDragOver"
            @drop.prevent="handlePromptBadgeDrop"
            @dragend="handlePromptBadgeDragEnd"
          ></div>
        </div>
      </div>
    </Teleport>

    <!-- 局部重绘编辑器 -->
    <InpaintingEditor
      v-if="showInpaint && data.outputImage"
      :src="data.outputImage"
      @close="showInpaint = false"
      @done="onInpaintDone"
    />

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
  padding: 1px 3px !important;
  background: transparent !important;
  border: 1px solid transparent !important;
  border-radius: 5px !important;
  color: rgba(255, 255, 255, 0.88) !important;
  transition: background .16s ease, border-color .16s ease, color .16s ease, box-shadow .16s ease !important;
  font-size: 12px !important;
  vertical-align: middle !important;
  margin: 0 2px !important;
  cursor: default !important;
  user-select: none !important;
  max-height: 24px !important;
}

.asset-badge:hover {
  background: rgba(255, 255, 255, 0.10) !important;
  border-color: rgba(255, 255, 255, 0.16) !important;
  color: #fff !important;
  box-shadow: 0 3px 12px rgba(0,0,0,.18) !important;
}

.asset-badge.selected {
  background: rgba(255, 255, 255, 0.16) !important;
  border-color: rgba(255, 255, 255, 0.52) !important;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.10), 0 4px 14px rgba(0, 0, 0, 0.24) !important;
}

.asset-badge.dragging {
  opacity: 0.42 !important;
}

.asset-badge.drop-before {
  box-shadow: -2px 0 0 rgba(255, 255, 255, 0.9) !important;
}

.asset-badge.drop-after {
  box-shadow: 2px 0 0 rgba(255, 255, 255, 0.9) !important;
}

.asset-badge img,
.badge-thumbnail {
  width: 18px !important;
  height: 18px !important;
  max-width: 18px !important;
  max-height: 18px !important;
  min-width: 18px !important;
  min-height: 18px !important;
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
import { ref, computed, watch, provide, inject, onMounted, nextTick } from 'vue'
import { hoverVideo as vHoverVideo, stopHoverVideo } from '@/utils/hoverVideo'
import { receivingNodeKey, receivingOffsetKey, receivingSurfaceKey, connectionPointerKey, connectionFrameTilt } from '@/utils/canvasConnection'
import { imageConnectionKey, videoConnectionKey, handleMagnetKey } from '@/utils/canvasConnection'
import { appearingNodesKey } from '@/utils/nodeAppearance'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { ElMessage } from 'element-plus'
import { useNodeStore } from '@/stores/node'
import type { RefImageTag } from '@/stores/node'
import { useAIStore } from '@/stores/ai'
import { useAssetStore, type GeneratedAsset } from '@/stores/asset'
import { useMaterialStore } from '@/stores/material'
import { findImageTemplate, type ImageProviderKind } from '@/services/imageModelTemplates'
import GenerationDurationSelector from './GenerationDurationSelector.vue'
import GenerationModeSelector, { type GenerationModeOption } from './GenerationModeSelector.vue'
import GenerationSizeSelector from './GenerationSizeSelector.vue'
import ModelSelector from './ModelSelector.vue'
import ProviderSelector from './ProviderSelector.vue'
import StylePresetPicker from './StylePresetPicker.vue'
import InpaintingEditor from './InpaintingEditor.vue'
import type { VideoModelCapabilities } from '@/services/videoModelService'
import { enhancePrompt, ENHANCE_OPTIONS, type EnhanceStyle } from '@/services/promptEnhancer'
import { applyPreset, type StylePreset } from '@/services/stylePresets'
import { persistImage } from '@/services/imageStorage'
import { countPromptCharacters, formatStructuredPrompt } from '@/utils/promptFormatting'
import { mediaFrameSize } from '@/utils/mediaFrame'

interface Props {
  id: string
  type: string
  data: {
    label: string
    assetName?: string
    displayNumber?: number
    assetType?: string
    assetUrl?: string
    assetWidth?: number
    assetHeight?: number
    status?: string
    prompt?: string
    progress?: number
    referenceWarning?: string
    videoMode?: 'reference' | 'edit' | 'extend'
    dmxFrameMode?: 'first_frame' | 'first_last_frame'
    dmxTask?: import('@/services/dmxapiTask').DmxPendingTask
    ratio?: string
    resolution?: string
    duration?: number
    generateAudio?: boolean
    fps?: number
    outputFormat?: 'mp4' | 'mov'
    returnLastFrame?: boolean
    negativePrompt?: string
    seed?: number
  }
}

const props = defineProps<Props>()
const appearingNodes = inject(appearingNodesKey, ref(new Set<string>()))
const receivingNodeId = inject(receivingNodeKey, ref<string | null>(null))
const receivingOffset = inject(receivingOffsetKey, ref({ x: 0, y: 0 }))
const receivingSurface = inject(receivingSurfaceKey, ref(null))
const connectionPointer = inject(connectionPointerKey, ref(null))
const { viewport, updateNodeInternals } = useVueFlow()
const imageConnection = inject(imageConnectionKey, ref(false))
const videoConnection = inject(videoConnectionKey, ref(false))
const isImageNode = computed(() => props.type === 'ai-image' || (props.type === 'asset-ref' && props.data.assetType === 'image'))
const handleMagnet = inject(handleMagnetKey, ref(null))
const isMagnetic = (side: string) => handleMagnet.value?.nodeId === props.id && handleMagnet.value?.side === side
const handleClass = (side: string) => ({
  'handle-magnetic': isMagnetic(side),
  'handle-hidden-receiving': props.type === 'ai-video' && imageConnection.value,
})
const handleStyle = (side: string) => {
  // Vue Flow scales the complete node tree. Pass explicit inverse pixel values
  // instead of CSS calc multiplication so the visible dot is stable at 25%–400%.
  const zoom = Math.max(Number(viewport.value.zoom) || 1, 0.01)
  const inverseZoom = 1 / zoom
  return {
    '--magnet-x': (isMagnetic(side) ? handleMagnet.value!.x * inverseZoom : 0) + 'px',
    '--magnet-y': (isMagnetic(side) ? handleMagnet.value!.y * inverseZoom : 0) + 'px',
    '--handle-dot-size': (20 * inverseZoom) + 'px',
    '--handle-dot-offset': (22 * inverseZoom) + 'px',
    '--handle-dot-border': inverseZoom + 'px',
    '--handle-hit-width': (40 * inverseZoom) + 'px',
    '--handle-hit-height': (80 * inverseZoom) + 'px',
  }
}
const receivingFrameStyle = computed(() => {
  if (receivingNodeId.value !== props.id) return {}
  const zoom = viewport.value.zoom
  const { x, y } = receivingOffset.value
  // Positive rotateX lifts the bottom edge; negative rotateY lifts the right.
  const tilt = receivingSurface.value && connectionPointer.value
    ? connectionFrameTilt(connectionPointer.value, receivingSurface.value) : { x: 0, y: 0 }
  return {
    transform: `translate(${x}px, ${y}px) perspective(${800 / zoom}px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
  }
})
const nodeStore = useNodeStore()
const aiStore = useAIStore()
const assetStore = useAssetStore()
const materialStore = useMaterialStore()
const currentVideoAsset = computed(() => assetStore.assets.find(a => a.type === 'video'
  && (a.url === props.data.outputVideo || a.sourceUrl === props.data.outputVideo)))
const revealSavedVideo = () => {
  if (currentVideoAsset.value?.localPath) (window as any).electronAPI?.shell?.showItem(currentVideoAsset.value.localPath)
}

const localPrompt = ref(formatStructuredPrompt(props.data.prompt || ''))
const promptCharacterCount = computed(() => countPromptCharacters(localPrompt.value))
const isSelected = computed(() => nodeStore.selectedNodeId === props.id)
const suppressGeneratorPanelAfterRun = ref(props.data.status === 'running')
const showGeneratorPanel = computed(() =>
  isSelected.value &&
  props.type !== 'asset-ref' &&
  props.data.status !== 'running' &&
  !suppressGeneratorPanelAfterRun.value,
)
watch(() => props.data.status, (status) => {
  if (status === 'running') suppressGeneratorPanelAfterRun.value = true
})
watch(isSelected, (selected, wasSelected) => {
  if (selected && !wasSelected && props.data.status !== 'running') {
    suppressGeneratorPanelAfterRun.value = false
  }
})
const currentTab = ref(props.data.videoMode === 'edit' ? 'video-edit'
  : props.data.videoMode === 'extend' ? 'video-extend'
  : props.data.dmxFrameMode === 'first_frame' ? 'image-to-video'
  : props.data.dmxFrameMode === 'first_last_frame' ? 'first-last-frame' : 'text-to-video')
// 比例从节点 data.ratio 恢复（没有才用默认 16:9）；否则切走再切回会丢失用户选择
const selectedRatio = ref<string>((props.data as any).ratio || '16:9')
const localSeed = ref<number>(((props.data as any).seed as number) || 0)
watch(localSeed, (v) => {
  nodeStore.updateNodeData(props.id, { seed: typeof v === 'number' ? v : 0 })
})
function rerollSeed() {
  localSeed.value = Math.floor(Math.random() * 2_000_000_000)
}
const advancedOpen = ref(false)
const videoAdvancedOpen = ref(false)
const selectedFps = ref<number>(Number((props.data as any).fps) || 24)
const selectedOutputFormat = ref<'mp4' | 'mov'>(((props.data as any).outputFormat as 'mp4' | 'mov') || 'mp4')
const localNegativePrompt = ref<string>(((props.data as any).negativePrompt as string) || '')
watch(localNegativePrompt, (v) => {
  nodeStore.updateNodeData(props.id, { negativePrompt: v || undefined })
})

// Prompt LLM 改写
const enhancing = ref(false)
const enhanceMenuOpen = ref(false)
async function onEnhance(style: EnhanceStyle) {
  enhanceMenuOpen.value = false
  const raw = localPrompt.value.trim()
  if (!raw) {
    ElMessage.warning('请先输入提示词')
    return
  }
  enhancing.value = true
  try {
    const next = await enhancePrompt(raw, style)
    localPrompt.value = next
    if (editableRef.value) {
      editableRef.value.innerHTML = promptTextToHtml(next)
    }
    nodeStore.updateNodeData(props.id, { prompt: next })
    ElMessage.success('提示词已改写')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '改写失败')
  } finally {
    enhancing.value = false
  }
}

function onPickPreset(p: StylePreset) {
  const next = applyPreset(localPrompt.value, p)
  localPrompt.value = next
  if (editableRef.value) {
    editableRef.value.innerHTML = promptTextToHtml(next)
  }
  nodeStore.updateNodeData(props.id, { prompt: next })
}

// 参考图角色标签：subject / style / scene / 无
const REF_TAG_CYCLE: (RefImageTag | undefined)[] = [undefined, 'subject', 'style', 'scene']
function refTagOf(assetId: string): RefImageTag | undefined {
  const map = (props.data as any).refTags as Record<string, RefImageTag> | undefined
  return map?.[assetId]
}
function refTagLetter(tag: RefImageTag | undefined): string {
  if (tag === 'subject') return '主'
  if (tag === 'style') return '风'
  if (tag === 'scene') return '景'
  return '·'
}
function refTagTitle(tag: RefImageTag | undefined): string {
  if (tag === 'subject') return '角色 / 主体；优先送入第一参考位'
  if (tag === 'style') return '风格参考'
  if (tag === 'scene') return '场景参考'
  return '未标注；点击循环 主→风→景→无'
}
function cycleRefTag(assetId: string) {
  const cur = refTagOf(assetId)
  const idx = REF_TAG_CYCLE.indexOf(cur)
  const next = REF_TAG_CYCLE[(idx + 1) % REF_TAG_CYCLE.length]
  const map = { ...((props.data as any).refTags || {}) } as Record<string, RefImageTag>
  if (next) map[assetId] = next
  else delete map[assetId]
  nodeStore.updateNodeData(props.id, { refTags: map } as any)
}
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

// 当前选中的图片模型（找不到返回 undefined）
const currentImageModel = computed(() => {
  const config = aiStore.getProviderConfig(selectedProviderId.value)
  return config?.models.find((m) => m.id === selectedModel.value)
})

// 当前图片模型是否明确不支持参考图（如 Grok 4.2）
const refImageBlocked = computed(() =>
  props.type === 'ai-image' && currentImageModel.value?.supportsReferenceImage === false
)

// 当前图片模型对 seed / negativePrompt 的实际支持，模板优先，模型 meta 兜底，缺则按 true 算
const currentModelTemplate = computed(() => {
  if (props.type !== 'ai-image' || !selectedModel.value) return undefined
  const cfg = aiStore.getProviderConfig(selectedProviderId.value)
  const kind = (cfg?.kind || undefined) as ImageProviderKind | undefined
  return findImageTemplate(selectedModel.value, kind)
})
const seedSupported = computed(() => {
  if (props.type !== 'ai-image') return true
  const tplFlag = currentModelTemplate.value?.supportsSeed
  const metaFlag = (currentImageModel.value as any)?.supportsSeed
  return (tplFlag ?? metaFlag) !== false
})
const negativePromptSupported = computed(() => {
  if (props.type !== 'ai-image') return true
  const tplFlag = currentModelTemplate.value?.supportsNegativePrompt
  const metaFlag = (currentImageModel.value as any)?.supportsNegativePrompt
  return (tplFlag ?? metaFlag) !== false
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
const mentionEditor = ref<HTMLDivElement | null>(null)
const mentionRange = ref<Range | null>(null)
const editableRef = ref<HTMLDivElement>()
const fullscreenEditableRef = ref<HTMLDivElement>()
const showPromptModal = ref(false)
const selectedPromptAssetId = ref<string | null>(null)
const draggedPromptBadge = ref<HTMLElement | null>(null)
const promptDropBadge = ref<HTMLElement | null>(null)
const hoveredReferenceAsset = ref<any | null>(null)
const hoveredReferenceRatio = ref(16 / 9)
const referenceHoverPosition = ref({ left: 0, top: 0 })
const referenceHoverSize = ref({ width: 300, height: 190 })
let referenceHideTimer: ReturnType<typeof setTimeout> | undefined

const assetTypeLabel = (type: string) => ({ image: '图片', video: '视频', audio: '音频' }[type] || type)

const referencePreviewStyle = computed(() => ({
  left: referenceHoverPosition.value.left + 'px',
  top: referenceHoverPosition.value.top + 'px',
  width: referenceHoverSize.value.width + 'px',
  height: referenceHoverSize.value.height + 'px',
}))

const assetAspectRatio = (asset: any) => {
  const width = Number(asset?.assetWidth || asset?.width)
  const height = Number(asset?.assetHeight || asset?.height)
  if (width > 0 && height > 0) return width / height
  const ratio = String(asset?.ratio || '').match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/)
  if (ratio) return Number(ratio[1]) / Number(ratio[2])
  return 16 / 9
}

const updateReferencePreviewPosition = (target: HTMLElement) => {
  const rect = target.getBoundingClientRect()
  const gap = 12
  const width = referenceHoverSize.value.width
  const height = referenceHoverSize.value.height
  // 即梦式预览优先放在素材正上方，并与素材水平居中。
  const left = Math.min(
    Math.max(8, rect.left + rect.width / 2 - width / 2),
    Math.max(8, window.innerWidth - width - 8),
  )
  const preferredTop = rect.top - height - gap
  // 画布顶部空间不足时才退到素材下方，避免浮层被视口裁掉。
  const top = preferredTop >= 8
    ? preferredTop
    : Math.min(rect.bottom + gap, Math.max(8, window.innerHeight - height - 8))
  referenceHoverPosition.value = { left, top }
}

const showReferencePreviewElement = (asset: any, target: HTMLElement) => {
  if (!asset?.url) return
  cancelReferencePreviewHide()
  const ratio = Math.max(0.45, Math.min(2.2, assetAspectRatio(asset)))
  hoveredReferenceRatio.value = ratio
  const height = 190
  referenceHoverSize.value = { width: Math.round(Math.max(112, Math.min(320, height * ratio))), height }
  hoveredReferenceAsset.value = asset
  updateReferencePreviewPosition(target)

  // Connected/uploaded assets may not carry dimensions. Probe once so a 16:9
  // asset opens wider and a 9:16 asset opens narrower like Jimeng.
  if (asset.type === 'image' && !asset.assetWidth && !asset.assetHeight) {
    const probe = new Image()
    probe.onload = () => {
      if (hoveredReferenceAsset.value?.id !== asset.id || !probe.naturalWidth || !probe.naturalHeight) return
      const loadedRatio = Math.max(0.45, Math.min(2.2, probe.naturalWidth / probe.naturalHeight))
      hoveredReferenceRatio.value = loadedRatio
      referenceHoverSize.value = { width: Math.round(Math.max(112, Math.min(320, height * loadedRatio))), height }
      updateReferencePreviewPosition(target)
    }
    probe.src = asset.url
  }
}

const showReferencePreview = (asset: any, event: MouseEvent) => {
  const target = event.currentTarget as HTMLElement | null
  if (target) showReferencePreviewElement(asset, target)
}

const hideReferencePreview = () => {
  scheduleReferencePreviewHide()
}

const cancelReferencePreviewHide = () => {
  if (referenceHideTimer) {
    clearTimeout(referenceHideTimer)
    referenceHideTimer = undefined
  }
}

const scheduleReferencePreviewHide = () => {
  cancelReferencePreviewHide()
  referenceHideTimer = setTimeout(() => {
    hoveredReferenceAsset.value = null
    referenceHideTimer = undefined
  }, 120)
}

const promptBadgeAsset = (target: EventTarget | null) => {
  const element = target instanceof HTMLElement ? target.closest('.asset-badge') as HTMLElement | null : null
  if (!element) return null
  const id = element.dataset.assetId
  return id ? allAssets.value.find(asset => asset.id === id) : null
}

const handlePromptMouseOver = (event: MouseEvent) => {
  const asset = promptBadgeAsset(event.target)
  const badge = event.target instanceof HTMLElement ? event.target.closest('.asset-badge') as HTMLElement | null : null
  if (asset && badge) showReferencePreviewElement(asset, badge)
}

const handlePromptMouseOut = (event: MouseEvent) => {
  const badge = event.target instanceof HTMLElement ? event.target.closest('.asset-badge') as HTMLElement | null : null
  const related = event.relatedTarget instanceof Node ? event.relatedTarget : null
  if (badge && related && badge.contains(related)) return
  if (badge) scheduleReferencePreviewHide()
}

const promptBadgeFromTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return null
  return target.closest('.asset-badge') as HTMLElement | null
}

const setSelectedPromptBadge = (assetId: string | null) => {
  selectedPromptAssetId.value = assetId
  for (const editor of [editableRef.value, fullscreenEditableRef.value]) {
    editor?.querySelectorAll<HTMLElement>('.asset-badge').forEach((badge) => {
      badge.classList.toggle('selected', Boolean(assetId && badge.dataset.assetId === assetId))
      badge.setAttribute('aria-selected', String(Boolean(assetId && badge.dataset.assetId === assetId)))
    })
  }
}

const handlePromptClick = (event: MouseEvent) => {
  const badge = promptBadgeFromTarget(event.target)
  if (badge) {
    event.preventDefault()
    event.stopPropagation()
    setSelectedPromptBadge(badge.dataset.assetId || null)
    return
  }
  setSelectedPromptBadge(null)
}

const clearPromptDropState = () => {
  if (promptDropBadge.value) {
    promptDropBadge.value.classList.remove('drop-before', 'drop-after')
    promptDropBadge.value = null
  }
}

const getPromptCaretRange = (editor: HTMLDivElement, event: DragEvent) => {
  const doc = editor.ownerDocument
  let range: Range | null = null
  const caretRangeFromPoint = (doc as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }).caretRangeFromPoint
  if (caretRangeFromPoint) {
    range = caretRangeFromPoint.call(doc, event.clientX, event.clientY)
  } else {
    const caretPositionFromPoint = (doc as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
    }).caretPositionFromPoint
    const position = caretPositionFromPoint?.call(doc, event.clientX, event.clientY)
    if (position) {
      range = doc.createRange()
      range.setStart(position.offsetNode, position.offset)
      range.collapse(true)
    }
  }
  if (!range) return null
  const container = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer
    : range.commonAncestorContainer.parentNode
  return container && editor.contains(container) ? range : null
}

const ensurePromptBadgeSpacing = (badge: HTMLElement) => {
  const previous = badge.previousSibling
  const next = badge.nextSibling
  if (previous && previous.nodeType !== Node.ELEMENT_NODE && !/\s$/.test(previous.textContent || '')) {
    badge.parentNode?.insertBefore(document.createTextNode(' '), badge)
  }
  if (next && next.nodeType !== Node.ELEMENT_NODE && !/^\s/.test(next.textContent || '')) {
    badge.parentNode?.insertBefore(document.createTextNode(' '), next)
  }
}

const syncMovedPrompt = (editor: HTMLDivElement) => {
  localPrompt.value = extractTextContent(editor)
  updatePrompt()
  const otherEditor = editor === editableRef.value ? fullscreenEditableRef.value : editableRef.value
  if (otherEditor) otherEditor.innerHTML = promptTextToHtml(localPrompt.value)
  nextTick(() => setSelectedPromptBadge(selectedPromptAssetId.value))
}

const handlePromptBadgeDragStart = (event: DragEvent) => {
  const badge = promptBadgeFromTarget(event.target)
  const editor = event.currentTarget as HTMLDivElement | null
  if (!badge || !editor) return
  draggedPromptBadge.value = badge
  setSelectedPromptBadge(badge.dataset.assetId || null)
  badge.classList.add('dragging')
  event.dataTransfer?.setData('text/plain', badge.dataset.assetId || '')
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  event.stopPropagation()
}

const handlePromptBadgeDragOver = (event: DragEvent) => {
  const source = draggedPromptBadge.value
  if (!source) return
  event.preventDefault()
  event.stopPropagation()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  const target = promptBadgeFromTarget(event.target)
  clearPromptDropState()
  if (target && target !== source) {
    const rect = target.getBoundingClientRect()
    target.classList.add(event.clientX < rect.left + rect.width / 2 ? 'drop-before' : 'drop-after')
    promptDropBadge.value = target
  }
}

const detachPromptBadge = (badge: HTMLElement) => {
  const next = badge.nextSibling
  if (next?.nodeType === Node.TEXT_NODE && /^\s/.test(next.textContent || '')) {
    next.textContent = (next.textContent || '').slice(1)
  }
  badge.remove()
}

const handlePromptBadgeDrop = (event: DragEvent) => {
  const source = draggedPromptBadge.value
  const editor = event.currentTarget as HTMLDivElement | null
  if (!source || !editor) return
  event.preventDefault()
  event.stopPropagation()

  const target = promptBadgeFromTarget(event.target)
  let moved = false
  if (target && target !== source) {
    const before = event.clientX < target.getBoundingClientRect().left + target.getBoundingClientRect().width / 2
    detachPromptBadge(source)
    if (before) target.parentNode?.insertBefore(source, target)
    else target.parentNode?.insertBefore(source, target.nextSibling)
    ensurePromptBadgeSpacing(source)
    moved = true
  } else {
    const range = getPromptCaretRange(editor, event)
    const insideSource = range && source.contains(range.commonAncestorContainer)
    if (range && !insideSource) {
      detachPromptBadge(source)
      range.deleteContents()
      range.insertNode(source)
      ensurePromptBadgeSpacing(source)
      moved = true
    }
  }

  clearPromptDropState()
  if (moved) syncMovedPrompt(editor)
  handlePromptBadgeDragEnd()
}

const handlePromptBadgeDragEnd = () => {
  draggedPromptBadge.value?.classList.remove('dragging')
  draggedPromptBadge.value = null
  clearPromptDropState()
}

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

const placeCaretAtEnd = (div: HTMLDivElement) => {
  const range = document.createRange()
  const selection = window.getSelection()
  range.selectNodeContents(div)
  range.collapse(false)
  selection?.removeAllRanges()
  selection?.addRange(range)
}

const syncPromptEditor = (div: HTMLDivElement, shouldFormat: boolean) => {
  const raw = extractTextContent(div)
  const next = shouldFormat ? formatStructuredPrompt(raw) : raw
  localPrompt.value = next

  if (shouldFormat && next !== raw) {
    div.innerHTML = promptTextToHtml(next)
    placeCaretAtEnd(div)
  }

  // 立刻写回 store，否则切换节点时 vue-flow 重建 DOM 会丢失未保存的文本
  updatePrompt()
  return next
}

// 普通输入不重建 DOM，避免打断光标；粘贴长提示词时立即自动排版。
const handleContentEdit = (event: Event) => {
  const div = event.target as HTMLDivElement
  const inputType = event instanceof InputEvent ? event.inputType : ''
  syncPromptEditor(div, inputType === 'insertFromPaste')

  // 检测@触发
  checkForMention(div)
}

const handleFullscreenContentEdit = (event: Event) => {
  const div = event.target as HTMLDivElement
  const inputType = event instanceof InputEvent ? event.inputType : ''
  syncPromptEditor(div, inputType === 'insertFromPaste')
  if (editableRef.value) editableRef.value.innerHTML = promptTextToHtml(localPrompt.value)
  checkForMention(div)
}

const formatInlinePrompt = () => {
  if (!editableRef.value) return
  syncPromptEditor(editableRef.value, true)
}

const formatFullscreenPrompt = () => {
  if (!fullscreenEditableRef.value) return
  syncPromptEditor(fullscreenEditableRef.value, true)
  if (editableRef.value) editableRef.value.innerHTML = promptTextToHtml(localPrompt.value)
}

const openPromptModal = async () => {
  showAssetMention.value = false
  mentionRange.value = null
  mentionEditor.value = null
  localPrompt.value = formatStructuredPrompt(localPrompt.value)
  updatePrompt()
  showPromptModal.value = true
  await nextTick()
  if (!fullscreenEditableRef.value) return
  fullscreenEditableRef.value.innerHTML = promptTextToHtml(localPrompt.value)
  fullscreenEditableRef.value.focus()
}

const closePromptModal = () => {
  if (fullscreenEditableRef.value) {
    syncPromptEditor(fullscreenEditableRef.value, true)
  }
  if (editableRef.value) editableRef.value.innerHTML = promptTextToHtml(localPrompt.value)
  showPromptModal.value = false
  showAssetMention.value = false
  mentionRange.value = null
  mentionEditor.value = null
}

// 提取纯文本和引用标记
const extractNodeText = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''
  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  const el = node as HTMLElement
  if (el.classList.contains('asset-badge')) {
    const assetId = el.getAttribute('data-asset-id') || ''
    const assetName = el.getAttribute('data-asset-name') || ''
    return `@[${assetName}](${assetId})`
  }
  if (el.tagName === 'BR') return '\n'

  let text = ''
  el.childNodes.forEach((child) => { text += extractNodeText(child) })
  return text
}

// 提取纯文本、手动换行和引用标记。contenteditable 会用 div/p/br 表示回车，
// 不能只取 textContent，否则重新打开节点时所有镜头会黏在一起。
const extractTextContent = (div: HTMLDivElement): string => {
  let text = ''
  const nodes = Array.from(div.childNodes)
  nodes.forEach((node, index) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || ''
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement
      if (el.classList.contains('asset-badge')) {
        text += extractNodeText(el)
      } else if (el.tagName === 'BR') {
        text += '\n'
      } else {
        text += extractNodeText(el)
        if (['DIV', 'P', 'LI'].includes(el.tagName) && index < nodes.length - 1 && !text.endsWith('\n')) {
          text += '\n'
        }
      }
    }
  })
  return text.replace(/\u00a0/g, ' ')
}

// 检测@触发提及
const checkForMention = (div: HTMLDivElement) => {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) {
    showAssetMention.value = false
    mentionRange.value = null
    mentionEditor.value = null
    return
  }

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
        mentionEditor.value = div
        mentionRange.value = range.cloneRange()
        showAssetMention.value = allAssets.value.length > 0

        // 使用视口坐标，列表无论在参数卡还是全屏编辑器里都固定显示在输入位置上方。
        const anchor = range.cloneRange()
        anchor.setStart(textNode, lastAtIndex)
        anchor.setEnd(textNode, offset)
        const anchorRect = anchor.getBoundingClientRect()
        const menuWidth = 300
        const menuHeight = 210
        const gap = 10
        const left = Math.min(
          Math.max(8, anchorRect.left),
          Math.max(8, window.innerWidth - menuWidth - 8),
        )
        const preferredTop = anchorRect.top - menuHeight - gap
        // 与即梦一致：优先固定在输入位置上方；顶部空间不足时贴住视口顶部，
        // 也不改成出现在输入框下方，避免全屏编辑时菜单跳动。
        const top = Math.max(8, preferredTop)
        mentionPosition.value = { top, left }
        return
      }
    }
  }

  showAssetMention.value = false
  mentionRange.value = null
  mentionEditor.value = null
}

// 处理按键
const handleKeyDown = (event: KeyboardEvent) => {
  // 只阻止冒泡，不阻止默认行为
  event.stopPropagation()
}

// 插入素材徽章
const insertAssetBadge = (asset: any) => {
  const div = mentionEditor.value
  if (!div) return

  const sel = window.getSelection()
  const range = mentionRange.value?.cloneRange() || (sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null)
  if (!range) return

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
  badge.draggable = true
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
  sel?.removeAllRanges()
  sel?.addRange(range)

  showAssetMention.value = false
  mentionRange.value = null
  mentionEditor.value = null

  // 更新localPrompt
  localPrompt.value = extractTextContent(div)
  updatePrompt()
  const otherEditor = div === editableRef.value ? fullscreenEditableRef.value : editableRef.value
  if (otherEditor) otherEditor.innerHTML = promptTextToHtml(localPrompt.value)
  setSelectedPromptBadge(asset.id)
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
      const safeName = String(name).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const safeAssetId = String(assetId).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      return `<span class="asset-badge" contenteditable="false" draggable="true" aria-selected="false" data-asset-id="${safeAssetId}" data-asset-name="${safeName}">${thumbnail}<span class="badge-name">${safeName}</span></span>`
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
    for (const asset of uploadedAssets.value) {
      const localPath = asset.url.startsWith('local-upload:///')
        ? asset.url.slice('local-upload:///'.length).replace(/\//g, '\\')
        : undefined
      materialStore.addMaterial({
        type: asset.type,
        name: asset.name,
        url: asset.url,
        localPath,
      })
    }
  }
  // 旧项目中的单行长提示词也按结构恢复成易读格式。
  const formattedPrompt = formatStructuredPrompt(localPrompt.value)
  if (formattedPrompt !== localPrompt.value || formattedPrompt !== (props.data.prompt || '')) {
    localPrompt.value = formattedPrompt
    updatePrompt()
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
    let localPath: string | undefined
    const base64 = dataUrl.includes('base64,') ? dataUrl.split('base64,')[1] : dataUrl
    if (window.electronAPI?.upload?.save) {
      try {
        const savedPath = await window.electronAPI.upload.save(base64, file.name)
        if (savedPath) {
          localPath = savedPath
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
    materialStore.addMaterial({
      type,
      name: file.name,
      url: displayUrl,
      localPath,
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
const isDmxApi25 = computed(() => {
  const config = aiStore.getProviderConfig(selectedProviderId.value)
  return props.type === 'ai-video' && config?.kind === 'dmxapi' && selectedModel.value === 'doubao-seedance-2-5-260628'
})
const isAiideSeedance25 = computed(() => {
  const config = aiStore.getProviderConfig(selectedProviderId.value)
  return props.type === 'ai-video' && config?.kind === 'aiide' && selectedModel.value === 'dreamina-seedance-2-5-hc'
})
const activeDmxMode = computed<'reference' | 'edit' | 'extend'>(() =>
  currentTab.value === 'video-edit' ? 'edit' : currentTab.value === 'video-extend' ? 'extend' : 'reference'
)
const currentModelCapabilities = computed(() => {
  const config = aiStore.getProviderConfig(selectedProviderId.value)
  const model = config?.models.find(m => m.id === selectedModel.value)
  if (isDmxApi25.value) {
    return {
      ...model?.capabilities,
      ratios: activeDmxMode.value !== 'reference' || ['image-to-video', 'first-last-frame'].includes(currentTab.value) ? ['adaptive'] : model?.capabilities.ratios,
      durationRange: activeDmxMode.value === 'edit' ? undefined : { min: -1, max: 30 },
      durationOptions: activeDmxMode.value === 'edit' ? [] : [-1, ...Array.from({ length: 27 }, (_, i) => i + 4)],
    }
  }
  return model?.capabilities
})

const audioGenerationSupported = computed(() =>
  props.type === 'ai-video' && currentModelCapabilities.value?.audioGeneration === true
)
const frameRateSupported = computed(() => {
  const config = aiStore.getProviderConfig(selectedProviderId.value)
  return props.type === 'ai-video' && config?.kind === 'seedance' && !isDmxApi25.value
})
const durationSupported = computed(() =>
  props.type === 'ai-video' && (!!currentModelCapabilities.value?.durationRange || !!currentModelCapabilities.value?.durationOptions?.length)
)
const hasVideoAdvancedParameters = computed(() =>
  audioGenerationSupported.value || frameRateSupported.value || isDmxApi25.value
)
const outputFormatOptions: Array<'mp4' | 'mov'> = ['mp4', 'mov']

// 当前打开的选择器（用于互斥）
const openSelector = ref<string | null>(null)

// 提供给子组件的方法
provide('openSelector', openSelector)
provide('requestOpen', (selectorId: string | null) => {
  openSelector.value = selectorId
})

// 根据比例计算节点尺寸
const nodeSize = computed(() => {
  // Reference-material frames use the original media ratio. Old nodes obtain
  // the missing dimensions from their load / metadata event below.
  if (props.type === 'asset-ref' && (props.data.assetType === 'image' || props.data.assetType === 'video')) {
    const assetSize = mediaFrameSize(props.data.assetWidth, props.data.assetHeight)
    if (assetSize) return assetSize
  }

  // 视频节点和绘图节点都支持比例变化
  if (props.type !== 'ai-video' && props.type !== 'ai-image') {
    return { width: 350, height: 350 }
  }

  // 按比例直接给到容器尺寸——既保留可见的画面比例，
  // 又把极端比例（21:9、9:16）控制在一个不会撑爆画布的范围内。
  const RATIO_TO_NODE_SIZE: Record<string, { width: number; height: number }> = {
    'auto': { width: 350, height: 350 },
    '1:1':  { width: 320, height: 320 },
    '16:9': { width: 420, height: 236 },
    '9:16': { width: 236, height: 420 },
    '4:3':  { width: 360, height: 270 },
    '3:4':  { width: 270, height: 360 },
    '3:2':  { width: 390, height: 260 },
    '2:3':  { width: 260, height: 390 },
    '21:9': { width: 460, height: 197 },
  }
  return RATIO_TO_NODE_SIZE[selectedRatio.value] || RATIO_TO_NODE_SIZE['1:1']
})

watch(nodeSize, () => {
  if (props.type !== 'asset-ref') return
  void nextTick(() => updateNodeInternals([props.id]))
}, { deep: true })

// 检查是否有图片节点连接
const hasImageInput = computed(() => {
  if (isDmxApi25.value) return allAssets.value.some(asset => asset.type === 'image')
  const incomingEdges = nodeStore.edges.filter(edge => edge.target === props.id)
  return incomingEdges.some(edge => {
    const sourceNode = nodeStore.nodes.find(n => n.id === edge.source)
    return sourceNode?.type === 'ai-image'
  })
})

// 检查是否有任何输入连接
const hasAnyInput = computed(() => {
  return nodeStore.edges.some(edge => edge.target === props.id) || allAssets.value.length > 0
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
    } else if (sourceNode?.data?.outputAudio) {
      assets.push({
        id: `node_${sourceNode.id}`,
        type: 'audio',
        url: sourceNode.data.outputAudio,
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

const hasVideoInput = computed(() => allAssets.value.some(asset => asset.type === 'video' && asset.url))
const referenceCapacityHint = computed(() => {
  if (props.type !== 'ai-video' || !currentModelCapabilities.value) return ''
  const caps = currentModelCapabilities.value
  const total = allAssets.value.filter(asset => ['image', 'video', 'audio'].includes(asset.type)).length
  if (caps.maxTotalReferences) return `参考素材 ${total}/${caps.maxTotalReferences}`
  const parts = [
    caps.maxImages ? `图片 ${allAssets.value.filter(asset => asset.type === 'image').length}/${caps.maxImages}` : '',
    caps.maxVideos ? `视频 ${allAssets.value.filter(asset => asset.type === 'video').length}/${caps.maxVideos}` : '',
    caps.maxAudios ? `音频 ${allAssets.value.filter(asset => asset.type === 'audio').length}/${caps.maxAudios}` : '',
  ].filter(Boolean)
  return parts.join(' · ')
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

  // 视频节点始终提供添加参考入口；上传后由素材能力自动切换到参考模式。
  if (props.type === 'ai-video') return true

  return false
})

// 视频节点选项卡 - 根据输入动态启用
const videoTabs = computed(() => [
  { label: '文生视频', value: 'text-to-video', disabled: hasAnyInput.value },
  { label: '全能参考', value: 'universal-ref', disabled: !hasAnyInput.value },
  ...(isDmxApi25.value || isAiideSeedance25.value ? [
    { label: '图生视频', value: 'image-to-video', disabled: !hasImageInput.value },
    { label: '首尾帧', value: 'first-last-frame', disabled: !hasImageInput.value },
    { label: '视频编辑', value: 'video-edit', disabled: !hasVideoInput.value },
    { label: '视频延长', value: 'video-extend', disabled: !hasVideoInput.value },
  ] : []),
])

const videoModeOptions = computed<GenerationModeOption[]>(() =>
  videoTabs.value.map(tab => ({
    label: tab.label,
    value: tab.value,
    disabled: tab.disabled,
    reason: tab.disabled
      ? tab.value === 'text-to-video' ? '已有参考素材时不可用' : '请先连接或添加对应素材'
      : undefined,
    description: tab.value === 'video-edit'
      ? '修改已连接的视频内容'
      : tab.value === 'video-extend'
        ? '延长已连接的视频'
        : undefined,
  }))
)

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

watch([isDmxApi25, isAiideSeedance25], ([dmxEnabled, aiideEnabled]) => {
  if (!dmxEnabled && !aiideEnabled && (currentTab.value === 'video-edit' || currentTab.value === 'video-extend')) {
    currentTab.value = 'text-to-video'
  }
})

watch(activeDmxMode, (mode) => {
  if (!isDmxApi25.value) return
  nodeStore.updateNodeData(props.id, { videoMode: mode } as any)
  if (mode !== 'reference') {
    selectedRatio.value = 'adaptive'
    if (mode === 'edit') nodeStore.updateNodeData(props.id, { duration: -1 } as any)
  }
}, { immediate: true })

watch(currentTab, (tab) => {
  if (!isDmxApi25.value) return
  nodeStore.updateNodeData(props.id, {
    dmxFrameMode: tab === 'image-to-video' ? 'first_frame' : tab === 'first-last-frame' ? 'first_last_frame' : undefined,
  })
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
  if (isSelected.value && suppressGeneratorPanelAfterRun.value && props.data.status !== 'running') {
    suppressGeneratorPanelAfterRun.value = false
  }
  nodeStore.selectNode(props.id)
}

// 视频相关
const videoThumbnailRef = ref<HTMLVideoElement>()
const videoPlayerRef = ref<HTMLVideoElement>()
const videoDurations = ref<Record<string, number>>({})
const showVideoModal = ref(false)
const showImageModal = ref(false)
const previewImageUrl = computed(() =>
  props.type === 'asset-ref'
    ? ((props.data as any).assetUrl as string | undefined)
    : ((props.data as any).outputImage as string | undefined)
)

// 局部重绘
const showInpaint = ref(false)
function openInpaint() {
  showImageModal.value = false
  showInpaint.value = true
}
async function onInpaintDone(composed: string) {
  showInpaint.value = false
  try {
    const persisted = await persistImage(composed, {
      projectId: nodeStore.currentProjectId || undefined,
      nodeId: props.id,
    })
    nodeStore.updateNodeData(props.id, {
      outputImage: persisted,
      output: { url: persisted, timestamp: Date.now() },
    } as any)
    ElMessage.success('选区已重绘')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '保存重绘结果失败')
  }
}

// 视频加载完成，定位到第一帧
const onVideoLoaded = (event: Event) => {
  const video = event.target as HTMLVideoElement
  video.currentTime = 0.1 // 定位到0.1秒显示首帧
}

const formatVideoDuration = (seconds: number | undefined) => {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value <= 0) return ''
  const total = Math.round(value)
  const minutes = Math.floor(total / 60)
  const remainder = total % 60
  return minutes > 0 ? `${minutes}:${String(remainder).padStart(2, '0')}` : `${total}s`
}

const onReferenceVideoLoaded = (assetId: string, event: Event) => {
  const video = event.currentTarget as HTMLVideoElement
  if (Number.isFinite(video.duration) && video.duration > 0) {
    videoDurations.value = { ...videoDurations.value, [assetId]: video.duration }
  }
}

const updateAssetDimensions = (width: number, height: number) => {
  if (
    props.type !== 'asset-ref' ||
    (props.data.assetType !== 'image' && props.data.assetType !== 'video') ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    (props.data.assetWidth === width && props.data.assetHeight === height)
  ) return

  nodeStore.updateNodeData(props.id, { assetWidth: width, assetHeight: height })
}

// Projects created before dimensions were persisted recover them lazily. The
// source guard prevents an asynchronous event from an older URL overwriting a
// material node that has since been changed.
const onAssetImageLoaded = (event: Event) => {
  const image = event.currentTarget as HTMLImageElement
  if (image.getAttribute('src') !== props.data.assetUrl) return
  updateAssetDimensions(image.naturalWidth, image.naturalHeight)
}

const onAssetVideoLoaded = (event: Event) => {
  const video = event.currentTarget as HTMLVideoElement
  if (video.getAttribute('src') !== props.data.assetUrl) return
  updateAssetDimensions(video.videoWidth, video.videoHeight)
}

// 播放视频（弹窗）
const playVideo = () => {
  stopHoverVideo()
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

// ============= 节点历史 =============
// 按节点 id 过滤出本节点的生成历史；只显示与当前节点类型匹配的资产；收藏置顶。
const nodeHistory = computed(() => {
  const wantType = props.type === 'ai-image' ? 'image' : props.type === 'ai-video' ? 'video' : null
  if (!wantType) return []
  const list = assetStore.assetsForNode(props.id).filter((a) => a.type === wantType)
  // 稳定排序：收藏的优先，其它保持原（按时间倒序）
  return [...list].sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite))
})

const historyMediaLabel = computed(() => props.type === 'ai-image' ? '图片' : '视频')

// 当前节点 data 上显示的输出 url（用于历史条里高亮当前那张）
const currentOutputUrl = computed(() => {
  if (props.type === 'ai-image') return (props.data as any).outputImage as string | undefined
  if (props.type === 'ai-video') return (props.data as any).outputVideo as string | undefined
  return undefined
})

const showHistoryGallery = ref(false)
const historyMenuOpen = ref(false)
const historyGalleryFullscreen = ref(false)

const openHistoryGallery = () => {
  if ((props.type !== 'ai-image' && props.type !== 'ai-video') || nodeHistory.value.length < 2) return
  stopHoverVideo()
  historyMenuOpen.value = false
  historyGalleryFullscreen.value = false
  showHistoryGallery.value = true
}

const closeHistoryGallery = () => {
  historyMenuOpen.value = false
  historyGalleryFullscreen.value = false
  showHistoryGallery.value = false
  stopHoverVideo()
}

const downloadAllHistory = async () => {
  historyMenuOpen.value = false
  for (const asset of nodeHistory.value) {
    await downloadAsset(asset.url, asset.type)
  }
  ElMessage.success(`已开始下载 ${nodeHistory.value.length} 条历史${historyMediaLabel.value}`)
}

const addAllHistoryToCanvas = () => {
  historyMenuOpen.value = false
  const source = nodeStore.nodes.find((node) => node.id === props.id)
  const baseX = Number(source?.position?.x) || 0
  const baseY = Number(source?.position?.y) || 0
  nodeHistory.value.forEach((asset, index) => {
    const nodeId = `node_history_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`
    const label = asset.type === 'image' ? '历史图片' : '历史视频'
    nodeStore.addNode({
      id: nodeId,
      type: 'asset-ref',
      position: { x: baseX - 460, y: baseY + index * 250 },
      data: {
        label: asset.prompt ? `${label} ${String(index + 1).padStart(2, '0')}` : label,
        assetName: `${label} ${String(index + 1).padStart(2, '0')}`,
        assetType: asset.type,
        assetUrl: asset.url,
        status: 'completed',
      },
    } as any)
  })
  closeHistoryGallery()
  ElMessage.success(`已添加 ${nodeHistory.value.length} 条历史${historyMediaLabel.value}到画布`)
}

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
const onFpsChange = (val: number) => {
  selectedFps.value = val
  nodeStore.updateNodeData(props.id, { fps: val })
}
const onOutputFormatChange = (val: 'mp4' | 'mov') => {
  selectedOutputFormat.value = val
  nodeStore.updateNodeData(props.id, { outputFormat: val })
}
const onReturnLastFrameChange = (val: boolean) => {
  nodeStore.updateNodeData(props.id, { returnLastFrame: val })
}
const frameRateOptions = [24, 30, 60]

// 生成按钮点击：running 状态下分发取消，其它状态走正常生成
function handleGenerateClick() {
  if (props.data.status === 'running') {
    if (props.type === 'ai-image') nodeStore.cancelImageNode(props.id)
    else if (props.type === 'ai-video') nodeStore.cancelExecution(props.id)
    return
  }
  if (props.data.dmxTask) {
    nodeStore.executeNode(props.id)
    return
  }
  executeNode()
}

// 视频/图片节点参考素材：blob:/data: URL 直接传给 store，store 调用前会上传图床转公网 URL
const executeNode = async () => {
  if (props.data.status === 'running') return
  // 收集所有参考图 URL（不仅是第一张）
  const refImageEntries: { id: string; url: string }[] = []
  let inputVideo: string | undefined = undefined
  if (props.type === 'ai-video' || props.type === 'ai-image') {
    for (const a of allAssets.value) {
      if (a.type === 'image' && a.url) refImageEntries.push({ id: a.id, url: a.url })
    }
  }
  // 图片节点：按角色标签排序（subject 优先 → 无 → style → scene）
  if (props.type === 'ai-image') {
    const tagMap = (props.data as any).refTags as Record<string, RefImageTag> | undefined
    const priority: Record<string, number> = { subject: 0, none: 1, style: 2, scene: 3 }
    refImageEntries.sort((a, b) => {
      const ta = (tagMap?.[a.id] as string) || 'none'
      const tb = (tagMap?.[b.id] as string) || 'none'
      return (priority[ta] ?? 1) - (priority[tb] ?? 1)
    })
  }
  const refImageUrls = refImageEntries.map((e) => e.url)
  if (props.type === 'ai-video') {
    const refVideos = allAssets.value.filter((a) => a.type === 'video' && a.url).map((a) => a.url)
    if (refVideos.length) inputVideo = refVideos[0]
    const refAudios = allAssets.value.filter((a) => a.type === 'audio' && a.url).map((a) => a.url)
    console.log('[executeNode] refImages:', refImageUrls.length, 'videos:', refVideos.length, 'audios:', refAudios.length)
    nodeStore.updateNodeData(props.id, {
      inputVideos: refVideos,
      inputAudios: refAudios,
      videoMode: activeDmxMode.value,
      dmxFrameMode: isDmxApi25.value && currentTab.value === 'image-to-video' ? 'first_frame'
        : isDmxApi25.value && currentTab.value === 'first-last-frame' ? 'first_last_frame' : undefined,
    } as any)
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
    ...(props.type === 'ai-video' ? {
      inputVideos: allAssets.value.filter((a) => a.type === 'video' && a.url).map((a) => a.url),
      inputAudios: allAssets.value.filter((a) => a.type === 'audio' && a.url).map((a) => a.url),
      videoMode: activeDmxMode.value,
      fps: selectedFps.value,
      outputFormat: selectedOutputFormat.value,
      returnLastFrame: (props.data as any).returnLastFrame === true,
    } : {}),
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

// 节点内部不显示数字，真实进度仅用于边缘描边的长度。
const generationProgress = computed(() => {
  const value = Number(props.data.progress)
  if (!Number.isFinite(value)) return 4
  // 任务仍在运行时保留一小段未完成的空隙，避免过早显示完成。
  return Math.min(99, Math.max(4, value))
})

// 即梦生成态使用点阵动态，而不是把进度数字放在媒体节点里。
const loadingColumns = computed(() => Math.max(2, Math.round(nodeSize.value.width / 22)))
const loadingRows = computed(() => Math.max(2, Math.round(nodeSize.value.height / 22)))
const loadingGridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${loadingColumns.value}, 1fr)`,
  gridTemplateRows: `repeat(${loadingRows.value}, 1fr)`,
}))
const loadingDots = computed(() => Array.from({ length: loadingColumns.value * loadingRows.value }, (_, index) => {
  const row = Math.floor(index / loadingColumns.value)
  const column = index % loadingColumns.value
  return {
    id: index,
    delay: `${-(column * 140 + row * 180)}ms`,
    duration: '2800ms',
    opacity: (0.30 + ((column * 7 + row * 11) % 9) * 0.035).toFixed(2),
  }
}))

const nodeCaption = computed(() => {
  if (props.type === 'asset-ref') return props.data.assetName || props.data.label || '素材'
  if (props.type === 'ai-image' || props.type === 'ai-video') {
    const number = props.data.displayNumber || (nodeStore.nodes.filter(node => node.type === props.type).findIndex(node => node.id === props.id) + 1)
    return `${props.type === 'ai-image' ? '图片' : '视频'} ${String(Math.max(1, number)).padStart(2, '0')}`
  }
  return props.type === 'ai-text' ? '文本' : props.data.label || '后处理'
})
</script>

<style scoped>
.custom-node {
  position: relative;
}

/* 节点主体 */
.node-surface {
  position: relative;
  isolation: isolate;
  box-sizing: border-box;
}

.node-creation-glow {
  position: absolute;
  inset: -8px;
  z-index: -1;
  border-radius: 22px;
  pointer-events: none;
  background: radial-gradient(ellipse at center, rgba(139, 211, 255, 0.48) 0%, rgba(74, 161, 234, 0.32) 55%, rgba(76, 122, 232, 0) 78%);
  box-shadow: 0 0 22px 8px rgba(112, 192, 255, 0.24);
  filter: blur(14px);
  animation: node-creation-spread 950ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes node-creation-spread {
  0% { opacity: 0; transform: scale(0.9); }
  18% { opacity: 0.9; }
  55% { opacity: 0.4; }
  100% { opacity: 0; transform: scale(1.32, 1.42); }
}

@media (prefers-reduced-motion: reduce) {
  .node-creation-glow { display: none; animation: none; }
}

.node-main {
  position: relative;
  width: 350px;
  height: 350px;
  background: #202123;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: none;
  border-radius: 8px;
  cursor: pointer;
  transition: width 0.3s, height 0.3s, border-color 0.3s, box-shadow 0.3s, transform 90ms ease-out;
  overflow: hidden;
  box-sizing: border-box;
}

.node-main:hover {
  border-color: transparent;
  box-shadow: inset 0 0 0 calc(1px * var(--handle-scale)) rgba(255, 255, 255, 0.42);
}

/* 单选和框选共用一套描边，缩放时保持屏幕上的线宽稳定。 */
.custom-node.selected .node-main,
:global(.vue-flow__node.selected) .node-main {
  border-color: transparent;
  box-shadow: inset 0 0 0 calc(1px * var(--handle-scale)) rgba(255, 255, 255, 0.6), 0 2px 8px -2px rgba(255, 255, 255, 0.192);
}

/* 生成态沿用即梦的深色媒体框，动态放在节点内部。 */
.custom-node.media-generating .node-main {
  background: #1c1d1f;
  border-color: rgba(255, 255, 255, 0.18);
  box-shadow: inset 0 0 0 calc(1px * var(--handle-scale)) rgba(255, 255, 255, 0.08), 0 10px 28px rgba(0, 0, 0, 0.18);
}
.custom-node.media-generating .node-main:hover,
.custom-node.media-generating.selected .node-main,
:global(.vue-flow__node.selected) .node-main.media-generating {
  border-color: rgba(255, 255, 255, 0.34);
  box-shadow: inset 0 0 0 calc(1px * var(--handle-scale)) rgba(255, 255, 255, 0.20), 0 10px 30px rgba(0, 0, 0, 0.24);
}
.custom-node.media-error .node-main {
  background: #211f21;
  border-color: rgba(239, 132, 132, 0.34);
  box-shadow: inset 0 0 0 calc(1px * var(--handle-scale)) rgba(239, 132, 132, 0.08), 0 10px 28px rgba(0, 0, 0, 0.18);
}

/* Outline preserves node dimensions and anchor positions while receiving. */
.custom-node.connection-receiving .node-main {
  border-color: transparent;
  box-shadow: none;
  outline: calc(2px * var(--handle-scale)) solid #008ee5;
  outline-offset: 0;
}

.custom-node.connection-receiving .node-main {
  pointer-events: none;
}

.custom-node.connection-receiving .node-main :deep(*) {
  pointer-events: none !important;
}

.custom-node.connection-disabled {
  filter: grayscale(1) opacity(0.42);
  cursor: not-allowed;
}

.custom-node.connection-disabled .node-main,
.custom-node.connection-disabled .node-main :deep(*) {
  pointer-events: none !important;
}

.custom-node.connection-disabled :deep(.custom-handle) {
  pointer-events: none !important;
}

.custom-node.connection-disabled :deep(.custom-handle::before),
.custom-node.connection-disabled :deep(.custom-handle::after) {
  pointer-events: none !important;
  opacity: 0 !important;
}

.custom-node.connection-disabled .generator-card {
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .custom-node .node-main { transform: none !important; transition: none; }
}

.node-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 24px;
  gap: 16px;
  box-sizing: border-box;
}

.node-content.asset-content {
  padding: 0;
  gap: 0;
  overflow: hidden;
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
  display: block;
  object-fit: contain;
  border-radius: 8px;
}

.asset-video-duration {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 3px 7px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.62);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: 0.02em;
  pointer-events: none;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
}

.asset-preview-clickable {
  cursor: zoom-in;
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

/* 文本节点仍使用文字进度；图片和视频节点使用下方点阵加载态。 */
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

/* 媒体生成进度沿圆角节点边框走，不占用节点内容区域。 */
.media-progress-ring {
  position: absolute;
  inset: 0;
  z-index: 4;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;
}
.media-progress-ring svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.media-progress-ring-track,
.media-progress-ring-value {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.media-progress-ring-track {
  stroke: rgba(255, 255, 255, 0.2);
  stroke-width: calc(0.55px * var(--handle-scale));
}
.media-progress-ring-value {
  stroke: rgba(240, 244, 250, 0.96);
  stroke-width: calc(0.8px * var(--handle-scale));
  transition: stroke-dasharray 620ms cubic-bezier(0.22, 1, 0.36, 1);
}

.media-loading-display {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background:
    radial-gradient(circle at 50% 48%, rgba(255, 255, 255, 0.055), transparent 54%),
    linear-gradient(120deg, rgba(255, 255, 255, 0.018), transparent 42%, rgba(255, 255, 255, 0.025));
}
.media-loading-display::before {
  content: '';
  position: absolute;
  inset: -25%;
  background: linear-gradient(115deg, transparent 35%, rgba(255, 255, 255, 0.055) 48%, transparent 62%);
  background-size: 220% 100%;
  animation: loading-sheen 3.8s ease-in-out infinite;
  pointer-events: none;
}
.loading-dot-grid {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  grid-template-rows: repeat(8, minmax(0, 1fr));
  width: 100%;
  height: 100%;
  padding: 5px;
  box-sizing: border-box;
  opacity: 0.82;
}
.loading-dot {
  align-self: center;
  justify-self: center;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: rgba(214, 219, 227, 0.92);
  box-shadow: 0 0 5px rgba(214, 219, 227, 0.18);
  opacity: var(--dot-opacity);
  animation: loading-dot-breathe var(--dot-duration) ease-in-out var(--dot-delay) infinite alternate;
}
@keyframes loading-dot-breathe {
  0% { opacity: calc(var(--dot-opacity) * .35); transform: scale(.72); }
  50% { opacity: var(--dot-opacity); transform: scale(1); }
  100% { opacity: calc(var(--dot-opacity) * .5); transform: scale(.82); }
}
@keyframes loading-sheen {
  0%, 35% { background-position: 120% 0; opacity: 0; }
  52% { opacity: 1; }
  72%, 100% { background-position: -20% 0; opacity: 0; }
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
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
.media-error-display {
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 28px;
  box-sizing: border-box;
}
.media-error-display .error-icon {
  flex: 0 0 auto;
  width: 42px;
  height: 42px;
  color: #ef9292;
}
.media-error-display .error-icon svg {
  width: 38px;
  height: 38px;
  filter: drop-shadow(0 2px 10px rgba(239, 132, 132, 0.18));
}
.error-copy {
  min-width: 0;
  max-width: min(78%, 330px);
}
.error-title {
  margin-bottom: 5px;
  color: rgba(255, 255, 255, 0.88);
  font-size: 14px;
  font-weight: 600;
}
.media-error-display .error-text {
  max-height: 104px;
  color: rgba(255, 218, 218, 0.72);
  font-size: 12px;
  line-height: 1.55;
  text-align: left;
}

/* 生成中的动态背景 */
.node-content.generating {
  background: #1c1d1f;
  background-size: 200% 200%;
  animation: none;
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

/* 点阵铺满媒体框，完成或失败后卸载动画。 */
.custom-node.media-generating .node-content { padding: 0; gap: 0; }
@media (prefers-reduced-motion: reduce) {
  .loading-dot, .media-loading-display::before { animation: none; }
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
  min-width: 56px;
  min-height: 56px;
  padding: 6px 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  background: rgba(0, 0, 0, 0.4);
  border: 2px solid rgba(255,255,255,0.3);
  border-radius: 18px;
  backdrop-filter: blur(8px);
  transition: all 0.3s;
  pointer-events: none;
}
.play-overlay svg {
  width: 24px; height: 24px;
}
.play-overlay-hint {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.85);
  letter-spacing: 0.05em;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  white-space: nowrap;
}

.video-thumbnail:hover .play-overlay {
  background: rgba(0, 0, 0, 0.4);
}
.video-preview-playing .play-overlay,
.asset-thumbnail.video.video-preview-playing .video-overlay { opacity: 0; pointer-events: none; }

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
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.48);
}

.video-modal-close {
  position: absolute;
  top: -50px;
  right: 0;
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.10);
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 50%;
  color: rgba(255, 255, 255, 0.90);
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
  background: rgba(255, 255, 255, 0.18);
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
  background: rgba(255, 255, 255, 0.10);
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 20px;
  color: rgba(255, 255, 255, 0.92);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.modal-download:hover {
  background: rgba(255, 255, 255, 0.18);
  box-shadow: 0 0 12px rgba(255, 255, 255, 0.12);
}
.modal-edit {
  height: 40px;
  padding: 0 16px;
  background: rgba(255, 255, 255, 0.10);
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 20px;
  color: rgba(255, 255, 255, 0.92);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.modal-edit:hover {
  background: rgba(255, 255, 255, 0.18);
  box-shadow: 0 0 12px rgba(255, 255, 255, 0.12);
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
  min-width: 38px;
  min-height: 38px;
  padding: 6px 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  background: rgba(0, 0, 0, 0.42);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 14px;
  backdrop-filter: blur(2px);
  transition: opacity 0.25s, background 0.25s, transform 0.25s;
  pointer-events: none;
  opacity: 0;
}
.preview-overlay-hint {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.85);
  letter-spacing: 0.05em;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  white-space: nowrap;
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
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.58);
}

.image-modal-close {
  position: absolute;
  top: -50px;
  right: 0;
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.10);
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 50%;
  color: rgba(255, 255, 255, 0.90);
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
  background: rgba(255, 255, 255, 0.18);
  border-color: rgba(255, 255, 255, 0.46);
  color: #fff;
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

.node-caption {
  position: absolute;
  bottom: calc(100% + 8px * var(--handle-scale));
  left: 0;
  max-width: 100%;
  font-size: calc(12px * var(--handle-scale));
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.65);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: grab;
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
.node-status-badge.with-history-trigger {
  right: calc(58px * var(--handle-scale));
}

/* 视频节点历史入口：固定在节点右上角，跟随缩放保持屏幕尺寸稳定。 */
.node-history-trigger {
  position: absolute;
  top: calc(10px * var(--handle-scale));
  right: calc(10px * var(--handle-scale));
  z-index: 4;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-width: calc(36px * var(--handle-scale));
  height: calc(24px * var(--handle-scale));
  padding: 0 calc(7px * var(--handle-scale));
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: calc(7px * var(--handle-scale));
  background: rgba(28, 28, 30, 0.78);
  color: rgba(255, 255, 255, 0.82);
  font-size: calc(12px * var(--handle-scale));
  line-height: 1;
  cursor: pointer;
  backdrop-filter: blur(10px);
  transition: background .16s ease, border-color .16s ease, color .16s ease;
}
.node-history-trigger:hover {
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.38);
  color: #fff;
}
.node-history-chevron {
  font-size: 1.25em;
  line-height: .7;
  transform: translateY(-.02em);
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

/* 即梦式历史记录画廊 */
.history-gallery-overlay {
  position: fixed;
  inset: 0;
  z-index: 12000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: rgba(8, 8, 10, 0.72);
  backdrop-filter: blur(12px);
}
.history-gallery-overlay.fullscreen {
  padding: 0;
  background: #111113;
}
.history-gallery {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(1080px, 100%);
  max-height: min(820px, 100%);
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 18px;
  background: #1b1b1d;
  color: rgba(255, 255, 255, 0.92);
  box-shadow: 0 24px 90px rgba(0, 0, 0, 0.54);
}
.history-gallery-overlay.fullscreen .history-gallery {
  width: 100%;
  height: 100%;
  max-height: none;
  border: 0;
  border-radius: 0;
}
.history-gallery-header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 64px;
  padding: 0 20px 0 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}
.history-gallery-title {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: .01em;
}
.history-gallery-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.history-gallery-action,
.history-gallery-icon-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: rgba(255, 255, 255, 0.72);
  cursor: pointer;
  transition: background .16s ease, border-color .16s ease, color .16s ease;
}
.history-gallery-action {
  padding: 0 10px;
  font-size: 12px;
}
.history-gallery-icon-action {
  width: 34px;
  padding: 0;
  font-size: 20px;
  line-height: 1;
}
.history-gallery-action:hover,
.history-gallery-icon-action:hover {
  border-color: rgba(255, 255, 255, .14);
  background: rgba(255, 255, 255, .10);
  color: #fff;
}
.history-gallery-menu {
  position: absolute;
  top: 52px;
  right: 58px;
  z-index: 2;
  display: flex;
  flex-direction: column;
  min-width: 168px;
  padding: 6px;
  border: 1px solid rgba(255, 255, 255, .12);
  border-radius: 10px;
  background: #29292c;
  box-shadow: 0 14px 36px rgba(0, 0, 0, .36);
}
.history-gallery-menu button {
  padding: 9px 11px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: rgba(255, 255, 255, .82);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.history-gallery-menu button:hover {
  background: rgba(255, 255, 255, .10);
  color: #fff;
}
.history-gallery-body {
  display: grid;
  grid-template-columns: minmax(0, 1.12fr) minmax(0, 1fr);
  gap: 22px;
  min-height: 0;
  padding: 22px 24px 26px;
  overflow: auto;
}
.history-primary-section,
.history-earlier-section {
  min-width: 0;
}
.history-gallery-section-label {
  margin-bottom: 10px;
  color: rgba(255, 255, 255, .52);
  font-size: 12px;
}
.history-large-card,
.history-gallery-card {
  position: relative;
  display: block;
  width: 100%;
  overflow: hidden;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, .12);
  border-radius: 12px;
  background: #101012;
  cursor: pointer;
  transition: border-color .16s ease, transform .16s ease, box-shadow .16s ease;
}
.history-large-card {
  aspect-ratio: 16 / 9;
}
.history-gallery-card {
  aspect-ratio: 16 / 9;
}
.history-large-card:hover,
.history-gallery-card:hover,
.history-large-card.active,
.history-gallery-card.active {
  border-color: rgba(255, 255, 255, .52);
  box-shadow: 0 8px 24px rgba(0, 0, 0, .24);
  transform: translateY(-1px);
}
.history-gallery-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  max-height: 560px;
  overflow: auto;
  padding-right: 2px;
}
.history-gallery-media {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #0e0e10;
}
.history-play-button {
  position: absolute;
  top: 50%;
  left: 50%;
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  transform: translate(-50%, -50%);
  border: 1px solid rgba(255, 255, 255, .45);
  border-radius: 50%;
  background: rgba(0, 0, 0, .46);
  color: #fff;
  font-size: 16px;
  line-height: 1;
  pointer-events: none;
  transition: opacity .16s ease, transform .16s ease;
}
.history-gallery-media.video-preview-playing + .history-play-button {
  opacity: 0;
  transform: translate(-50%, -50%) scale(.86);
}
@media (max-width: 760px) {
  .history-gallery-overlay { padding: 12px; }
  .history-gallery-body { grid-template-columns: 1fr; gap: 20px; }
  .history-gallery-grid { max-height: none; }
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
.reference-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 2px 2px 7px;
  color: rgba(255,255,255,.58);
  font-size: 12px;
}
.reference-capacity { color: rgba(255,255,255,.34); font-size: 10px; }

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

.asset-item { position: relative; z-index: 1; }
.asset-item:hover { z-index: 3; }
.reference-hover-preview {
  position: fixed;
  z-index: 20030;
  width: 248px;
  min-height: 148px;
  max-height: 230px;
  padding: 6px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,.20);
  border-radius: 12px;
  background: #242424;
  box-shadow: 0 16px 46px rgba(0,0,0,.48), 0 0 0 1px rgba(0,0,0,.22);
  pointer-events: auto;
}
.reference-hover-preview img,
.reference-hover-preview video {
  display: block;
  width: 100%;
  height: 100%;
  max-height: none;
  object-fit: contain;
  border-radius: 8px;
  background: #161616;
}
.reference-hover-audio {
  min-height: 136px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: rgba(255,255,255,.72);
  font-size: 11px;
  text-align: center;
}
.reference-preview-enter-active { transition: opacity .14s ease, transform .14s ease; }
.reference-preview-leave-active { transition: opacity .08s ease; }
.reference-preview-enter-from { opacity: 0; transform: translateY(4px) scale(.97); }
.reference-preview-leave-to { opacity: 0; transform: none; }

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

/* 参考图角色标签：bottom-right 小圆徽章，点击循环 */
.ref-tag-badge {
  position: absolute;
  bottom: 3px;
  right: 3px;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(20, 24, 36, 0.85);
  color: rgba(255, 255, 255, 0.55);
  padding: 0;
  line-height: 1;
  transition: all 0.15s;
  backdrop-filter: blur(2px);
}
.ref-tag-badge:hover {
  transform: scale(1.15);
  border-color: rgba(255, 255, 255, 0.6);
}
.ref-tag-badge.ref-tag-subject {
  background: rgba(110, 231, 255, 0.85);
  color: #04121a;
  border-color: rgba(110, 231, 255, 1);
  box-shadow: 0 0 6px rgba(110, 231, 255, 0.6);
}
.ref-tag-badge.ref-tag-style {
  background: rgba(167, 139, 250, 0.85);
  color: #18113b;
  border-color: rgba(167, 139, 250, 1);
  box-shadow: 0 0 6px rgba(167, 139, 250, 0.6);
}
.ref-tag-badge.ref-tag-scene {
  background: rgba(255, 168, 110, 0.9);
  color: #2a1607;
  border-color: rgba(255, 168, 110, 1);
  box-shadow: 0 0 6px rgba(255, 168, 110, 0.55);
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
  position: fixed;
  width: 300px;
  max-height: 200px;
  overflow-y: auto;
  background: #262626;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 12px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.42);
  z-index: 20020;
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
  background: rgba(255, 255, 255, 0.10);
  box-shadow: inset 2px 0 0 rgba(255, 255, 255, 0.72);
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
  color: rgba(255, 255, 255, 0.64);
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
  height: 132px;
  min-height: 80px;
  max-height: 180px;
}

.generator-input.editable {
  padding-right: 92px;
  overflow-y: auto;
  overscroll-behavior: contain;
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

/* 即梦式参数卡：中性深灰层级，避免整块青色描边。 */
.generator-card {
  background: #262626;
  border-color: rgba(255, 255, 255, 0.12);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.34);
}
.generator-input {
  background: rgba(255, 255, 255, 0.035);
  border-color: rgba(255, 255, 255, 0.12);
}
.generator-input:focus {
  border-color: rgba(255, 255, 255, 0.34);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
}
.tab-btn.active,
.option-btn,
.generator-options :deep(button) {
  border-color: rgba(255, 255, 255, 0.14);
}
.tab-btn.active,
.option-btn:hover,
.generator-options :deep(button:hover) {
  background: rgba(255, 255, 255, 0.08);
  color: #f5f5f5;
}
.generate-btn {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.22);
  color: #f5f5f5;
}
.generate-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.38);
  box-shadow: none;
}

/* Prompt 改写按钮 */
.prompt-input-wrap {
  position: relative;
}
.reference-warning {
  margin-bottom: 10px;
  padding: 8px 10px;
  border: 1px solid rgba(234, 179, 8, 0.4);
  border-radius: 6px;
  color: #e6bf64;
  background: rgba(234, 179, 8, 0.08);
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.prompt-char-count {
  position: absolute;
  top: 8px;
  right: 38px;
  z-index: 5;
  padding: 2px 6px;
  border-radius: 5px;
  background: rgba(8, 14, 22, 0.78);
  color: rgba(255, 255, 255, 0.56);
  font-size: 11px;
  line-height: 18px;
  pointer-events: none;
  white-space: nowrap;
}
.prompt-char-count.fullscreen {
  position: static;
  padding: 3px 8px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.68);
  font-size: 12px;
}
.prompt-fullscreen-btn {
  position: absolute;
  top: 5px;
  right: 5px;
  z-index: 5;
  width: 26px;
  height: 26px;
  border: 1px solid rgba(110, 231, 255, 0.4);
  border-radius: 6px;
  background: rgba(2, 10, 18, 0.78);
  color: #6ee7ff;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
}
.prompt-fullscreen-btn:hover {
  background: rgba(110, 231, 255, 0.2);
  border-color: #6ee7ff;
}
.prompt-enhance {
  position: absolute;
  top: 4px;
  right: 36px;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 4px;
}
.prompt-enhance-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(110, 231, 255, 0.15);
  border: 1px solid rgba(110, 231, 255, 0.4);
  color: #6ee7ff;
  border-radius: 50%;
  cursor: pointer;
  font-size: 12px;
  padding: 0;
  transition: all 0.18s;
  backdrop-filter: blur(4px);
}
.prompt-enhance-btn:hover:not(:disabled) {
  background: rgba(110, 231, 255, 0.3);
  box-shadow: 0 0 12px rgba(110, 231, 255, 0.5);
  transform: scale(1.08);
}
.prompt-enhance-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.enhance-spinner {
  display: inline-block;
  animation: enhance-spin 0.9s linear infinite;
}
@keyframes enhance-spin {
  to { transform: rotate(360deg); }
}
.prompt-enhance-menu {
  position: absolute;
  top: 28px;
  right: 0;
  display: flex;
  flex-direction: column;
  min-width: 140px;
  max-height: 320px;
  overflow-y: auto;
  background: rgba(10, 14, 26, 0.96);
  border: 1px solid rgba(110, 231, 255, 0.35);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5), 0 0 16px rgba(110, 231, 255, 0.15);
  overflow-x: hidden;
}
.enhance-item {
  background: transparent;
  border: none;
  color: #e6f7ff;
  text-align: left;
  padding: 7px 12px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;
}
.enhance-item:hover {
  background: rgba(110, 231, 255, 0.18);
  color: #6ee7ff;
}
.enhance-menu-enter-active,
.enhance-menu-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}
.enhance-menu-enter-from,
.enhance-menu-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* 素材徽章 */
.asset-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 3px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 5px;
  color: rgba(255, 255, 255, 0.88);
  transition: background .16s ease, border-color .16s ease, color .16s ease, box-shadow .16s ease;
  font-size: 12px;
  vertical-align: middle;
  margin: 0 2px;
  cursor: grab;
  user-select: none;
  max-height: 24px;
}

.asset-badge:hover {
  background: rgba(255, 255, 255, 0.10);
  border-color: rgba(255, 255, 255, 0.16);
  color: #fff;
  box-shadow: 0 3px 12px rgba(0,0,0,.18);
}

.generator-input.editable .asset-badge,
.prompt-modal-editor .asset-badge {
  cursor: grab;
}

.generator-input.editable .asset-badge:active,
.prompt-modal-editor .asset-badge:active {
  cursor: grabbing;
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

/* 参数面板内部控件统一使用灰白反馈，保留错误和参考角色的语义颜色。 */
.custom-node .generator-card { border: 0; border-radius: 24px; padding: 20px; background: #222222; }
.generator-card .generator-input,
.generator-card .generator-input:focus { background: transparent; border-color: transparent; box-shadow: none; padding-left: 0; }
.generator-card .asset-upload,
.generator-card .upload-prompt { border: 1px solid transparent; background: #ffffff0a; border-radius: 12px; }
.generator-card .asset-upload:hover,
.generator-card .upload-prompt:hover { background: #ffffff14; border-color: #ffffff20; }
.generator-card .upload-icon,
.generator-card .upload-prompt-btn,
.generator-card .advanced-toggle,
.generator-card .advanced-label { color: #ffffff99; }
.generator-card .prompt-fullscreen-btn,
.generator-card .prompt-enhance-btn { background: #ffffff0a; color: #ddd; border-color: transparent; box-shadow: none; }
.generator-card .prompt-fullscreen-btn:hover,
.generator-card .prompt-enhance-btn:hover:not(:disabled) { background: #ffffff18; color: #fff; box-shadow: none; }
.generator-card .prompt-char-count { background: #222; top: auto; bottom: 8px; right: 0; }
.generator-card .prompt-enhance-menu,
.generator-card .asset-mention-list { background: #262626; border-color: #ffffff14; box-shadow: 0 8px 32px #0005; border-radius: 12px; }
.generator-card .enhance-item:hover,
.generator-card .mention-item:hover { background: #ffffff14; color: #fff; }
.generator-card .advanced-input:focus { border-color: #ffffff66; box-shadow: none; }
.generator-card .generate-btn { background: #eee; border: 0; color: #222; border-radius: 18px; }
.generator-card .generate-btn:hover:not(:disabled) { background: #fff; box-shadow: none; }
.generator-card .generator-options { flex-wrap: wrap; gap: 4px; }
.generator-card :deep(.provider-btn),
.generator-card :deep(.model-btn),
.generator-card :deep(.ratio-btn) { border-color: transparent; padding: 8px; min-width: 0; }
.generator-card :deep(.provider-dropdown),
.generator-card :deep(.model-dropdown),
.generator-card :deep(.ratio-dropdown) { border-color: #ffffff14; background: #262626; box-shadow: 0 8px 32px #0005; }
.generator-card :deep(.provider-option.active),
.generator-card :deep(.model-option.active),
.generator-card :deep(.ratio-option.active),
.generator-card :deep(.resolution-option.active),
.generator-card :deep(.duration-option.active),
.generator-card :deep(.toggle-btn.active) { background: #ffffff14; border-color: #ffffff44; color: #f5f5f5; }
.generator-card :deep(.provider-option:hover),
.generator-card :deep(.model-option:hover),
.generator-card :deep(.ratio-option:hover),
.generator-card :deep(.resolution-option:hover),
.generator-card :deep(.duration-option:hover) { background: #ffffff14; border-color: #ffffff33; color: #fff; }
.generator-card :deep(.ratio-option.active .ratio-icon-box),
.generator-card :deep(.duration-value) { color: #f5f5f5; }
.generator-card :deep(.toggle-indicator.active) { background: #666; box-shadow: none; }
.generator-card :deep(.slider::-webkit-slider-thumb) { background: #ddd; box-shadow: none; }
.generator-card :deep(.slider::-moz-range-thumb) { background: #ddd; box-shadow: none; }

/* 连接点样式 */
:deep(.custom-handle) {
  /* Keep Vue Flow's measured anchor on the node border. The larger hit area
     lives in ::before so it cannot push the visual edge endpoint outward. */
  width: 1px;
  height: 1px;
  min-width: 0;
  min-height: 0;
  background: transparent !important;
  border: 0 !important;
  border-radius: 0;
  /* The measured handle stays at the border, but must receive pointer events
     so Vue Flow can start/end a connection. The pseudo-element enlarges it. */
  pointer-events: auto !important;
  opacity: 1 !important;
  transition: opacity 0.2s !important;
  box-shadow: none;
}

:deep(.custom-handle.vue-flow__handle-left) {
  left: 0.5px;
}

:deep(.custom-handle.vue-flow__handle-right) {
  right: 0.5px;
}

:deep(.custom-handle::after) {
  content: '';
  position: absolute;
  width: var(--handle-dot-size, 20px);
  height: var(--handle-dot-size, 20px);
  top: 50%;
  left: calc(50% + var(--handle-dot-offset, 22px));
  /* Vue Flow scales the node; explicit inverse pixels keep this dot constant on screen. */
  transform: translate(-50%, -50%) translate(var(--magnet-x, 0px), var(--magnet-y, 0px));
  border-radius: 50%;
  background: #202123 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cpath d='M10 6v8M6 10h8' fill='none' stroke='%23a9adb5' stroke-width='1.25' stroke-linecap='round'/%3E%3C/svg%3E") center / 100% 100% no-repeat;
  border: var(--handle-dot-border, 1px) solid #71757c;
  opacity: 0;
  transition: opacity 0.18s ease, transform 300ms cubic-bezier(0.22, 1.5, 0.36, 1);
  pointer-events: none;
}

.custom-node:hover :deep(.custom-handle::after),
.custom-node :deep(.custom-handle.handle-magnetic::after),
.custom-node.selected :deep(.custom-handle::after),
:deep(.custom-handle:hover::after),
:deep(.custom-handle.connecting::after) {
  opacity: 1;
}

:deep(.custom-handle.handle-magnetic::after) {
  transition: opacity 0.18s ease, transform 70ms ease-out;
}

.custom-node :deep(.custom-handle.handle-hidden-receiving::after) {
  opacity: 0;
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  :deep(.custom-handle::after) {
    transform: translate(-50%, -50%) translate(var(--magnet-x, 0px), var(--magnet-y, 0px));
    transition: none;
  }
}

:deep(.custom-node:hover .custom-handle) {
  opacity: 1 !important;
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
  width: var(--handle-hit-width, 40px);
  height: var(--handle-hit-height, 80px);
  top: 50%;
  left: 50%;
  transform: translateY(-50%);
  border-radius: 0;
  pointer-events: auto;
}

:deep(.custom-handle.vue-flow__handle-left::before) {
  transform: translate(-100%, -50%);
}

:deep(.custom-handle.vue-flow__handle-left::after) {
  left: calc(50% - var(--handle-dot-offset, 22px));
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

.seed-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
}
.seed-row .advanced-input {
  flex: 1;
  font-family: 'Courier New', monospace;
}
.seed-dice {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 0 2px;
  transition: transform 0.2s;
}
.seed-dice:hover:not(:disabled) {
  transform: rotate(15deg);
}
.seed-dice:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.advanced-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 0;
  background: transparent;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.62);
  cursor: pointer;
  user-select: none;
  transition: color 0.2s;
}
.advanced-toggle:hover { color: #fff; }
.video-advanced-panel { display: flex; flex-direction: column; gap: 12px; }
.advanced-switch-field,
.advanced-select-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}
.advanced-switch-field > span,
.advanced-select-field > span {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.advanced-switch-field strong,
.advanced-select-field strong { color: rgba(255,255,255,.82); font-size: 11px; font-weight: 500; }
.advanced-switch-field small,
.advanced-select-field small { color: rgba(255,255,255,.4); font-size: 10px; line-height: 1.2; }
.switch-control {
  position: relative;
  flex: 0 0 auto;
  width: 34px;
  height: 20px;
  padding: 2px;
  border: 0;
  border-radius: 999px;
  background: rgba(255,255,255,.16);
  cursor: pointer;
  transition: background .16s ease;
}
.switch-control span {
  display: block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: rgba(255,255,255,.86);
  transition: transform .16s ease;
}
.switch-control.active { background: rgba(255,255,255,.48); }
.switch-control.active span { transform: translateX(14px); background: #fff; }
.segmented-options { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px; }
.segmented-options button {
  height: 27px;
  padding: 0 8px;
  border: 1px solid rgba(255,255,255,.11);
  border-radius: 7px;
  background: rgba(255,255,255,.03);
  color: rgba(255,255,255,.62);
  font: inherit;
  font-size: 10px;
  cursor: pointer;
}
.segmented-options button:hover { background: rgba(255,255,255,.1); color: #fff; }
.segmented-options button.active { background: rgba(255,255,255,.15); border-color: rgba(255,255,255,.35); color: #fff; }
.advanced-arrow {
  display: inline-block;
  transition: transform 0.2s;
  font-size: 9px;
}
.advanced-arrow.open { transform: rotate(90deg); }
.advanced-panel {
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 6px;
  margin: 0 8px 6px;
}
.advanced-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.advanced-field.disabled {
  opacity: 0.5;
}
.advanced-field-label {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.62);
  font-weight: 500;
  letter-spacing: 0.05em;
  display: flex;
  align-items: center;
  gap: 6px;
}
.field-unsupported {
  font-size: 9px;
  color: rgba(255, 168, 110, 0.85);
  background: rgba(255, 168, 110, 0.1);
  border: 1px solid rgba(255, 168, 110, 0.3);
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: 500;
  letter-spacing: 0;
}
.advanced-input {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: #fff;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-family: inherit;
}
.advanced-input:disabled {
  cursor: not-allowed;
  background: rgba(0, 0, 0, 0.2);
  color: rgba(255, 255, 255, 0.4);
}
.advanced-input:focus {
  outline: none;
  border-color: rgba(110, 231, 255, 0.6);
  box-shadow: 0 0 6px rgba(110, 231, 255, 0.3);
}
.expand-advanced-enter-active,
.expand-advanced-leave-active {
  transition: max-height 0.2s ease, opacity 0.2s ease;
  overflow: hidden;
}
.expand-advanced-enter-from,
.expand-advanced-leave-to {
  max-height: 0;
  opacity: 0;
}
.expand-advanced-enter-to,
.expand-advanced-leave-from {
  max-height: 80px;
  opacity: 1;
}

.assets-preview.refs-blocked,
.upload-prompt.refs-blocked {
  position: relative;
  opacity: 0.35;
  pointer-events: none;
  filter: saturate(0.4);
}
.assets-preview.refs-blocked::after,
.upload-prompt.refs-blocked::after {
  content: '⚠ 当前模型不支持参考图，将被忽略';
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(20, 5, 0, 0.8);
  color: #ffb86c;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.03em;
  pointer-events: auto;
  cursor: not-allowed;
  border-radius: 6px;
  text-shadow: 0 0 6px rgba(255, 184, 108, 0.5);
}

/* 提示词全屏编辑器 */
.prompt-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 10020;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: rgba(0, 0, 0, 0.88);
  backdrop-filter: blur(8px);
}
.prompt-modal-content {
  width: min(1100px, 94vw);
  height: min(780px, 90vh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #222222;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 24px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
}
.prompt-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.prompt-modal-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.prompt-modal-title {
  color: #fff;
  font-size: 17px;
  font-weight: 600;
}
.prompt-modal-hint {
  margin-top: 4px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
}
.prompt-modal-close {
  padding: 8px 18px;
  flex-shrink: 0;
  border: 1px solid transparent;
  border-radius: 8px;
  background: #eeeeee;
  color: #222222;
  cursor: pointer;
}
.prompt-modal-close:hover {
  background: #ffffff;
}
.prompt-modal-editor {
  flex: 1;
  min-height: 0;
  margin: 18px;
  padding: 20px;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid transparent;
  border-radius: 10px;
  outline: none;
  background: transparent;
  color: #f4f7fa;
  font-family: inherit;
  font-size: 16px;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
  cursor: text;
}
.prompt-modal-editor:focus {
  border-color: rgba(255, 255, 255, 0.12);
  box-shadow: none;
}
.prompt-modal-editor:empty::before {
  content: attr(data-placeholder);
  color: rgba(255, 255, 255, 0.3);
  pointer-events: none;
}
</style>
