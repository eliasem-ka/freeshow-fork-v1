// Fork feature: a small, declarative description of a theme ("spec") and its translation to and
// from FreeShow's template items. It is what the theme API, the quick editor and the factory themes
// share. Pure functions only (no stores), so they can be unit tested.

import type { Item, Line, Template, TemplateSettings } from "../../../types/Show"

/// TYPES ///

export const THEME_CANVAS = { width: 1920, height: 1080 }

/** Pixels on the 1920x1080 canvas. */
export type ThemeBox = { left: number; top: number; width: number; height: number }
export type ThemePosition = "full" | "center" | "upper_third" | "lower_third" | "top" | "bottom" | "left" | "right"

export type ThemeDecoration = {
    /** "rect": a filled box. "gradient": a fade from one colour to another (use a transparent end to dim part of a video). */
    type: "rect" | "gradient"
    position?: ThemePosition | ThemeBox
    color?: string
    /** Gradient end colour. Default: transparent. */
    to?: string
    /** Gradient direction in degrees: 0 = left to right, 90 = top to bottom. Default 90. */
    angle?: number
    /** 0-1. Default 1. */
    opacity?: number
    /** Corner radius in pixels. */
    radius?: number
}

export type ThemeSpec = {
    /** Where the text sits: a named place or an exact box. Default "full". */
    position?: ThemePosition | ThemeBox
    /** Distance from the canvas edges for named positions, in pixels. Default 60. */
    margin?: number

    font?: string
    /** Font size in pixels on the 1920x1080 canvas (lyrics are usually 70-120). */
    size?: number
    weight?: "normal" | "bold" | number
    italic?: boolean
    uppercase?: boolean
    color?: string
    align?: "left" | "center" | "right"
    verticalAlign?: "top" | "center" | "bottom"
    /** Line height in em. */
    lineHeight?: number
    /** Letter spacing in pixels. */
    letterSpacing?: number
    /** false removes it. */
    shadow?: false | { color?: string; x?: number; y?: number; blur?: number }
    /** Text outline; false removes it. */
    outline?: false | { color?: string; width?: number }
    /** A filled box behind the text; false removes it. */
    box?: false | { color?: string; opacity?: number; radius?: number; padding?: number }
    /** What to do when the text does not fit its box. Default "shrink". */
    fit?: "shrink" | "grow" | "none"

    background?: { color?: string; path?: string }
    /** Split slides that have more lines than this. */
    maxLines?: number
    /** Shapes drawn behind the text, first one at the back. */
    decorations?: ThemeDecoration[]
}

/// CSS HELPERS ///

/** "a: 1; b: url(x;y)" -> [["a", "1"], ["b", "url(x;y)"]] (semicolons inside parentheses are kept). */
export function parseCss(style: string | undefined): [string, string][] {
    const pairs: [string, string][] = []
    let depth = 0
    let current = ""
    const push = () => {
        const index = current.indexOf(":")
        if (index > 0) {
            const key = current.slice(0, index).trim().toLowerCase()
            const value = current.slice(index + 1).trim()
            if (key && value) pairs.push([key, value])
        }
        current = ""
    }
    for (const char of style || "") {
        if (char === "(") depth++
        else if (char === ")") depth = Math.max(0, depth - 1)
        if (char === ";" && depth === 0) push()
        else current += char
    }
    push()
    return pairs
}

export function stringifyCss(pairs: [string, string][]) {
    return pairs.map(([key, value]) => `${key}: ${value};`).join("")
}

export function getCssValue(style: string | undefined, key: string) {
    const pairs = parseCss(style)
    for (let i = pairs.length - 1; i >= 0; i--) if (pairs[i][0] === key) return pairs[i][1]
    return ""
}

