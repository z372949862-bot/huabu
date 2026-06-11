<template>
  <!-- 视频播放弹窗 -->
  <Teleport to="body">
    <div v-if="showVideo" class="video-modal-overlay" @click="$emit('close')">
      <div class="video-modal-content" @click.stop>
        <div class="modal-toolbar">
          <button class="modal-download" @click="$emit('download', videoUrl, 'video')">⬇ 下载</button>
          <button class="video-modal-close" @click="$emit('close')">
            <svg viewBox="0 0 16 16" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg>
          </button>
        </div>
        <video ref="videoPlayerRef" :src="videoUrl" class="video-modal-player" controls autoplay />
      </div>
    </div>
  </Teleport>

  <!-- 图片预览弹窗 -->
  <Teleport to="body">
    <div v-if="showImage" class="image-modal-overlay" @click="$emit('close')">
      <div class="image-modal-content" @click.stop>
        <div class="modal-toolbar">
          <button class="modal-download" @click="$emit('download', imageUrl, 'image')">⬇ 下载</button>
          <button class="image-modal-close" @click="$emit('close')">
            <svg viewBox="0 0 16 16" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg>
          </button>
        </div>
        <img :src="imageUrl" class="image-modal-preview" />
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'

defineProps<{
  showVideo: boolean
  showImage: boolean
  videoUrl?: string
  imageUrl?: string
}>()

defineEmits<{
  close: []
  download: [url: string | undefined, type: 'image' | 'video']
}>()

const videoPlayerRef = ref<HTMLVideoElement>()
defineExpose({ videoPlayerRef })
</script>

<style scoped>
.video-modal-overlay,
.image-modal-overlay {
  position: fixed;
  top: 0; left: 0;
  width: 100vw; height: 100vh;
  background: rgba(0, 0, 0, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  animation: fadeIn 0.3s;
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.video-modal-content,
.image-modal-content {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
.video-modal-player {
  max-width: 100%; max-height: 90vh;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 217, 255, 0.3);
}
.image-modal-preview {
  max-width: 100%; max-height: 90vh;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 217, 255, 0.3);
}
.modal-toolbar {
  position: absolute;
  top: -50px; right: 0;
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
.video-modal-close,
.image-modal-close {
  width: 40px; height: 40px;
  background: rgba(0, 217, 255, 0.2);
  border: 1px solid #00D9FF;
  border-radius: 50%;
  color: #00D9FF;
  font-size: 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  line-height: 1;
  padding: 0;
}
.video-modal-close:hover,
.image-modal-close:hover {
  background: rgba(0, 217, 255, 0.4);
  transform: rotate(90deg);
}
</style>
