declare module "n-danmaku" {
  export type DanmakuType =
    | "scroll"
    | "midscroll"
    | "random"
    | "top"
    | "bottom"
    | "midhang"
    | "free"

  export interface DanmakuAttrs {
    color?: string
    size?: string | null
    scale?: number
    opacity?: number
    weight?: string | number
    bottom_space?: number
    outline?: boolean
    reverse?: boolean
    type?: DanmakuType
    life?: number
    pointer_events?: boolean
    custom_css?: Record<string, string>
    carry_sheet?: string
  }

  export interface DanmakuListItem {
    time: number
    text: string
    reset_styles?: boolean
    styles?: DanmakuAttrs
    created?: (element: HTMLElement, id: number) => void
    callback?: (id: number) => void
  }

  export interface NDanmakuList {
    new: (listName: string) => void
    del: (listName: string) => void
    use: (listName: string) => void
    addDm: (dmData: Omit<DanmakuListItem, "time">, time: number) => string | null
    delDm: (danmakuSerial: string) => boolean
    tick: (time: number) => void
    uncertainty: (time: number) => void
    load: (danmakuArr: DanmakuListItem[]) => boolean
    export: (outputName: string, fileType?: "js" | "json", download?: boolean) => string
  }

  export default class NDanmaku {
    constructor(container: string | Element, prefix?: string, zIndex?: string | number)
    list: NDanmakuList
    state: "paused" | "running"
    dmLayer: HTMLElement
    resetAttrs(): this
    resetRanges(): this
    attrs(attrs: DanmakuAttrs): this
    attrs(key: string, value: unknown): this
    ranges(ranges: Partial<Record<"top" | "bottom" | "scroll" | "random", [number, number]>>): this
    ranges(type: "top" | "bottom" | "scroll" | "random", range: [number, number]): this
    create(text: string, created?: ((el: HTMLElement, id: number) => void) | null, callback?: ((id: number) => void) | null): this
    clear(id?: number | null): this
    clearSome(type?: string, reversed?: string | boolean): this
    pause(id?: number | null): this
    resume(id?: number | null): this
  }
}