/** Set keys (in place where they already are), and remove the ones given as "" / null / undefined. */
export function setCssValues(style: string | undefined, values: { [key: string]: string | number | null | undefined }) {
    const pairs = parseCss(style)
    Object.entries(values).forEach(([key, value]) => {
        const text = value === null || value === undefined ? "" : String(value)
        const index = pairs.findIndex((pair) => pair[0] === key)
        if (!text) {
            // every copy, a style can repeat a key
            for (let i = pairs.length - 1; i >= 0; i--) if (pairs[i][0] === key) pairs.splice(i, 1)
        } else if (index < 0) pairs.push([key, text])
        else pairs[index][1] = text
    })
    return stringifyCss(pairs)
}

const number = (value: string | undefined) => {
    const parsed = parseFloat(value || "")
    return isNaN(parsed) ? undefined : parsed
}
const round = (value: number) => Math.round(value * 100) / 100

/// COLOURS ///

/** #rgb / #rrggbb / #rrggbbaa -> { r, g, b, a } (null when it is not a hex colour). */
export function parseHex(color: string) {
    const hex = (color || "").trim().replace(/^#/, "")
    if (!/^([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) return null
    const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex
    return { r: parseInt(full.slice(0, 2), 16), g: parseInt(full.slice(2, 4), 16), b: parseInt(full.slice(4, 6), 16), a: full.length === 8 ? round(parseInt(full.slice(6, 8), 16) / 255) : 1 }
}

/** A colour with an opacity, in the "rgb(r g b / a)" form FreeShow's colour inputs write. */
export function withOpacity(color: string, opacity: number | undefined) {
    if (opacity === undefined || opacity >= 1) return color
    const rgb = parseHex(color)
    if (!rgb) return color
    return `rgb(${rgb.r} ${rgb.g} ${rgb.b} / ${round(Math.max(0, opacity))})`
}

/** Same colour written differently compares equal: "#FFF", "#ffffff", "rgb(255 255 255)", "rgb(255, 255, 255)". */
export function normalizeColor(color: string) {
    const value = (color || "").trim().toLowerCase()
    const hex = parseHex(value)
    if (hex) return `${hex.r},${hex.g},${hex.b},${hex.a}`
    const rgb = value.match(/^rgba?\(([^)]+)\)$/)
    if (rgb) {
        const parts = rgb[1].split(/[\s,/]+/).filter(Boolean)
        if (parts.length >= 3) {
            let alpha = parts[3] === undefined ? 1 : parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])
            if (isNaN(alpha)) alpha = 1
            return `${parseFloat(parts[0])},${parseFloat(parts[1])},${parseFloat(parts[2])},${round(alpha)}`
        }
    }
    return value
}

/** "#rrggbb" of any colour this file understands (its opacity is dropped), or "" for gradients, names... */
export function colorToHex(color: string) {
    const parts = normalizeColor(color).split(",").map(Number)
    if (parts.length !== 4 || parts.some((part) => isNaN(part))) return ""
    return (
        "#" +
        parts
            .slice(0, 3)
            .map((part) =>
                Math.max(0, Math.min(255, Math.round(part)))
                    .toString(16)
                    .padStart(2, "0")
            )
            .join("")
    )
}

/** A new hex colour with the opacity the old colour had (a colour picker only gives the hex). */
export function keepOpacity(oldColor: string, newHex: string) {
    const alpha = Number(normalizeColor(oldColor).split(",")[3])
    return withOpacity(newHex, isNaN(alpha) ? 1 : alpha)
}

/// BOXES ///

