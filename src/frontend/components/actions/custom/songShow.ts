// FORK-ONLY MODULE — not part of upstream FreeShow.
//
// Builds a song show whose slides are timed to the song's tempo, so the lyrics
// advance and animate on the beat. Everything here is self-contained: it only
// consumes public helpers from upstream and is wired in through a single entry
// in API_ACTIONS, which keeps future upstream merges conflict-free.
//
// It deliberately uses primitives that already work in the live output:
//   - SlideData.nextTimer   -> auto-advance (accepts decimal seconds)
//   - SlideData.transition  -> the in/out animation of the slide's text
//   - Item.actions.showTimer -> per-item in-delay, used to stagger lines
//
// No renderer changes are required.

import { get } from "svelte/store"
import { uid } from "uid"
import type { Item, Line, Show, Slide, SlideData, Transition, TransitionType } from "../../../../types/Show"
import { ShowObj } from "../../../classes/Show"
import { activeProject } from "../../../stores"
import { DEFAULT_ITEM_STYLE } from "../../edit/scripts/itemHelpers"
import { history } from "../../helpers/history"
import { checkName } from "../../helpers/show"

/// TYPES ///

export type SongSlideInput = {
    /** Lyric lines rendered on this slide. One entry = one visual line. */
    lines: string[]
    /** Group label shown in the show (e.g. "Coro"). Only set on a section's first slide. */
    group?: string | null
    /** Global group id used for colouring/templates (e.g. "verse", "chorus"). */
    globalGroup?: string
    /** How long this slide lasts, in beats. Converted to seconds using the bpm. */
    beats?: number
    /** Explicit duration in seconds. Takes priority over `beats`. */
    seconds?: number
}

export type SongAnimation = {
    /** Named look; sets transition type/easing/length unless those are given explicitly. */
    preset?: string
    transitionType?: TransitionType
    /** Transition length expressed in beats (0.5 = half a beat). */
    transitionBeats?: number
    easing?: string
    /** Direction for the "slide"/"fly" types. */
    direction?: "left_right" | "right_left" | "top_bottom" | "bottom_top"
    /** Write nextTimer so slides advance on their own. Default: true when a bpm is given. */
    autoAdvance?: boolean
    /** Reveal a multi-line slide one line at a time. */
    staggerLines?: boolean
    /** Gap between staggered lines, in beats. Default: 1 beat. */
    staggerBeats?: number
    /** Gap between staggered lines in seconds; used when there is no bpm. */
    staggerSeconds?: number
    /** Named typography look applied per line ("concierto", "enfasis", "uniforme"). */
    lineStyle?: string
    /** Explicit per-line typography, index 0 = first line. Overrides the preset. */
    lineStyles?: LineStyle[]
    /**
     * Colour forced on every line, whatever the preset says. Needed whenever the
     * lyrics sit on a light band, where the default white would vanish.
     */
    textColor?: string

    /**
     * Reveal the lyric progressively instead of all at once.
     * Takes precedence over staggerLines, which works at the item level and
     * would fight the per-chunk CSS delays.
     */
    reveal?: RevealMode
    /** Step between revealed units, in beats. */
    revealBeats?: number
    /** Step between revealed units in seconds; used when there is no bpm. */
    revealSeconds?: number
    /** Motion for each unit. "rise" forces inline-block on the chunk. */
    revealMotion?: RevealMotion
    /** How long a single unit takes to appear, in ms. Default 350. */
    revealDuration?: number
}

export type RevealMode = "none" | "word" | "character"
export type RevealMotion = "fade" | "rise" | "blur"

/** Typography for one line of a slide. Rendered as plain CSS on the text chunk. */
export type LineStyle = {
    fontSize?: number // px
    fontFamily?: string
    weight?: string | number
    color?: string
    opacity?: number
    italic?: boolean
    uppercase?: boolean
    letterSpacing?: number // px
    /** Soft drop shadow, keeps lyrics readable over busy video backgrounds. */
    shadow?: boolean
}

