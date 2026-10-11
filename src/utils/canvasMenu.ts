export interface CanvasMenuItem {
  label: string
  action: string
  icon?: string
  shortcut?: string
  disabled?: boolean
  separatorBefore?: boolean
  children?: CanvasMenuItem[]
}