export function getPositionBox(position: ThemePosition | ThemeBox | undefined, margin = 60): ThemeBox {
    if (position && typeof position === "object") {
        return { left: Number(position.left) || 0, top: Number(position.top) || 0, width: Number(position.width) || THEME_CANVAS.width, height: Number(position.height) || THEME_CANVAS.height }
    }

    const { width: W, height: H } = THEME_CANVAS
    const m = Math.max(0, Math.min(400, margin))
    const wide = { left: m, width: W - m * 2 }
    const third = Math.round((H - m * 2) / 3)
    const boxes: { [key in ThemePosition]: ThemeBox } = {
        full: { ...wide, top: m, height: H - m * 2 },
        center: { ...wide, top: Math.round(H / 4), height: Math.round(H / 2) },
        upper_third: { ...wide, top: m, height: third },
        lower_third: { ...wide, top: H - m - third, height: third },
        top: { ...wide, top: m, height: 200 },
        bottom: { ...wide, top: H - m - 200, height: 200 },
        left: { left: m, top: m, width: Math.round(W / 2 - m * 1.5), height: H - m * 2 },
        right: { left: Math.round(W / 2 + m / 2), top: m, width: Math.round(W / 2 - m * 1.5), height: H - m * 2 }
    }
    return boxes[position || "full"] || boxes.full
}

const boxStyle = (box: ThemeBox) => ({ top: `${round(box.top)}px`, left: `${round(box.left)}px`, width: `${round(box.width)}px`, height: `${round(box.height)}px` })

function readBox(style: string | undefined): ThemeBox {
    return {
        left: number(getCssValue(style, "left")) ?? 0,
        top: number(getCssValue(style, "top")) ?? 0,
        width: number(getCssValue(style, "width")) ?? THEME_CANVAS.width,
        height: number(getCssValue(style, "height")) ?? THEME_CANVAS.height
    }
}

/** The named position a box is (with any margin), or the box itself. */
function nameBox(box: ThemeBox): { position: ThemePosition | ThemeBox; margin?: number } {
    const names: ThemePosition[] = ["full", "center", "upper_third", "lower_third", "top", "bottom", "left", "right"]
    const margin = Math.round(box.left)
    for (const name of names) {
        const named = getPositionBox(name, margin)
        if (Math.abs(named.left - box.left) < 2 && Math.abs(named.top - box.top) < 2 && Math.abs(named.width - box.width) < 2 && Math.abs(named.height - box.height) < 2) return { position: name, margin }
    }
    return { position: box }
}

/// DECORATIONS ///

const DECORATION_ID = "themedeco_"
const escapeAttribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")

function decorationItem(decoration: ThemeDecoration, index: number, margin: number): Item {
    const box = getPositionBox(decoration.position || "full", decoration.position ? margin : 0)
    const color = escapeAttribute(decoration.color || "#000000")
    const opacity = round(Math.max(0, Math.min(1, decoration.opacity ?? 1)))
    const radius = Math.max(0, decoration.radius || 0)
    const w = round(box.width)
    const h = round(box.height)

    let fill = color
    let defs = ""
    if (decoration.type === "gradient") {
        // angle to the two ends of a gradient vector, in the 0-1 box
        const radians = ((decoration.angle ?? 90) * Math.PI) / 180
        const x = Math.cos(radians) / 2
        const y = Math.sin(radians) / 2
        const end = decoration.to ? `stop-color="${escapeAttribute(decoration.to)}"` : `stop-color="${color}" stop-opacity="0"`
        defs = `<defs><linearGradient id="g${index}" x1="${round(0.5 - x)}" y1="${round(0.5 - y)}" x2="${round(0.5 + x)}" y2="${round(0.5 + y)}"><stop offset="0" stop-color="${color}"/><stop offset="1" ${end}/></linearGradient></defs>`
        fill = `url(#g${index})`
    }

    return {
        id: DECORATION_ID + index,
        type: "icon",
        // no "color:" in the style: FreeShow would force fill: currentColor and lose the gradient
        customSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${defs}<rect width="${w}" height="${h}" rx="${radius}" fill="${fill}" opacity="${opacity}"/></svg>`,
        style: stringifyCss(Object.entries(boxStyle(box))),
        decoration: true
    }
}

const isSpecDecoration = (item: Item) => (item.id || "").startsWith(DECORATION_ID)

/** Decorations made from a spec, read back (shapes drawn by hand are left alone and not listed). */
function readDecoration(item: Item): ThemeDecoration {
    const svg = item.customSvg || ""
    const box = readBox(item.style)
    const attribute = (name: string, source = svg) => (source.match(new RegExp(`${name}="([^"]*)"`)) || [])[1]
    const stops = svg.match(/<stop [^>]*>/g) || []
    const named = nameBox(box)
    const decoration: ThemeDecoration = { type: stops.length ? "gradient" : "rect", position: named.position === "full" && !named.margin ? undefined : named.position }

    const rect = (svg.match(/<rect [^>]*>/) || [""])[0]
    const opacity = number(attribute("opacity", rect))
    const radius = number(attribute("rx", rect))
    if (stops.length) {
        decoration.color = attribute("stop-color", stops[0])
        if (stops[1] && !/stop-opacity="0"/.test(stops[1])) decoration.to = attribute("stop-color", stops[1])
        const x = (number(attribute("x2")) ?? 1) - 0.5
        const y = (number(attribute("y2")) ?? 0.5) - 0.5
        decoration.angle = Math.round((Math.atan2(y, x) * 180) / Math.PI)
    } else decoration.color = attribute("fill", rect)
    if (opacity !== undefined && opacity < 1) decoration.opacity = opacity
    if (radius) decoration.radius = radius
    if (!decoration.position) delete decoration.position
    return decoration
}

