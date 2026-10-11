<template>
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path v-for="(path, index) in paths[name] || paths.more" :key="index" :d="path" />
  </svg>
</template>

<script setup lang="ts">
defineProps<{ name: string }>()
const paths: Record<string, string[]> = {
  back: ['M14 5l-7 7 7 7'],
  text: ['M5 6V4h14v2M12 4v16M8 20h8'],
  image: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z', 'M3 16l5-5 4 4 4-5 5 6', 'M8 7h.01'],
  video: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z', 'M10 8l6 4-6 4Z'],
  audio: ['M3 10v4M7 6v12M12 3v18M17 6v12M21 10v4'],
  timeline: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z', 'M3 9h18M8 3v6M16 3v6M8 14h8M8 17h5'],
  effects: ['M13 2L4 14h7l-1 8 10-12h-7Z'],
  assets: ['M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z', 'M3 10h18'],
  upload: ['M12 16V3M6 9l6-6 6 6M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4'],
  cursor: ['M5 3l15 9-8 2-3 7Z'],
  minimap: ['M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2ZM9 3v16M15 5v16'],
  edges: ['M5 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM19 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM19 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z', 'M7 11l10-5M7 13l10 5'],
  chevron: ['M8 10l4 4 4-4'],
  search: ['M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15ZM16 16l5 5'],
  history: ['M3 11a9 9 0 1 1 2.6 7M3 4v7h7M12 7v5l3 2'],
  settings: ['M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z'],
  more: ['M5 12h.01M12 12h.01M19 12h.01'],
  chat: ['M5 3h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8l-5 3V5a2 2 0 0 1 2-2Z', 'M8 8h8M8 12h5'],
  fit: ['M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5'],
  close: ['M6 6l12 12M18 6L6 18'],
}
</script>