export type API_animated_song = {
    name?: string
    category?: string
    meta?: { [key: string]: string }
    /** Song tempo. Required for any beat-derived timing. */
    bpm?: number
    slides: SongSlideInput[]
    animation?: SongAnimation
    /** Overlay drawn on every slide, e.g. the band from createLyricTemplate. */
    overlayId?: string
    /** Template recorded on the show, so the look can be re-applied later. */
    templateId?: string
    /** Position/size for the text box, e.g. the `text` box from createLyricTemplate. */
    textBox?: { left: number; top: number; width: number; height: number }
    /** Extra CSS appended to every text item's box, e.g. a matching rotation. */
    itemStyle?: string
}

/// PRESETS ///

type PresetDef = { type: TransitionType; easing: string; beats: number }

const PRESETS: { [key: string]: PresetDef } = {
    none: { type: "none", easing: "linear", beats: 0 },
    // gentle worship feel: a slow, soft cross-fade
    soft: { type: "fade", easing: "sine", beats: 1 },
    fade: { type: "fade", easing: "sine", beats: 0.5 },
    // fast praise: short, punchy pop
    energetic: { type: "scale", easing: "back", beats: 0.25 },
    zoom: { type: "scale", easing: "cubic", beats: 0.5 },
    slide: { type: "slide", easing: "cubic", beats: 0.5 },
    blur: { type: "blur", easing: "sine", beats: 0.75 },
    spin: { type: "spin", easing: "cubic", beats: 0.5 }
}

// Spanish aliases so the MCP can pass through whatever the user said.
const PRESET_ALIASES: { [key: string]: string } = {
    ninguna: "none",
    ninguno: "none",
    suave: "soft",
    lenta: "soft",
    desvanecer: "fade",
    energetico: "energetic",
    energetica: "energetic",
    rapida: "energetic",
    acercar: "zoom",
    deslizar: "slide",
    desenfoque: "blur",
    girar: "spin"
}

function resolvePreset(name: string | undefined): PresetDef {
    const key = (name || "soft").toLowerCase().trim()
    return PRESETS[PRESET_ALIASES[key] || key] || PRESETS.soft
}

/// TYPOGRAPHY ///

// Looks are described as [first line, following lines]. FreeShow ships CMGSans,
// so contrast comes from weight/size/spacing rather than an uninstalled family.
const LINE_STYLE_PRESETS: { [key: string]: LineStyle[] } = {
    uniform: [{ fontSize: 100, weight: "bold", shadow: true }],
    // lead line reads big and tight, answer line lighter and smaller
    concert: [
        { fontSize: 110, weight: 700, letterSpacing: 1, shadow: true },
        { fontSize: 78, weight: 300, opacity: 0.82, shadow: true }
    ],
    emphasis: [
        { fontSize: 115, weight: 700, shadow: true },
        { fontSize: 84, weight: 400, italic: true, opacity: 0.85, shadow: true }
    ]
}

const LINE_STYLE_ALIASES: { [key: string]: string } = {
    uniforme: "uniform",
    igual: "uniform",
    concierto: "concert",
    enfasis: "emphasis",
    énfasis: "emphasis"
}

function resolveLineStyles(animation: SongAnimation): LineStyle[] {
    let styles: LineStyle[]
    if (animation.lineStyles?.length) styles = animation.lineStyles
    else {
        const key = (animation.lineStyle || "uniform").toLowerCase().trim()
        styles = LINE_STYLE_PRESETS[LINE_STYLE_ALIASES[key] || key] || LINE_STYLE_PRESETS.uniform
    }

    if (!animation.textColor) return styles
    // dark text on a light band also wants the shadow gone, it only muddies it
    return styles.map((style) => ({ ...style, color: animation.textColor, shadow: false }))
}

/** Style for line `index`; the last entry repeats for any further lines. */
function styleForLine(styles: LineStyle[], index: number): LineStyle {
    return styles[Math.min(index, styles.length - 1)] || {}
}

