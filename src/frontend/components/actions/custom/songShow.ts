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
}

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
    if (animation.lineStyles?.length) return animation.lineStyles
    const key = (animation.lineStyle || "uniform").toLowerCase().trim()
    return LINE_STYLE_PRESETS[LINE_STYLE_ALIASES[key] || key] || LINE_STYLE_PRESETS.uniform
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

    const slides: { [key: string]: Slide } = {}
    const layoutSlides: SlideData[] = []
    let totalSeconds = 0
    let timedSlides = 0

    data.slides.forEach((input) => {
        const lines = (input.lines || []).map((l) => (l ?? "").toString()).filter((l) => l.trim().length)
        // an empty entry still gets a slide, so "instrumental"/break sections keep their timing
        const slideId = uid()

        const items = staggerLines && lines.length > 1 ? buildStaggeredItems(lines, lineStyles, staggerSeconds) : [buildItem(lines, lineStyles)]

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

        const seconds = input.seconds ?? (bpm && input.beats ? beatsToSeconds(input.beats, bpm) : 0)
        if (autoAdvance && seconds > 0) {
            layoutSlide.nextTimer = round(seconds)
            totalSeconds += seconds
            timedSlides++
        }

        layoutSlides.push(layoutSlide)
    })

    const layoutId = uid()
    const show: Show = new ShowObj(false, data.category || null, layoutId)
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
        staggerLines,
        lineStyle: animation.lineStyles?.length ? "custom" : animation.lineStyle || "uniform",
        timedSlides,
        totalSeconds: round(totalSeconds, 2)
    }
}

/// ITEMS ///

/** A single textbox holding every line of the slide. */
function buildItem(lines: string[], styles: LineStyle[]): Item {
    return {
        type: "text",
        style: DEFAULT_ITEM_STYLE,
        textFit: "shrinkToFit",
        lines: (lines.length ? lines : [""]).map((text, i) => buildLine(text, styleForLine(styles, i)))
    }
}

// the box DEFAULT_ITEM_STYLE describes, which the stacked rows divide up
const BOX_TOP = 88
const BOX_HEIGHT = 904

/**
 * One textbox per line, stacked vertically, each delayed by a whole beat.
 * `showTimer` is what the output uses as the item's in-transition delay, so the
 * lines land on successive beats without touching the renderer.
 *
 * Rows are sized in proportion to their font size, so a large lead line and a
 * smaller answer line each get the space they need instead of an even split.
 */
function buildStaggeredItems(lines: string[], styles: LineStyle[], staggerSeconds: number): Item[] {
    const sizes = lines.map((_, i) => styleForLine(styles, i).fontSize ?? 100)
    const totalSize = sizes.reduce((sum, size) => sum + size, 0) || 1

    let top = BOX_TOP
    return lines.map((text, i) => {
        const style = styleForLine(styles, i)
        const rowHeight = (sizes[i] / totalSize) * BOX_HEIGHT

        const item: Item = {
            type: "text",
            style: `top:${Math.round(top)}px;left:50px;height:${Math.round(rowHeight)}px;width:1820px;`,
            textFit: "shrinkToFit",
            lines: [buildLine(text, style)]
        }
        top += rowHeight

        const delay = round(i * staggerSeconds)
        if (delay > 0) item.actions = { showTimer: delay }

        return item
    })
}
