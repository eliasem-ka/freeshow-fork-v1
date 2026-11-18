// FORK-ONLY MODULE — not part of upstream FreeShow.
//
// Renders a picture of a theme for the API (render_template_preview), so an agent can look at
// what it designed. It is the same hidden output window "capture slide" uses, with two changes:
// the show to draw is handed to that window directly (it never enters the library), and the
// window is kept for a while, so the second and later previews take about a second instead of six.

import { BrowserWindow } from "electron"
import { loadWindowContent } from ".."
import { OUTPUT } from "../../types/Channels"
import type { Output } from "../../types/Output"
import type { Resolution } from "../../types/Settings"
import type { Show } from "../../types/Show"
import { OutputHelper } from "../output/OutputHelper"
import { captureOptions } from "../utils/windowOptions"

const OUTPUT_ID = "capture_theme_preview"
const LOAD_WAIT = 3000 // same as captureSlide: the output page has to start and ask for its data
const KEEP_ALIVE = 60000

type PreviewData = { output: { [key: string]: Output }; shows: { [key: string]: Show }; resolution: Resolution; wait?: number }

let previewWindow: BrowserWindow | null = null
let windowReady: Promise<boolean> | null = null
let closeTimeout: NodeJS.Timeout | null = null
let queue: Promise<unknown> = Promise.resolve()

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function closeWindow() {
    if (closeTimeout) clearTimeout(closeTimeout)
    closeTimeout = null
    if (previewWindow && !previewWindow.isDestroyed()) previewWindow.destroy()
    previewWindow = null
    windowReady = null
    if (OutputHelper.getOutput(OUTPUT_ID)) OutputHelper.deleteOutput(OUTPUT_ID)
}

function getWindow(resolution: Resolution) {
    if (previewWindow && !previewWindow.isDestroyed() && windowReady) {
        const [width, height] = previewWindow.getContentSize()
        if (width === resolution.width && height === resolution.height) return windowReady
    }
    closeWindow()

    const window = new BrowserWindow({ ...captureOptions, width: resolution.width, height: resolution.height, useContentSize: true })
    previewWindow = window
    loadWindowContent(window, "output")
    // registered as an output so it receives the templates, styles and media data it asks for
    OutputHelper.setOutput(OUTPUT_ID, { window } as any)

    windowReady = new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => resolve(false), 20000)
        window.once("ready-to-show", () => {
            window.webContents.setAudioMuted(true)
            setTimeout(() => {
                clearTimeout(timeout)
                resolve(!window.isDestroyed())
            }, LOAD_WAIT)
        })
        window.once("closed", () => {
            clearTimeout(timeout)
            resolve(false)
        })
    })
    return windowReady
}

async function capture(data: PreviewData): Promise<{ base64: string } | null> {
    const resolution = { width: Math.round(data.resolution?.width || 960), height: Math.round(data.resolution?.height || 540) }
    const ready = await getWindow(resolution)
    const window = previewWindow
    if (!ready || !window || window.isDestroyed()) {
        closeWindow()
        return null
    }

    // the show goes right before the output that points at it: the app also sends its own
    // shows to every output window when one changes, and that would drop this one
    window.webContents.send(OUTPUT, { channel: "SHOWS", data: data.shows })
    window.webContents.send(OUTPUT, { channel: "OUTPUTS", data: data.output })
    await wait(Math.max(300, Math.min(8000, data.wait || 1200)))
    if (window.isDestroyed()) return null

    const page = await window.capturePage()
    const base64 = page.toDataURL({ scaleFactor: 1 })

    if (closeTimeout) clearTimeout(closeTimeout)
    closeTimeout = setTimeout(closeWindow, KEEP_ALIVE)
    return { base64 }
}

/** One preview at a time: they share the window. */
export function captureThemePreview(data: PreviewData): Promise<{ base64: string } | null> {
    const result = queue.then(
        () => capture(data),
        () => capture(data)
    )
    queue = result.catch(() => null)
    return result.catch((err) => {
        console.error("Theme preview failed:", err)
        closeWindow()
        return null
    })
}