function lineStyleToCss(style: LineStyle): string {
    const css: string[] = []
    css.push(`font-size: ${style.fontSize ?? 100}px`)
    if (style.fontFamily) css.push(`font-family: ${style.fontFamily}`)
    if (style.weight !== undefined) css.push(`font-weight: ${style.weight}`)
    if (style.color) css.push(`color: ${style.color}`)
    if (style.opacity !== undefined) css.push(`opacity: ${style.opacity}`)
    if (style.italic) css.push("font-style: italic")
    if (style.uppercase) css.push("text-transform: uppercase")
    if (style.letterSpacing !== undefined) css.push(`letter-spacing: ${style.letterSpacing}px`)
    if (style.shadow) css.push("text-shadow: 0 4px 12px rgb(0 0 0 / 0.5)")
    return css.join(";") + ";"
}

function buildLine(text: string, style: LineStyle): Line {
    return { align: "", text: [{ value: text, style: lineStyleToCss(style) }] }
}

/// PROGRESSIVE REVEAL ///

type RevealConfig = {
    mode: RevealMode
    stepMs: number
    motion: RevealMotion
    durationMs: number
}

const REVEAL_KEYFRAMES: { [key in RevealMotion]: string } = {
    fade: "fsRevealFade",
    rise: "fsRevealRise",
    blur: "fsRevealBlur"
}

// default step between units, expressed in beats
const DEFAULT_REVEAL_BEATS: { [key in RevealMode]: number } = { none: 0, word: 0.25, character: 0.05 }
// fallback step in ms when the tempo is unknown
const DEFAULT_REVEAL_MS: { [key in RevealMode]: number } = { none: 0, word: 180, character: 40 }

function resolveReveal(animation: SongAnimation, bpm: number): RevealConfig | null {
    const mode = animation.reveal || "none"
    if (mode === "none") return null

    let stepMs: number
    if (animation.revealSeconds !== undefined) stepMs = animation.revealSeconds * 1000
    else if (bpm) stepMs = beatsToSeconds(animation.revealBeats ?? DEFAULT_REVEAL_BEATS[mode], bpm) * 1000
    else stepMs = DEFAULT_REVEAL_MS[mode]

    return {
        mode,
        stepMs: Math.max(0, Math.round(stepMs)),
        motion: animation.revealMotion || "fade",
        durationMs: Math.max(50, Math.round(animation.revealDuration ?? 350))
    }
}

/**
 * Split a line into animated chunks.
 *
 * Each chunk is its own <span> in the output, so a plain CSS animation-delay
 * staggers them — no renderer logic needed beyond the global keyframes.
 * Whitespace rides along with its word (word mode) or gets its own chunk
 * without consuming a step (character mode), so line wrapping is unchanged and
 * joining the chunks back together reproduces the original text.
 */
function splitForReveal(text: string, style: LineStyle, reveal: RevealConfig, startUnit: number): { chunks: { value: string; style: string }[]; units: number } {
    const base = lineStyleToCss(style)
    const chunks: { value: string; style: string }[] = []
    let unit = startUnit

    const pieces = reveal.mode === "word" ? text.match(/\S+\s*/g) || [] : text.split("")

    for (const piece of pieces) {
        // whitespace is invisible: show it with the unit before it rather than
        // spending a step on it, otherwise gaps drift out of time
        const isBlank = !piece.trim()
        const delay = Math.max(0, unit - (isBlank ? 1 : 0)) * reveal.stepMs
        chunks.push({ value: piece, style: base + revealCss(reveal, delay) })
        if (!isBlank) unit++
    }

    if (!chunks.length) chunks.push({ value: text, style: base })
    return { chunks, units: unit - startUnit }
}

function revealCss(reveal: RevealConfig, delayMs: number): string {
    // "both" holds the from-state during the delay, so nothing flashes early
    let css = `animation: ${REVEAL_KEYFRAMES[reveal.motion]} ${reveal.durationMs}ms ease-out ${delayMs}ms both;`
    // transforms are ignored on inline elements, so lift the chunk out of inline flow
    if (reveal.motion === "rise") css += "display: inline-block;"
    return css
}

