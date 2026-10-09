import type { InjectionKey, Ref } from 'vue'

// UI-only state: never saved with node data or replayed when loading a project.
export const appearingNodesKey: InjectionKey<Ref<Set<string>>> = Symbol('appearing-nodes')
