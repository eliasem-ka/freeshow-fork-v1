// Fork feature: choosing the Skia backend on macOS.
// Upstream turns Skia Graphite off (it rendered pixelated text in Chromium 156 / Electron 45) and uses
// Ganesh. On macOS 27 that switch makes the GPU process crash at start: Chromium then gives up on the
// GPU, and every output is drawn and every video decoded on the CPU (measured on an M4 Pro: three to
// eight times the CPU and a third to two thirds of the video frames dropped).
// So Graphite is kept where turning it off is known to break the GPU, and a machine where it breaks
// anyway remembers that for its next start.

export type GraphiteChoice = { keep: boolean; reason: string }

// first macOS (Darwin kernel major) where the GPU process does not survive Graphite being off
const DARWIN_KEEPS_GRAPHITE = 27

/**
 * @param env FS_MAC_GRAPHITE: "1" keeps Graphite, "0" turns it off, anything else lets the app decide
 * @param learned this machine lost its GPU with Graphite off on an earlier start
 * @param darwinRelease os.release(), like "27.2.0"
 */
export function chooseMacGraphite(env: string | undefined, learned: boolean, darwinRelease: string): GraphiteChoice {
    if (env === "1") return { keep: true, reason: "FS_MAC_GRAPHITE=1" }
    if (env === "0") return { keep: false, reason: "FS_MAC_GRAPHITE=0" }
    if (learned) return { keep: true, reason: "the GPU was lost with Graphite off on an earlier start" }

    const major = Number.parseInt(darwinRelease, 10)
    if (major >= DARWIN_KEEPS_GRAPHITE) return { keep: true, reason: `macOS with Darwin ${major}: the GPU process crashes with Graphite off` }
    return { keep: false, reason: "default" }
}

let graphiteOff = false
export function setGraphiteOff(value: boolean) {
    graphiteOff = value
}

/** Hardware compositing is gone on a Mac that started with Graphite off: keep Graphite from the next start on. */
export function shouldLearnGraphite(isMac: boolean, compositingHardware: boolean, accelerationDisabledByUser: boolean) {
    return isMac && graphiteOff && !compositingHardware && !accelerationDisabledByUser
}
