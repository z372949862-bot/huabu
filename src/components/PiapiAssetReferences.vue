<template>
  <div class="piapi-assets nodrag nopan nowheel" @mousedown.stop @wheel.stop>
    <div class="asset-toolbar">
      <button type="button" :aria-expanded="expanded" @click="expanded = !expanded">{{ expanded ? '▾' : '▸' }} 私有资产 <span v-if="privateCount">{{ privateCount }}</span></button>
      <button type="button" :disabled="disabled" @click="openLibrary">选择已入库</button>
    </div>
    <div v-if="expanded" class="asset-options">
      <p>勾选需要复用的人物、角色或产品素材。生成前会自动入库，等待就绪后使用资产 ID；未勾选的素材使用普通直链。</p>
      <div v-if="!assets.length" class="asset-empty">先添加参考素材，或从私有资产库选择。</div>
      <label v-for="asset in uniqueAssets" :key="asset.url" class="asset-option">
        <input type="checkbox" :checked="isPrivate(asset.url)" :disabled="disabled || isEditVideo(asset)" @change="toggle(asset, ($event.target as HTMLInputElement).checked)" />
        <span class="asset-name">{{ asset.name }}<small>{{ isEditVideo(asset) ? '编辑源视频使用原视频直链' : !isPrivate(asset.url) ? '普通参考直链' : binding(asset.url)?.assetId ? '已绑定 · ' + binding(asset.url)?.assetId : '生成前入库' }}</small></span>
      </label>
      <p class="asset-note">私有资产权限需 hobbyist 或更高。图片宽高 300–6000px、宽高比 0.4–2.5（不含边界）；视频/音频 2–15 秒。入库仍需公网链接，本地文件先经临时上传服务转换。</p>
    </div>
    <Teleport to="body">
      <div v-if="libraryOpen" class="piapi-library-backdrop nodrag nopan nowheel" @mousedown.stop @wheel.stop @click.self="closeLibrary" @keydown.esc="closeLibrary">
        <section class="piapi-library" role="dialog" aria-modal="true" aria-label="PiAPI 私有资产库" tabindex="-1">
          <header><div><h3>PiAPI 私有资产库</h3><p>选择后保留原图预览，生成时引用 asset ID。</p></div><button type="button" aria-label="关闭资产库" @click="closeLibrary">×</button></header>
          <div class="library-tools"><span>{{ quota ? '已用 ' + (quota.used ?? 0) + ' / ' + (quota.limit ?? '—') + (quota.ttl_days ? ' · 闲置 ' + quota.ttl_days + ' 天后过期' : '') : '当前中转站账户' }}</span><button type="button" :disabled="loading" @click="fetchAssets(page)">刷新</button></div>
          <p v-if="error" class="library-error" role="alert">{{ error }}</p>
          <div v-if="loading" class="library-empty" role="status">正在读取资产库…</div>
          <div v-else-if="!items.length && !error" class="library-empty">资产库暂无素材。返回参数卡勾选参考素材，生成时即可自动入库。</div>
          <div v-else class="library-items">
            <button v-for="item in items" :key="item.asset_id" type="button" class="library-item" :disabled="!canUse(item)" @click="selectAsset(item)">
              <img v-if="item.asset_type?.toLowerCase() === 'image' && publicMediaUrl(item.url)" :src="item.url" alt="" loading="lazy" @error="($event.target as HTMLImageElement).style.visibility = 'hidden'" />
              <span v-else class="library-type">{{ typeLabel(item.asset_type) }}</span>
              <span class="library-copy"><strong>{{ item.name || item.asset_id }}</strong><small>{{ item.asset_id }}</small><small v-if="item.status === 'failed'">{{ item.error || '入库失败' }}</small><small v-else-if="!publicMediaUrl(item.url)">缺少可用的素材预览地址</small><small v-else-if="videoMode === 'edit' && item.asset_type?.toLowerCase() === 'video'">编辑源视频请从本地或直链添加</small></span>
              <span class="library-status" :class="item.status">{{ { active: '已就绪', processing: '处理中', failed: '失败' }[item.status] || item.status }}</span>
            </button>
          </div>
          <footer><button type="button" :disabled="loading || page <= 1" @click="fetchAssets(page - 1)">上一页</button><span>第 {{ page }} 页 · 共 {{ total }} 项</span><button type="button" :disabled="loading || page * 50 >= total" @click="fetchAssets(page + 1)">下一页</button></footer>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { useAIStore } from '@/stores/ai'