/// TIMING ///

const MIN_TRANSITION_MS = 80
const MAX_TRANSITION_MS = 4000

/** Convert a musical length in beats to seconds at the given tempo. */
export function beatsToSeconds(beats: number, bpm: number) {
    if (!bpm || bpm <= 0) return 0
    return (beats * 60) / bpm
}

function round(value: number, decimals = 3) {
    const factor = 10 ** decimals
    return Math.round(value * factor) / factor
}

/// BUILD ///

/**
 * API: build a show from pre-segmented lyric slides, timing each slide to the beat.
 * Returns the new show id plus a summary of what was applied.
 */
export function createAnimatedSong(data: API_animated_song) {
    if (!data?.slides?.length) return { error: "no slides" }

    const bpm = Number(data.bpm) || 0
    const animation = data.animation || {}
    const preset = resolvePreset(animation.preset)

    const transitionType: TransitionType = animation.transitionType || preset.type
    const easing = animation.easing || preset.easing
    const transitionBeats = animation.transitionBeats ?? preset.beats

    // a transition can only be beat-derived when we know the tempo
    let transitionMs = bpm ? beatsToSeconds(transitionBeats, bpm) * 1000 : 500
    if (transitionType === "none") transitionMs = 0
    else transitionMs = Math.min(MAX_TRANSITION_MS, Math.max(MIN_TRANSITION_MS, Math.round(transitionMs)))

    const transition: Transition = { type: transitionType, duration: transitionMs, easing }
    if (animation.direction && (transitionType === "slide" || transitionType === "fly")) {
        transition.custom = { direction: animation.direction }
    }

    const autoAdvance = animation.autoAdvance ?? !!bpm
    const staggerLines = !!animation.staggerLines
    // the stagger is independent of auto-advance: the operator can hold a slide
    // manually while its lines still land on the beat
    const staggerSeconds = animation.staggerSeconds ?? (bpm ? beatsToSeconds(animation.staggerBeats ?? 1, bpm) : 0.4)
    const lineStyles = resolveLineStyles(animation)

    // a reveal delays each chunk from the moment the item mounts, while the
    // line stagger delays the item itself — running both would desync them
    const reveal = resolveReveal(animation, bpm)
    const useStagger = staggerLines && !reveal

    const textBox: TextBox = data.textBox || DEFAULT_TEXT_BOX
    const itemStyle = data.itemStyle || ""

    const slides: { [key: string]: Slide } = {}
    const layoutSlides: SlideData[] = []
    let totalSeconds = 0
    let timedSlides = 0

    data.slides.forEach((input) => {
        const lines = (input.lines || []).map((l) => (l ?? "").toString()).filter((l) => l.trim().length)
        // an empty entry still gets a slide, so "instrumental"/break sections keep their timing
        const slideId = uid()

        const items = useStagger && lines.length > 1 ? buildStaggeredItems(lines, lineStyles, staggerSeconds, textBox, itemStyle) : [buildItem(lines, lineStyles, reveal, textBox, itemStyle)]

        const slide: Slide = {
            group: input.group ?? null,
            color: null,
            settings: {},
            notes: "",
            items
        }
        if (input.globalGroup) slide.globalGroup = input.globalGroup
        slides[slideId] = slide

        const layoutSlide: SlideData = { id: slideId }
        if (transitionMs > 0) layoutSlide.transition = { ...transition }
        // the band rides along with every slide, so it never has to be cued by hand
        if (data.overlayId) layoutSlide.overlays = [data.overlayId]

        const seconds = input.seconds ?? (bpm && input.beats ? beatsToSeconds(input.beats, bpm) : 0)
        if (autoAdvance && seconds > 0) {
            layoutSlide.nextTimer = round(seconds)
            totalSeconds += seconds
            timedSlides++
        }

        layoutSlides.push(layoutSlide)
    })

    const layoutId = uid()
    const show: Show = new ShowObj(false, data.category || null, layoutId, new Date().getTime(), data.templateId || true)
    show.name = checkName(data.name || "Alabanza")
    show.slides = slides
    show.layouts[layoutId].slides = layoutSlides

    const meta: { [key: string]: string } = { ...(data.meta || {}) }
    if (!meta.title) meta.title = show.name
    show.meta = meta

    const showId = uid()
    history({
        id: "UPDATE",
        oldData: { id: showId },
        newData: { data: show, remember: { project: get(activeProject) } },
        location: { page: "show", id: "show" }
    })

    return {
        id: showId,
        name: show.name,
        slides: layoutSlides.length,
        bpm: bpm || null,
        transition: { type: transitionType, duration: transitionMs, easing },
        autoAdvance,
        staggerLines: useStagger,
        reveal: reveal ? { mode: reveal.mode, stepMs: reveal.stepMs, motion: reveal.motion, durationMs: reveal.durationMs } : null,
        lineStyle: animation.lineStyles?.length ? "custom" : animation.lineStyle || "uniform",
        timedSlides,
        totalSeconds: round(totalSeconds, 2)
    }
}

