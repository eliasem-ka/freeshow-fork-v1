// FORK-ONLY MODULE — not part of upstream FreeShow.
//
// Builds a lower-third "band" look for lyrics without needing any artwork:
// the band is a generated SVG shape stored on an icon item, so there are no
// image files to ship or lose.
//
// It produces two independent pieces, both usable on their own:
//   - an Overlay holding the band, flagged placeUnderSlide so it renders
//     behind the lyrics (songShow attaches it per slide via SlideData.overlays)
//   - a Template carrying the matching text position/typography, so the same
//     look can be applied by hand to any other show from the Templates drawer
//
// Wired in through a single entry in API_ACTIONS, like songShow.ts.

import { uid } from "uid"
import type { Item, Overlay, Template } from "../../../../types/Show"
import { history } from "../../helpers/history"

/// TYPES ///

export type BandPlacement = "lower_third" | "lower" | "center"

export type API_lyric_template = {
    /** Base name; the overlay and template get suffixed versions of it. */
    name?: string
    /** Where the band sits on a 1920x1080 canvas. Default "lower_third". */
    placement?: BandPlacement
    /** Band fill. Default near-white. */
    color?: string
    /** Band opacity, 0-1. Default 0.92. */
    opacity?: number
    /** Degrees of tilt; small values read as hand-placed. Default -1.5. */
    rotate?: number
    /** How uneven the band edges are, 0 = clean, 1 = rough. Default 0.6. */
    roughness?: number
    /** Overlapping strokes; 2 gives a painted, layered feel. Default 2. */
    layers?: number
    /** Fixes the generated shape, so the same seed always redraws identically. */
    seed?: number
    /** Text colour placed over the band. Default near-black for a light band. */
    textColor?: string
    /** Font for the template's text item. Must already be installed. */
    fontFamily?: string
    /** Also create the matching Template. Default true. */
    createTemplate?: boolean
}

/// GEOMETRY ///

// everything is authored against FreeShow's 1920x1080 canvas
const CANVAS_W = 1920
const CANVAS_H = 1080

type Box = { left: number; top: number; width: number; height: number }

const PLACEMENTS: { [key in BandPlacement]: { band: Box; text: Box } } = {
    lower_third: {
        band: { left: 140, top: 690, width: 1640, height: 280 },
        text: { left: 200, top: 720, width: 1520, height: 220 }
    },
    lower: {
        band: { left: 140, top: 780, width: 1640, height: 230 },
        text: { left: 200, top: 805, width: 1520, height: 180 }
    },
    center: {
        band: { left: 120, top: 380, width: 1680, height: 320 },
        text: { left: 190, top: 415, width: 1540, height: 250 }
    }
}

/// SHAPE ///

/** Small deterministic PRNG, so a given seed always redraws the same band. */
function seeded(seed: number) {
    let s = (seed || 1) >>> 0
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0
        return s / 4294967296
    }
}

/** Smooth a polyline with quadratic segments through the midpoints. */
function smooth(points: [number, number][], startWith = "M") {
    if (!points.length) return ""
    let d = `${startWith} ${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`
    for (let i = 1; i < points.length - 1; i++) {
        const [cx, cy] = points[i]
        const [nx, ny] = points[i + 1]
        d += ` Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${((cx + nx) / 2).toFixed(1)} ${((cy + ny) / 2).toFixed(1)}`
    }
    const last = points[points.length - 1]
    d += ` L ${last[0].toFixed(1)} ${last[1].toFixed(1)}`
    return d
}

/**
 * A horizontal band that thins toward both ends and has slightly uneven edges,
 * so it reads as a drawn stroke rather than a rectangle.
 */
function bandPath(w: number, h: number, seed: number, roughness: number) {
    const rand = seeded(seed)
    const steps = 16
    const wobble = h * 0.1 * roughness

    const top: [number, number][] = []
    const bottom: [number, number][] = []

    for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const x = t * w
        // full thickness through the middle, tapering off at the ends
        const taper = Math.pow(Math.sin(Math.PI * t), 0.32)
        const half = (h / 2) * taper
        top.push([x, h / 2 - half + (rand() - 0.5) * wobble])
        bottom.push([x, h / 2 + half + (rand() - 0.5) * wobble])
    }

    // out along the top edge, back along the bottom
    return `${smooth(top)} ${smooth(bottom.reverse(), "L")} Z`
}

