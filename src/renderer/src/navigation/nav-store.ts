import { create } from 'zustand'
import type { FlashMode, FlashRequest, PanelEntry } from '@shared/types'
import type { GeneratedPlanes } from '@/imaging/convert'

export interface PendingFlash {
  request: FlashRequest
  savedConfigId?: string
  /** Run without navigating to the progress page (Test Display popup). */
  silent?: boolean
}

export type Route =
  | 'agreement'
  | 'my-pico'
  | 'select-driver'
  | 'flash-mode'
  | 'badge-editor'
  | 'file-pick'
  | 'flash-progress'
  | 'all-done'

/** Linear order drives the slide direction: forward = deeper into the flow. */
const ORDER: Route[] = [
  'agreement',
  'my-pico',
  'select-driver',
  'flash-mode',
  'badge-editor',
  'file-pick',
  'flash-progress',
  'all-done'
]

export interface Transition {
  /** +1 forward, -1 backward */
  dir: 1 | -1
  /** Which axis the page slides along (the arrow that was pressed). */
  axis: 'x' | 'y'
}

interface NavState {
  route: Route
  transition: Transition
  /** Selected panel (consumer entry) */
  panel: PanelEntry | null
  mode: FlashMode | null
  planes: GeneratedPlanes | null
  scriptName: string | null
  scriptSource: string | null
  jobId: string | null
  /** Saved-config id when re-flashing from My Pico. */
  savedConfigId: string | null
  /** Set when >1 Pico is connected and the user must pick one. */
  pendingFlash: PendingFlash | null
  navigate(route: Route, axis?: 'x' | 'y'): void
  setPanel(panel: PanelEntry | null): void
  setMode(mode: FlashMode | null): void
  setPlanes(planes: GeneratedPlanes | null): void
  setScript(name: string | null, source: string | null): void
  setJob(jobId: string | null, savedConfigId?: string | null): void
  setPendingFlash(pending: PendingFlash | null): void
}

export const useNav = create<NavState>((set, get) => ({
  route: 'agreement',
  transition: { dir: 1, axis: 'x' },
  panel: null,
  mode: null,
  planes: null,
  scriptName: null,
  scriptSource: null,
  jobId: null,
  savedConfigId: null,
  pendingFlash: null,

  navigate(route, axis = 'x') {
    const from = ORDER.indexOf(get().route)
    const to = ORDER.indexOf(route)
    set({ route, transition: { dir: to >= from ? 1 : -1, axis } })
  },
  setPanel: (panel) => set({ panel }),
  setMode: (mode) => set({ mode }),
  setPlanes: (planes) => set({ planes }),
  setScript: (scriptName, scriptSource) => set({ scriptName, scriptSource }),
  setJob: (jobId, savedConfigId = null) => set({ jobId, savedConfigId }),
  setPendingFlash: (pendingFlash) => set({ pendingFlash })
}))
