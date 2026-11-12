<template>
  <div class="idea-references nodrag" @mousedown.stop @click.stop>
    <div class="link-row">
      <select v-model="kind" aria-label="参考素材类型" :disabled="disabled"><option value="image">图片</option><option value="video">视频</option><option value="audio">音频</option></select>
      <input v-model="url" aria-label="参考素材链接" placeholder="HTTPS 链接或 asset://素材ID" :disabled="disabled" @keydown.enter.prevent="add" />
      <button type="button" :disabled="disabled || !url.trim()" @click="add">添加</button>
    </div>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <p v-else>可用上方 + 添加本地图片、视频、音频（每个不超过 100 MB）。点击生成后，文件先上传至 imageproxy.zhongzhuan.chat 临时服务，再登记到 IDEA Gates 官方素材库，等待可用后生成；Key 不会发送给临时上传服务。已登记素材自动复用，海外组以平台实际支持为准。</p>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { validateIdeaGatesMedia } from '@/services/providers/ideagates'
defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ add: [asset: { id: string; type: 'image' | 'video' | 'audio'; name: string; url: string }] }>()
const kind = ref<'image' | 'video' | 'audio'>('image'), url = ref(''), error = ref('')
function add() {
  try {
    const value = validateIdeaGatesMedia(url.value.trim())
    emit('add', { id: 'idea_' + crypto.randomUUID(), type: kind.value, url: value, name: { image: '参考图片', video: '参考视频', audio: '参考音频' }[kind.value] })
    url.value = ''; error.value = ''
  } catch (e) { error.value = e instanceof Error ? e.message : '素材链接无效' }
}
</script>
<style scoped>
.idea-references { margin:10px 0; color:#a7a7b2; font-size:11px; }
.link-row { display:flex; gap:6px; }
input,select,button { border:1px solid #45454e; border-radius:6px; background:#25252a; color:#eee; padding:7px; font:inherit; }
input { flex:1; min-width:0; } button { cursor:pointer; } button:disabled { opacity:.45; cursor:default; }
p { margin:6px 0; line-height:1.5; } .error { color:#ff9a9a; }
</style>