import { PiapiProvider, mapPiapiAsset, publicMediaUrl } from '@/services/providers/piapi'
type Asset = { id: string; type: 'image' | 'video' | 'audio'; url: string; name: string }
type Binding = { providerId: string; mode: 'private'; assetId?: string; name?: string }
const props = defineProps<{ providerId: string; assets: Asset[]; bindings?: Record<string, Binding>; videoMode: string; disabled?: boolean }>()
const emit = defineEmits<{ (e: 'update:bindings', value: Record<string, Binding>): void; (e: 'add-asset', value: Asset, binding: Binding): void }>()
const ai = useAIStore()
const expanded = ref(false), libraryOpen = ref(false), loading = ref(false), error = ref('')
const items = ref<any[]>([]), quota = ref<any>(null), page = ref(1), total = ref(0)
let requestVersion = 0
const uniqueAssets = computed(() => [...new Map(props.assets.map(asset => [asset.url, asset])).values()])
const binding = (url: string) => props.bindings?.[url]?.providerId === props.providerId ? props.bindings[url] : undefined
const isEditVideo = (asset: Asset) => props.videoMode === 'edit' && asset.type === 'video'
const isPrivate = (url: string) => binding(url)?.mode === 'private' && !uniqueAssets.value.some(asset => asset.url === url && isEditVideo(asset))
const privateCount = computed(() => uniqueAssets.value.filter(asset => isPrivate(asset.url)).length)
function toggle(asset: Asset, checked: boolean) {
  if (props.disabled || isEditVideo(asset)) return
  const next = { ...props.bindings }
  if (checked) next[asset.url] = { ...binding(asset.url), providerId: props.providerId, mode: 'private', name: asset.name }
  else delete next[asset.url]
  emit('update:bindings', next)
}
function closeLibrary() { libraryOpen.value = false; requestVersion++; loading.value = false }
watch(() => props.providerId, () => { closeLibrary(); items.value = []; quota.value = null; error.value = '' })
onBeforeUnmount(() => { requestVersion++ })
async function openLibrary() { libraryOpen.value = true; await fetchAssets(1) }
async function fetchAssets(nextPage: number) {
  const version = ++requestVersion
  loading.value = true; error.value = ''; items.value = []
  try {
    const provider = ai.getProvider(props.providerId)
    if (!(provider instanceof PiapiProvider)) throw new Error('请先选择 PiAPI 中转站')
    const result = await provider.listPrivateAssets(nextPage)
    if (version !== requestVersion) return
    items.value = result.items.map(mapPiapiAsset); quota.value = result.quota; total.value = Number(result.total) || 0; page.value = nextPage
  } catch (err) { if (version === requestVersion) error.value = err instanceof Error ? err.message : '读取资产库失败' }
  finally { if (version === requestVersion) loading.value = false }
}
const typeLabel = (type: string) => ({ image: '图片', video: '视频', audio: '音频' }[String(type).toLowerCase()] || '素材')
const canUse = (item: any) => ['active', 'processing'].includes(item.status) && ['image', 'video', 'audio'].includes(String(item.asset_type).toLowerCase()) && publicMediaUrl(item.url) && !(props.videoMode === 'edit' && String(item.asset_type).toLowerCase() === 'video')
function selectAsset(item: any) {
  if (props.disabled || !canUse(item)) return
  emit('add-asset', { id: 'piapi_' + item.asset_id, type: item.asset_type.toLowerCase(), url: item.url, name: item.name || item.asset_id }, { providerId: props.providerId, mode: 'private', assetId: item.asset_id, name: item.name })
  expanded.value = true; closeLibrary()
}
</script>

<style scoped>
.piapi-assets{margin:8px 0;color:#c9c9d0;font-size:12px}.asset-toolbar,.library-tools{display:flex;align-items:center;justify-content:space-between;gap:10px}.piapi-assets button,.piapi-library button{color:inherit;font:inherit;cursor:pointer;border:1px solid #48484f;background:#303036;border-radius:7px;padding:6px 10px}.piapi-assets button:hover,.piapi-library button:hover{background:#3c3c44}.piapi-assets button:disabled,.piapi-library button:disabled{opacity:.45;cursor:default}.asset-toolbar button:first-child{border:0;background:transparent;padding-left:0}.asset-toolbar span{margin-left:4px;color:#eee}.asset-options{padding:9px;border:1px solid #424249;border-radius:9px;margin-top:5px;max-height:220px;overflow:auto}.asset-options p{margin:0 0 9px;line-height:1.6;color:#aaaab4}.asset-option{display:flex;align-items:flex-start;gap:8px;padding:5px 0;cursor:pointer}.asset-option input{accent-color:#a9a3db;margin:3px 0}.asset-name{min-width:0;overflow-wrap:anywhere}.asset-name small{display:block;color:#92929d;font-size:10px;line-height:1.4}.asset-options .asset-note{font-size:10px;margin:9px 0 0}.asset-empty{padding:8px;color:#92929d}.piapi-library-backdrop{position:fixed;inset:0;z-index:5000;background:#0009;display:flex;align-items:center;justify-content:center;padding:24px}.piapi-library{color:#dedee5;background:#242429;border:1px solid #494950;border-radius:16px;width:620px;max-width:100%;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 18px 60px #0008;font:13px/1.5 system-ui,sans-serif}.piapi-library header{display:flex;justify-content:space-between;align-items:flex-start;padding:20px 22px 12px}.piapi-library h3{margin:0;font-size:17px}.piapi-library header p{color:#a6a6b1;margin:6px 0 0;font-size:12px}.piapi-library header button{font-size:20px;padding:0 8px}.library-tools{padding:0 22px 12px;font-size:12px;color:#aaaab5}.library-error{color:#f1b1b1;padding:8px 22px;overflow-wrap:anywhere}.library-empty{padding:32px 22px;color:#a6a6b1}.library-items{padding:0 14px;overflow:auto;min-height:100px}.piapi-library .library-item{display:flex;text-align:left;gap:12px;align-items:center;width:100%;padding:10px;margin-bottom:6px;background:#2c2c32;border:1px solid #3b3b44}.library-item img,.library-type{width:52px;height:52px;object-fit:contain;background:#19191f;border-radius:6px;flex-shrink:0}.library-type{display:grid;place-items:center;color:#b9b9c5}.library-copy{flex:1;min-width:0;overflow-wrap:anywhere}.library-copy strong{font-weight:500}.library-copy small{display:block;font-size:10px;color:#9797a4}.library-status{font-size:11px;white-space:nowrap;color:#c5b6ed}.library-status.active{color:#b9cfba}.library-status.failed{color:#df9f9f}.piapi-library footer{display:flex;align-items:center;justify-content:space-between;padding:14px 22px;font-size:12px;border-top:1px solid #393940}
</style>