/// SPEC -> ITEMS ///

const FIT = { shrink: "shrinkToFit", grow: "growToFit", none: "none" } as const
const VERTICAL = { top: "flex-start", center: "center", bottom: "flex-end" } as const

const isTextItem = (item: Item) => (!item.type || item.type === "text") && Array.isArray(item.lines)

/** Index of the item the spec describes: the first text box that is not a decoration. */
export function getMainTextIndex(items: Item[]) {
    return (items || []).findIndex((item) => isTextItem(item) && !item.decoration)
}

/** CSS of the text itself for the keys the spec has (a key set to null is removed). */
function textValues(spec: ThemeSpec) {
    const values: { [key: string]: string | number | null } = {}
    if ("font" in spec) values["font-family"] = spec.font || null
    if ("size" in spec) values["font-size"] = spec.size ? `${round(spec.size)}px` : null
    if ("weight" in spec) values["font-weight"] = !spec.weight || spec.weight === "normal" ? null : spec.weight
    if ("italic" in spec) values["font-style"] = spec.italic ? "italic" : null
    if ("uppercase" in spec) values["text-transform"] = spec.uppercase ? "uppercase" : null
    if ("color" in spec) values.color = spec.color || null
    if ("lineHeight" in spec) values["line-height"] = spec.lineHeight ? `${round(spec.lineHeight)}em` : null
    if ("letterSpacing" in spec) values["letter-spacing"] = spec.letterSpacing ? `${round(spec.letterSpacing)}px` : null
    if ("shadow" in spec) {
        const shadow = spec.shadow
        // FreeShow adds its own default shadow when there is none: "none" really removes it
        values["text-shadow"] = shadow ? `${round(shadow.x ?? 2)}px ${round(shadow.y ?? 2)}px ${round(shadow.blur ?? 10)}px ${shadow.color || "#000000"}` : shadow === false ? "0px 0px 0px rgb(0 0 0 / 0)" : null
    }
    if ("outline" in spec) {
        const outline = spec.outline
        values["-webkit-text-stroke-width"] = outline && (outline.width ?? 4) > 0 ? `${round(outline.width ?? 4)}px` : null
        values["-webkit-text-stroke-color"] = outline && (outline.width ?? 4) > 0 ? outline.color || "#000000" : null
    }
    return values
}

function emptyTextItem(): Item {
    return { type: "text", style: "", align: "", lines: [{ align: "", text: [{ value: "", style: "" }] }] }
}

/**
 * Apply the keys a spec has onto existing items, leaving everything else as it is: this is how a
 * theme is edited without losing what was drawn by hand. Decorations are replaced only when the
 * spec lists them.
 */
