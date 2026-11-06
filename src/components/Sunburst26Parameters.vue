<template>
  <fieldset class="sunburst-parameters" :disabled="disabled">
    <label>
      <span>输出格式</span>
      <select :value="modelValue.format || 'png'" @change="update({ format: ($event.target as HTMLSelectElement).value as 'png' | 'gif' })">
        <option value="png">PNG 图片</option><option value="gif">GIF 动图</option>
      </select>
    </label>
    <label>
      <span>质量</span>
      <select :value="modelValue.quality || 'medium'" @change="update({ quality: ($event.target as HTMLSelectElement).value as Sunburst26Options['quality'] })">
        <option v-for="quality in SUNBURST26_QUALITIES" :key="quality" :value="quality">{{ quality }}</option>
      </select>
    </label>
    <template v-if="modelValue.format === 'gif'">
      <label><span>动画帧数</span><input type="number" min="2" max="64" step="1" :value="modelValue.frameCount ?? 9" @input="update({ frameCount: ($event.target as HTMLInputElement).valueAsNumber })" /></label>
      <label><span>每帧时长（毫秒）</span><input type="number" min="20" max="2000" step="10" :value="modelValue.frameDurationMs ?? 200" @input="update({ frameDurationMs: ($event.target as HTMLInputElement).valueAsNumber })" /></label>
      <p>GIF 使用自动尺寸，实际比例、帧数以返回文件为准。请在提示词中描述连续动作和循环方式。</p>
    </template>
    <template v-else>
      <label class="custom-size-toggle"><input type="checkbox" :checked="!!modelValue.customSize" @change="toggleCustom(($event.target as HTMLInputElement).checked)" /><span>自定义像素尺寸</span></label>
      <div v-if="modelValue.customSize" class="pixel-fields">
        <label><span>宽度（px）</span><input type="number" min="1" step="1" :value="modelValue.width" @input="update({ width: ($event.target as HTMLInputElement).valueAsNumber })" /></label>
        <span>×</span>
        <label><span>高度（px）</span><input type="number" min="1" step="1" :value="modelValue.height" @input="update({ height: ($event.target as HTMLInputElement).valueAsNumber })" /></label>
      </div>
      <p>实际提交：{{ pixelSize }}。比例和档位会转换为像素；2K / 4K 为换算预设，尺寸是否可用以上游支持为准。</p>
    </template>
  </fieldset>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { SUNBURST26_QUALITIES, sunburst26Size, type Sunburst26Options } from '@/services/geeknowSunburst26'
const props = withDefaults(defineProps<{ modelValue?: Sunburst26Options; ratio?: string; resolution?: string; disabled?: boolean }>(), { modelValue: () => ({}), ratio: '1:1', resolution: '1K' })
const emit = defineEmits<{ 'update:modelValue': [value: Sunburst26Options] }>()
const tier = computed(() => props.resolution === '2K' || props.resolution === '4K' ? props.resolution : '1K')
const pixelSize = computed(() => {
  try { return sunburst26Size(props.modelValue, props.ratio, tier.value) }
  catch { return '请填写有效的宽度和高度' }
})
function update(patch: Partial<Sunburst26Options>) { emit('update:modelValue', { ...props.modelValue, ...patch }) }
function toggleCustom(customSize: boolean) {
  const [width, height] = sunburst26Size({}, props.ratio, tier.value).split('x').map(Number)
  update({ customSize, width: props.modelValue.width ?? width, height: props.modelValue.height ?? height })
}
</script>

<style scoped>
.sunburst-parameters { margin: 0; padding: 0; border: 0; display: grid; gap: 10px; color: #ddd; font-size: 12px; min-width: 0; }
label { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
select, input[type=number] { width: 100%; box-sizing: border-box; border: 1px solid #484848; border-radius: 8px; padding: 7px 9px; color: #eee; background: #292929; font: inherit; }
select:focus, input:focus { outline: 1px solid #999; }
.custom-size-toggle { flex-direction: row; align-items: center; }
input[type=checkbox] { accent-color: #bbb; }
.pixel-fields { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px; }
p { color: #a4a4a4; line-height: 1.5; margin: 0 0 5px; }
fieldset:disabled { opacity: .65; }
</style>
