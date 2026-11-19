// Fork feature: the rules of the background tray (BackgroundTray.svelte), kept apart so they can be tested.

export type TrayItem = { path: string; name: string; video: boolean; used: boolean }
type SelectedSlide = { index?: number }

const fileName = (path: string) => path.split(/[\\/]/).pop() || path
const isFile = (path: string) => !!path && !/^(https?:|data:|blob:)/.test(path)
const extension = (path: string) => (path.includes(".") ? path.slice(path.lastIndexOf(".") + 1).toLowerCase() : "")

/** The backgrounds a show already uses, then the media marked as favourite: each file once, no audio, no web addresses. */
export function getTrayList(showMedia: { [id: string]: any } | undefined, media: { [path: string]: any }, videoExtensions: string[]): TrayItem[] {
    const used = Object.values(showMedia || {})
        .filter((item: any) => item?.path && (item.type === "video" || item.type === "image" || !item.type))
        .map((item: any) => item.path as string)
    const favourites = Object.entries(media || {})
        .filter(([, style]) => style?.favourite === true && style.audio !== true)
        .map(([path]) => path)
    const paths = [...used, ...favourites].filter(isFile)
    return paths.filter((path, index) => paths.indexOf(path) === index).map((path) => ({ path, name: fileName(path), video: videoExtensions.includes(extension(path)), used: used.includes(path) }))
}

/** The selected slides as the 1-based numbers the API takes; undefined (the whole show) when none is selected. */
export function getSlideNumbers(selection: SelectedSlide[] | null | undefined): number[] | undefined {
    if (!selection?.length) return undefined
    return selection.map((slide) => (slide.index ?? -1) + 1).filter((number) => number > 0)
}

/** Does a change to these slides reach the slide that is on screen? With nothing selected the whole show changes. */
export function changesLiveSlide(selection: SelectedSlide[] | null | undefined, liveIndex: number | undefined): boolean {
    if (!selection?.length) return true
    return selection.some((slide) => slide.index === liveIndex)
}