export function patchItemsWithSpec(currentItems: Item[], spec: ThemeSpec): Item[] {
    let items: Item[] = JSON.parse(JSON.stringify(currentItems || []))

    if ("decorations" in spec) {
        const margin = spec.margin ?? 60
        const decorations = (spec.decorations || []).map((decoration, index) => decorationItem(decoration, index, margin))
        items = [...decorations, ...items.filter((item) => !isSpecDecoration(item))]
    }

    let index = getMainTextIndex(items)
    if (index < 0) {
        items.push(emptyTextItem())
        index = items.length - 1
        // a new text box gets a full description, not just the keys given
        spec = { position: "full", fit: "shrink", ...spec }
    }
    const item = items[index]

    if ("position" in spec || "margin" in spec) {
        // a text box that was just made has no place yet: nothing to keep from it
        const current = getCssValue(item.style, "width") ? nameBox(readBox(item.style)) : { position: "full" as ThemePosition, margin: undefined }
        const position = "position" in spec ? spec.position : current.position
        item.style = setCssValues(item.style, boxStyle(getPositionBox(position, spec.margin ?? current.margin ?? 60)))
    }
    if ("box" in spec) {
        const box = spec.box
        item.style = setCssValues(item.style, {
            "background-color": box ? withOpacity(box.color || "#000000", box.opacity) : null,
            "border-radius": box && box.radius ? `${round(box.radius)}px` : null,
            padding: box && box.padding ? `${round(box.padding)}px` : null
        })
    }
    if ("verticalAlign" in spec) item.align = spec.verticalAlign && spec.verticalAlign !== "center" ? `align-items:${VERTICAL[spec.verticalAlign] || "center"};` : ""
    if ("fit" in spec) item.textFit = FIT[spec.fit || "shrink"] || "shrinkToFit"

    const values = textValues(spec)
    if (!item.lines?.length) item.lines = [{ align: "", text: [{ value: "", style: "" }] }]
    item.lines.forEach((line: Line) => {
        if ("align" in spec) line.align = spec.align && spec.align !== "center" ? `text-align: ${spec.align};` : ""
        if (!line.text?.length) line.text = [{ value: "", style: "" }]
        if (Object.keys(values).length) line.text.forEach((text) => (text.style = setCssValues(text.style, values)))
    })

    return items
}

/** Items of a new theme. */
export function specToItems(spec: ThemeSpec): Item[] {
    return patchItemsWithSpec([], { position: "full", size: 100, fit: "shrink", ...spec })
}

/** Template settings for the keys a spec has (background, max lines). */
export function patchSettingsWithSpec(currentSettings: TemplateSettings | undefined, spec: ThemeSpec): TemplateSettings {
    const settings: TemplateSettings = { ...(currentSettings || {}) }
    if ("background" in spec) {
        if (spec.background?.color) settings.backgroundColor = spec.background.color
        else delete settings.backgroundColor
        if (spec.background?.path) settings.backgroundPath = spec.background.path
        else delete settings.backgroundPath
    }
    if ("maxLines" in spec) {
        if (spec.maxLines && spec.maxLines > 0) settings.maxLinesPerSlide = Math.round(spec.maxLines)
        else delete settings.maxLinesPerSlide
    }
    return settings
}

/// ITEMS -> SPEC ///