/**
 * Layered strokes: one solid band plus fainter, slightly offset repeats, which
 * is what gives it depth instead of looking like a flat shape.
 */
export function buildBandSvg(box: Box, color: string, opacity: number, seed: number, roughness: number, layers: number) {
    const { width: w, height: h } = box
    const count = Math.max(1, Math.min(4, Math.round(layers)))

    const paths: string[] = []
    for (let i = 0; i < count; i++) {
        // the base layer is the solid one; extras sit behind it, fainter and nudged
        const isBase = i === 0
        const layerOpacity = isBase ? opacity : opacity * (0.3 - i * 0.06)
        const offsetY = isBase ? 0 : (i % 2 === 0 ? 1 : -1) * h * 0.06 * i
        const inset = isBase ? 0 : w * 0.01 * i

        const d = bandPath(w - inset * 2, h, seed + i * 977, roughness)
        paths.push(`<path d="${d}" fill="${color}" opacity="${layerOpacity.toFixed(3)}" transform="translate(${inset.toFixed(1)} ${offsetY.toFixed(1)})"/>`)
    }

    // authored at the box's own size, so nothing stretches out of proportion
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${paths.reverse().join("")}</svg>`
}

/// BUILD ///

function boxToStyle(box: Box, extra = "") {
    return `top:${box.top}px;left:${box.left}px;width:${box.width}px;height:${box.height}px;${extra}`
}

/**
 * API: create the band overlay (and matching text template) for a lyric look.
 * Returns the ids so create_animated_song can attach them.
 */
export function createLyricTemplate(data: API_lyric_template = {}) {
    const placement = PLACEMENTS[data.placement || "lower_third"] || PLACEMENTS.lower_third
    const name = data.name || "Banda"

    const color = data.color || "#F2F0EB"
    const opacity = data.opacity ?? 0.92
    const rotate = data.rotate ?? -1.5
    const roughness = Math.max(0, Math.min(1, data.roughness ?? 0.6))
    const layers = data.layers ?? 2
    const seed = data.seed ?? 20260725

    // OVERLAY (the band itself)

    const svg = buildBandSvg(placement.band, color, opacity, seed, roughness, layers)
    const bandItem: Item = {
        type: "icon",
        customSvg: svg,
        // no "color:" here on purpose — that would make FreeShow force
        // fill: currentColor and flatten the layered opacities
        style: boxToStyle(placement.band, `transform: rotate(${rotate}deg);`),
        decoration: true
    }

    const overlay: Overlay = {
        name: `${name} (fondo)`,
        color: null,
        category: null,
        placeUnderSlide: true,
        items: [bandItem]
    }

    const overlayId = uid()
    history({
        id: "UPDATE",
        oldData: { id: overlayId },
        newData: { data: overlay },
        location: { page: "drawer", id: "overlay" }
    })

    // TEMPLATE (text placed to sit on the band)

    let templateId = ""
    if (data.createTemplate !== false) {
        const textColor = data.textColor || "#151515"
        const fontCss = data.fontFamily ? `font-family: ${data.fontFamily};` : ""

        const textItem: Item = {
            type: "text",
            style: boxToStyle(placement.text, `transform: rotate(${rotate}deg);`),
            textFit: "shrinkToFit",
            lines: [{ align: "", text: [{ value: "", style: `${fontCss}font-size: 90px;font-weight: 600;color: ${textColor};` }] }]
        }

        const template: Template = {
            name,
            color: null,
            category: null,
            items: [textItem]
        }

        templateId = uid()
        history({
            id: "UPDATE",
            oldData: { id: templateId },
            newData: { data: template },
            location: { page: "drawer", id: "template" }
        })
    }

    return {
        overlayId,
        templateId: templateId || null,
        name,
        placement: data.placement || "lower_third",
        band: placement.band,
        text: placement.text,
        // handy for the caller: matches what songShow expects in lineStyles
        suggestedTextColor: data.textColor || "#151515",
        canvas: { width: CANVAS_W, height: CANVAS_H }
    }
}
