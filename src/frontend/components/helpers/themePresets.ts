// Fork feature: factory themes. Each one is only a spec (see themeSpec.ts): no image or font files,
// so they work on any machine and are a starting point to edit, not a closed design.
// Fonts are limited to the ones macOS and Windows both ship.

import type { ThemeSpec } from "./themeSpec"

export type ThemePreset = {
    id: string
    name: { en: string; es: string }
    /** The group this theme is for when the folder is applied as a package ("first" = first slide, "default" = the rest). */
    role?: string
    spec: ThemeSpec
}

export const FACTORY_FOLDER = { en: "Factory themes", es: "Temas de fábrica" }

export const THEME_PRESETS: ThemePreset[] = [
    {
        id: "classic",
        name: { en: "Classic", es: "Clásico" },
        role: "default",
        spec: { position: "full", margin: 80, font: "Arial", size: 100, weight: "bold", color: "#FFFFFF", shadow: { color: "#000000", x: 2, y: 2, blur: 12 } }
    },
    {
        id: "title",
        name: { en: "Title", es: "Título" },
        role: "first",
        spec: {
            position: "full",
            margin: 120,
            font: "Arial",
            size: 150,
            weight: "bold",
            uppercase: true,
            letterSpacing: 4,
            color: "#FFFFFF",
            shadow: { color: "rgb(0 0 0 / 0.7)", x: 0, y: 6, blur: 24 },
            decorations: [
                { type: "gradient", color: "#000000", angle: 90, opacity: 0.55 },
                { type: "rect", position: { left: 810, top: 900, width: 300, height: 10 }, color: "#F2B84B", radius: 5 }
            ]
        }
    },
    {
        id: "lower_third",
        name: { en: "Lower third", es: "Tercio inferior" },
        spec: {
            position: "lower_third",
            margin: 70,
            font: "Arial",
            size: 70,
            weight: "bold",
            color: "#FFFFFF",
            shadow: false,
            box: { color: "#000000", opacity: 0.62, radius: 24, padding: 30 },
            maxLines: 2
        }
    },
    {
        id: "modern",
        name: { en: "Modern", es: "Moderno" },
        spec: {
            position: "left",
            margin: 110,
            font: "Arial Black",
            size: 96,
            uppercase: true,
            color: "#FFFFFF",
            align: "left",
            lineHeight: 1.05,
            shadow: { color: "rgb(0 0 0 / 0.6)", x: 0, y: 4, blur: 18 },
            decorations: [
                { type: "gradient", color: "#000000", angle: 0, opacity: 0.75 },
                { type: "rect", position: { left: 70, top: 110, width: 12, height: 860 }, color: "#F2B84B", radius: 6 }
            ]
        }
    },
    {
        id: "elegant",
        name: { en: "Elegant", es: "Elegante" },
        spec: {
            position: "full",
            margin: 140,
            font: "Georgia",
            size: 92,
            color: "#FFF8E7",
            lineHeight: 1.3,
            shadow: { color: "rgb(0 0 0 / 0.75)", x: 0, y: 3, blur: 20 },
            decorations: [{ type: "rect", color: "#000000", opacity: 0.35 }]
        }
    },
    {
        id: "outline",
        name: { en: "Outline", es: "Contorno" },
        spec: { position: "full", margin: 80, font: "Arial", size: 104, weight: "bold", color: "#FFFFFF", outline: { color: "#000000", width: 6 }, shadow: { color: "#000000", x: 0, y: 0, blur: 16 } }
    },
    {
        id: "light",
        name: { en: "Light", es: "Claro" },
        spec: { position: "full", margin: 120, font: "Georgia", size: 92, color: "#1F2329", lineHeight: 1.25, shadow: false, background: { color: "#F5F2EA" } }
    },
    {
        id: "scripture",
        name: { en: "Scripture", es: "Versículo" },
        spec: {
            position: { left: 200, top: 140, width: 1560, height: 800 },
            font: "Georgia",
            size: 76,
            color: "#FFFFFF",
            align: "left",
            lineHeight: 1.35,
            shadow: false,
            background: { color: "#0E1B2B" },
            decorations: [{ type: "rect", position: { left: 130, top: 180, width: 10, height: 720 }, color: "#F2B84B", radius: 5 }]
        }
    },
    {
        id: "cinema",
        name: { en: "Cinema", es: "Cine" },
        spec: {
            position: "bottom",
            margin: 150,
            font: "Arial",
            size: 62,
            uppercase: true,
            letterSpacing: 6,
            color: "#FFFFFF",
            shadow: { color: "#000000", x: 0, y: 2, blur: 10 },
            maxLines: 2,
            decorations: [
                { type: "rect", position: { left: 0, top: 0, width: 1920, height: 110 }, color: "#000000" },
                { type: "rect", position: { left: 0, top: 970, width: 1920, height: 110 }, color: "#000000" },
                { type: "gradient", position: { left: 0, top: 540, width: 1920, height: 430 }, color: "#000000", angle: 270, opacity: 0.7 }
            ]
        }
    }
]