/** Describe a theme (of any origin) as a spec: its main text box, background and spec-made decorations. */
export function itemsToSpec(items: Item[], settings?: TemplateSettings): ThemeSpec {
    const spec: ThemeSpec = {}
    const item = (items || [])[getMainTextIndex(items)]

    if (item) {
        const named = nameBox(readBox(item.style))
        spec.position = named.position
        if (named.margin !== undefined) spec.margin = named.margin

        const line = item.lines?.[0]
        const style = line?.text?.[0]?.style || ""
        const font = getCssValue(style, "font-family")
        if (font) spec.font = font
        const size = number(getCssValue(style, "font-size"))
        if (size) spec.size = size
        const weight = getCssValue(style, "font-weight")
        if (weight && weight !== "normal") spec.weight = isNaN(Number(weight)) ? "bold" : Number(weight)
        if (getCssValue(style, "font-style") === "italic") spec.italic = true
        if (getCssValue(style, "text-transform") === "uppercase") spec.uppercase = true
        const color = getCssValue(style, "color")
        if (color) spec.color = color
        const lineHeight = number(getCssValue(style, "line-height"))
        if (lineHeight) spec.lineHeight = lineHeight
        const letterSpacing = number(getCssValue(style, "letter-spacing"))
        if (letterSpacing) spec.letterSpacing = letterSpacing

        const shadow = getCssValue(style, "text-shadow")
        if (shadow) {
            // "x y blur colour", the colour may have spaces: rgb(0 0 0 / 80%)
            const match = shadow.match(/^(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(.+)$/)
            if (match) {
                const visible = Number(match[1]) || Number(match[2]) || Number(match[3])
                spec.shadow = visible ? { x: Number(match[1]), y: Number(match[2]), blur: Number(match[3]), color: match[4] } : false
            }
        }
        const outlineWidth = number(getCssValue(style, "-webkit-text-stroke-width"))
        if (outlineWidth) spec.outline = { width: outlineWidth, color: getCssValue(style, "-webkit-text-stroke-color") || "#000000" }

        const align = getCssValue(line?.align, "text-align")
        if (align === "left" || align === "right") spec.align = align
        const vertical = getCssValue(item.align, "align-items")
        if (vertical === "flex-start") spec.verticalAlign = "top"
        else if (vertical === "flex-end") spec.verticalAlign = "bottom"

        const boxColor = getCssValue(item.style, "background-color")
        if (boxColor) {
            spec.box = { color: boxColor }
            const radius = number(getCssValue(item.style, "border-radius"))
            if (radius) spec.box.radius = radius
            const padding = number(getCssValue(item.style, "padding"))
            if (padding) spec.box.padding = padding
        }

        if (item.textFit === "growToFit") spec.fit = "grow"
        else if (item.textFit === "none") spec.fit = "none"
    }

    if (settings?.backgroundColor || settings?.backgroundPath) {
        spec.background = {}
        if (settings.backgroundColor) spec.background.color = settings.backgroundColor
        if (settings.backgroundPath) spec.background.path = settings.backgroundPath
    }
    const maxLines = Number(settings?.maxLinesPerSlide)
    if (maxLines > 0) spec.maxLines = maxLines

    const decorations = (items || []).filter(isSpecDecoration).map(readDecoration)
    if (decorations.length) spec.decorations = decorations

    return spec
}

/// SAMPLE TEXT ///

/** Copy of the items with example text in the main text box (one line per line of the sample), for previews. */
export function fillSampleText(items: Item[], sample: string): Item[] {
    const copy: Item[] = JSON.parse(JSON.stringify(items || []))
    const item = copy[getMainTextIndex(copy)]
    if (!item) return copy

    const first = item.lines?.[0] || { align: "", text: [{ value: "", style: "" }] }
    const style = first.text?.[0]?.style || ""
    const lines = (sample || "").split("\n").filter((line) => line.trim())
    if (!lines.length) return copy
    item.lines = lines.map((value) => ({ align: first.align || "", text: [{ value, style }] }))
    return copy
}

/// PALETTE ///
// The colours and fonts a group of themes uses, so one of them can be changed everywhere at once
// (a series that changes its accent colour, a church that changes its font).

export type ThemePalette = { colors: { value: string; count: number }[]; fonts: { value: string; count: number }[] }

const COLOR_KEYS = ["color", "background-color", "-webkit-text-stroke-color", "border-color"]
const SVG_COLOR = /(fill|stop-color|stroke)="([^"]+)"/g