/// ITEMS ///

/**
 * A single textbox holding every line of the slide.
 * With a reveal configured, the delay keeps counting across lines so the whole
 * slide reads as one continuous phrase rather than restarting each line.
 */
function buildItem(lines: string[], styles: LineStyle[], reveal: RevealConfig | null = null, box: TextBox = DEFAULT_TEXT_BOX, extraStyle = ""): Item {
    const sourceLines = lines.length ? lines : [""]
    let unit = 0

    const builtLines: Line[] = sourceLines.map((text, i) => {
        const style = styleForLine(styles, i)
        if (!reveal) return buildLine(text, style)

        const { chunks, units } = splitForReveal(text, style, reveal, unit)
        unit += units
        return { align: "", text: chunks }
    })

    return {
        type: "text",
        style: `top:${box.top}px;left:${box.left}px;height:${box.height}px;width:${box.width}px;${extraStyle}`,
        textFit: "shrinkToFit",
        lines: builtLines
    }
}

// the box DEFAULT_ITEM_STYLE describes, which the stacked rows divide up
const BOX_TOP = 88
const BOX_HEIGHT = 904
const BOX_LEFT = 50
const BOX_WIDTH = 1820

/** Geometry the text items are laid out in; a template can move it. */
type TextBox = { left: number; top: number; width: number; height: number }
const DEFAULT_TEXT_BOX: TextBox = { left: BOX_LEFT, top: BOX_TOP, width: BOX_WIDTH, height: BOX_HEIGHT }

/**
 * One textbox per line, stacked vertically, each delayed by a whole beat.
 * `showTimer` is what the output uses as the item's in-transition delay, so the
 * lines land on successive beats without touching the renderer.
 *
 * Rows are sized in proportion to their font size, so a large lead line and a
 * smaller answer line each get the space they need instead of an even split.
 */
function buildStaggeredItems(lines: string[], styles: LineStyle[], staggerSeconds: number, box: TextBox = DEFAULT_TEXT_BOX, extraStyle = ""): Item[] {
    const sizes = lines.map((_, i) => styleForLine(styles, i).fontSize ?? 100)
    const totalSize = sizes.reduce((sum, size) => sum + size, 0) || 1

    let top = box.top
    return lines.map((text, i) => {
        const style = styleForLine(styles, i)
        const rowHeight = (sizes[i] / totalSize) * box.height

        const item: Item = {
            type: "text",
            style: `top:${Math.round(top)}px;left:${box.left}px;height:${Math.round(rowHeight)}px;width:${box.width}px;${extraStyle}`,
            textFit: "shrinkToFit",
            lines: [buildLine(text, style)]
        }
        top += rowHeight

        const delay = round(i * staggerSeconds)
        if (delay > 0) item.actions = { showTimer: delay }

        return item
    })
}