/** Every style string of a template, with a setter, so reading and replacing walk the same places. */
function eachStyle(template: Template, callback: (style: string) => string | void) {
    const apply = (owner: any, key: string) => {
        if (typeof owner?.[key] !== "string") return
        const result = callback(owner[key])
        if (typeof result === "string") owner[key] = result
    }
    ;(template.items || []).forEach((item) => {
        apply(item, "style")
        ;(item.lines || []).forEach((line) => (line.text || []).forEach((text) => apply(text, "style")))
    })
}

export function getPalette(templates: Template[]): ThemePalette {
    const colors = new Map<string, { value: string; count: number }>()
    const fonts = new Map<string, { value: string; count: number }>()
    const add = (map: Map<string, { value: string; count: number }>, key: string, value: string) => {
        if (!value) return
        const entry = map.get(key)
        if (entry) entry.count++
        else map.set(key, { value, count: 1 })
    }
    const addColor = (value: string) => {
        // gradients and "url(#id)" fills are not single colours
        if (!value || /gradient|url\(|^none$|^transparent$|currentcolor/i.test(value)) return
        add(colors, normalizeColor(value), value)
    }

    templates.forEach((template) => {
        eachStyle(template, (style) => {
            parseCss(style).forEach(([key, value]) => {
                if (COLOR_KEYS.includes(key)) addColor(value)
                else if (key === "font-family") add(fonts, value.toLowerCase(), value)
            })
        })
        ;(template.items || []).forEach((item) => {
            for (const match of (item.customSvg || "").matchAll(SVG_COLOR)) addColor(match[2])
        })
        if (template.settings?.backgroundColor) addColor(template.settings.backgroundColor)
    })

    const sort = (map: Map<string, { value: string; count: number }>) => [...map.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    return { colors: sort(colors), fonts: sort(fonts) }
}

/**
 * Copy of the template with one colour or font replaced everywhere it is used.
 * Returns null when it does not use it.
 */
export function replacePaletteValue(template: Template, kind: "color" | "font", from: string, to: string): Template | null {
    const copy: Template = JSON.parse(JSON.stringify(template))
    let changed = false
    const target = kind === "color" ? normalizeColor(from) : from.trim().toLowerCase()
    const matches = (value: string) => (kind === "color" ? normalizeColor(value) === target : value.trim().toLowerCase() === target)

    eachStyle(copy, (style) => {
        const pairs = parseCss(style)
        let styleChanged = false
        pairs.forEach((pair) => {
            const isKind = kind === "color" ? COLOR_KEYS.includes(pair[0]) : pair[0] === "font-family"
            if (!isKind || !matches(pair[1])) return
            pair[1] = to
            styleChanged = true
        })
        if (!styleChanged) return
        changed = true
        return stringifyCss(pairs)
    })

    if (kind === "color") {
        ;(copy.items || []).forEach((item) => {
            if (!item.customSvg) return
            const svg = item.customSvg.replace(SVG_COLOR, (whole, attribute, value) => (matches(value) ? `${attribute}="${escapeAttribute(to)}"` : whole))
            if (svg !== item.customSvg) {
                item.customSvg = svg
                changed = true
            }
        })
        if (copy.settings?.backgroundColor && matches(copy.settings.backgroundColor)) {
            copy.settings.backgroundColor = to
            changed = true
        }
    }

    return changed ? copy : null
}

/** Font names a template uses (to tell which ones are missing after importing a package). */
export function getTemplateFonts(template: Template) {
    return getPalette([template]).fonts.map((font) => font.value)
}

/** Media files a template needs: its background and its media items. */
export function getTemplateFiles(template: Template) {
    const files: string[] = []
    const add = (path: string | undefined) => {
        if (path && !files.includes(path) && !/^(data:|https?:|blob:)/.test(path)) files.push(path)
    }
    ;(template.items || []).forEach((item) => item.type === "media" && add(item.src))
    add(template.settings?.backgroundPath)
    return files
}
