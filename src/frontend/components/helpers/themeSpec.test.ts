import { describe, expect, it } from "vitest"
import type { Item, Template } from "../../../types/Show"
import { colorToHex, fillSampleText, getCssValue, getPalette, getPositionBox, getTemplateFiles, itemsToSpec, keepOpacity, normalizeColor, parseCss, patchItemsWithSpec, patchSettingsWithSpec, replacePaletteValue, setCssValues, specToItems, withOpacity, type ThemeSpec } from "./themeSpec"

const textStyle = (items: Item[]) => items.find((item) => item.lines)?.lines?.[0]?.text?.[0]?.style || ""

describe("css helpers", () => {
    it("keeps semicolons that are inside parentheses", () => {
        expect(parseCss("color: red;background: url(data:image/png;base64,AAA);top:1px")).toEqual([
            ["color", "red"],
            ["background", "url(data:image/png;base64,AAA)"],
            ["top", "1px"]
        ])
    })

    it("sets a key where it already is and removes empty ones", () => {
        expect(setCssValues("top:1px;color: red;left:2px;", { color: "blue", left: null, width: "5px" })).toBe("top: 1px;color: blue;width: 5px;")
    })

    it("removes every copy of a repeated key", () => {
        expect(setCssValues("color: red;top:1px;color: blue;", { color: "" })).toBe("top: 1px;")
    })
})

describe("colours", () => {
    it("compares the same colour written in different ways", () => {
        const white = normalizeColor("#FFF")
        expect(normalizeColor("#ffffff")).toBe(white)
        expect(normalizeColor("rgb(255, 255, 255)")).toBe(white)
        expect(normalizeColor("rgb(255 255 255 / 1)")).toBe(white)
        expect(normalizeColor("rgb(255 255 255 / 50%)")).not.toBe(white)
    })

    it("gives the hex of a colour and keeps an opacity through a colour picker", () => {
        expect(colorToHex("rgb(16 24 32 / 0.7)")).toBe("#101820")
        expect(colorToHex("#FFF")).toBe("#ffffff")
        expect(colorToHex("linear-gradient(red, blue)")).toBe("")
        expect(keepOpacity("rgb(16 24 32 / 0.7)", "#ff0000")).toBe("rgb(255 0 0 / 0.7)")
        expect(keepOpacity("#000000", "#ff0000")).toBe("#ff0000")
    })

    it("adds an opacity to a hex colour", () => {
        expect(withOpacity("#000000", 0.5)).toBe("rgb(0 0 0 / 0.5)")
        expect(withOpacity("#000000", 1)).toBe("#000000")
    })
})

describe("positions", () => {
    it("keeps named boxes inside the canvas", () => {
        const names = ["full", "center", "upper_third", "lower_third", "top", "bottom", "left", "right"] as const
        names.forEach((name) => {
            const box = getPositionBox(name, 60)
            expect(box.left).toBeGreaterThanOrEqual(0)
            expect(box.top).toBeGreaterThanOrEqual(0)
            expect(box.left + box.width).toBeLessThanOrEqual(1920)
            expect(box.top + box.height).toBeLessThanOrEqual(1080)
        })
    })

    it("uses the default margin for a new theme", () => {
        const spec = itemsToSpec(specToItems({ position: "lower_third" }))
        expect(spec.position).toBe("lower_third")
        expect(spec.margin).toBe(60)
    })

    it("puts the lower third at the bottom", () => {
        const box = getPositionBox("lower_third", 60)
        expect(box.top + box.height).toBe(1020)
        expect(box.top).toBeGreaterThan(540)
    })
})

describe("spec to items and back", () => {
    const spec: ThemeSpec = {
        position: "lower_third",
        margin: 80,
        font: "Georgia",
        size: 72,
        weight: "bold",
        italic: true,
        uppercase: true,
        color: "#FFEEDD",
        align: "left",
        verticalAlign: "bottom",
        lineHeight: 1.2,
        letterSpacing: 3,
        shadow: { color: "rgb(0 0 0 / 80%)", x: 0, y: 4, blur: 12 },
        outline: { color: "#112233", width: 3 },
        box: { color: "#000000", opacity: 0.5, radius: 20, padding: 30 },
        fit: "none",
        background: { color: "#101820" },
        maxLines: 2
    }

    it("round trips every key", () => {
        const items = specToItems(spec)
        const settings = patchSettingsWithSpec(undefined, spec)
        const back = itemsToSpec(items, settings)
        expect(back).toEqual({ ...spec, box: { color: "rgb(0 0 0 / 0.5)", radius: 20, padding: 30 } })
    })

    it("writes the styles FreeShow's editor reads", () => {
        const items = specToItems(spec)
        const style = textStyle(items)
        expect(getCssValue(style, "font-family")).toBe("Georgia")
        expect(getCssValue(style, "font-size")).toBe("72px")
        expect(getCssValue(style, "text-shadow")).toBe("0px 4px 12px rgb(0 0 0 / 80%)")
        expect(getCssValue(style, "-webkit-text-stroke-width")).toBe("3px")
        expect(items[0].align).toBe("align-items:flex-end;")
        expect(items[0].lines?.[0].align).toBe("text-align: left;")
        expect(items[0].textFit).toBe("none")
    })

    it("turns the shadow off for real (FreeShow adds a default one when there is none)", () => {
        const items = specToItems({ shadow: false })
        expect(getCssValue(textStyle(items), "text-shadow")).toBe("0px 0px 0px rgb(0 0 0 / 0)")
        expect(itemsToSpec(items).shadow).toBe(false)
    })

    it("draws decorations behind the text and reads them back", () => {
        const decorations: ThemeSpec["decorations"] = [
            { type: "gradient", color: "#000000", angle: 90, opacity: 0.8 },
            { type: "rect", position: { left: 100, top: 900, width: 300, height: 8 }, color: "#FFAA00", radius: 4 }
        ]
        const items = specToItems({ decorations })
        expect(items.map((item) => item.type)).toEqual(["icon", "icon", "text"])
        expect(items[0].customSvg).toContain("linearGradient")
        expect(itemsToSpec(items).decorations).toEqual(decorations)
    })
})

describe("patching an existing theme", () => {
    const handMade: Item[] = [
        { type: "media", src: "/logo.png", style: "top:10px;left:10px;width:100px;height:100px;" },
        { style: "top:88px;left:50px;height:904px;width:1820px;", align: "", lines: [{ align: "", text: [{ value: "Example", style: "font-size: 100px;color: #FFFFFF;" }] }] },
        { style: "top:900px;left:50px;height:100px;width:1820px;", align: "", lines: [{ align: "", text: [{ value: "Second", style: "font-size: 40px;" }] }] }
    ]

    it("changes only the keys given, on the main text box", () => {
        const items = patchItemsWithSpec(handMade, { color: "#FF0000", size: 80 })
        expect(items).toHaveLength(3)
        expect(items[0]).toEqual(handMade[0])
        expect(items[2]).toEqual(handMade[2])
        expect(textStyle(items)).toBe("font-size: 80px;color: #FF0000;")
        expect(items[1].style).toBe(handMade[1].style)
        expect(items[1].lines?.[0].text[0].value).toBe("Example")
    })

    it("does not change the input", () => {
        const before = JSON.stringify(handMade)
        patchItemsWithSpec(handMade, { position: "bottom", decorations: [{ type: "rect", color: "#000" }] })
        expect(JSON.stringify(handMade)).toBe(before)
    })

    it("replaces spec decorations and keeps hand drawn shapes", () => {
        const withDecoration = patchItemsWithSpec(handMade, { decorations: [{ type: "rect", color: "#000" }] })
        expect(withDecoration).toHaveLength(4)
        const replaced = patchItemsWithSpec(withDecoration, { decorations: [] })
        expect(replaced).toHaveLength(3)
        expect(replaced[0].type).toBe("media")
    })

    it("moves the text box and keeps its other styles", () => {
        const boxed = patchItemsWithSpec(handMade, { box: { color: "#000000" } })
        const moved = patchItemsWithSpec(boxed, { position: "top", margin: 40 })
        expect(getCssValue(moved[1].style, "background-color")).toBe("#000000")
        expect(getCssValue(moved[1].style, "top")).toBe("40px")
        expect(getCssValue(moved[1].style, "height")).toBe("200px")
    })
})

describe("sample text", () => {
    it("writes one line per line, in the theme's style", () => {
        const items = fillSampleText(specToItems({ color: "#00FF00", align: "right" }), "Uno\nDos\n\nTres")
        const lines = items[0].lines || []
        expect(lines.map((line) => line.text[0].value)).toEqual(["Uno", "Dos", "Tres"])
        expect(lines.every((line) => line.align === "text-align: right;" && line.text[0].style.includes("#00FF00"))).toBe(true)
    })
})

describe("palette", () => {
    const template = (items: Item[], backgroundColor?: string): Template => ({ name: "", color: null, category: null, items, settings: backgroundColor ? { backgroundColor } : undefined })
    const a = template(specToItems({ color: "#FFFFFF", font: "Arial", decorations: [{ type: "rect", color: "#FFAA00" }] }), "#101820")
    const b = template(specToItems({ color: "#ffffff", font: "arial", outline: { color: "#FFAA00", width: 2 } }))

    it("counts each colour and font once per use, however it is written", () => {
        const palette = getPalette([a, b])
        expect(palette.fonts).toEqual([{ value: "Arial", count: 2 }])
        const white = palette.colors.find((color) => normalizeColor(color.value) === normalizeColor("#fff"))
        const accent = palette.colors.find((color) => normalizeColor(color.value) === normalizeColor("#ffaa00"))
        expect(white?.count).toBe(2)
        expect(accent?.count).toBe(2)
        expect(palette.colors.some((color) => color.value === "#101820")).toBe(true)
    })

    it("replaces a colour in text, shapes and background", () => {
        const text = replacePaletteValue(b, "color", "#fff", "#FFF8E7")
        expect(getCssValue(textStyle(text?.items || []), "color")).toBe("#FFF8E7")
        const shape = replacePaletteValue(a, "color", "#ffaa00", "#00AAFF")
        expect(shape?.items[0].customSvg).toContain('fill="#00AAFF"')
        expect(replacePaletteValue(a, "color", "#101820", "#000000")?.settings?.backgroundColor).toBe("#000000")
    })

    it("replaces a font and reports when nothing uses the value", () => {
        expect(getCssValue(textStyle(replacePaletteValue(a, "font", "ARIAL", "Georgia")?.items || []), "font-family")).toBe("Georgia")
        expect(replacePaletteValue(a, "color", "#123456", "#000000")).toBeNull()
    })

    it("lists the media files a theme needs", () => {
        const withMedia = template([{ type: "media", src: "/media/logo.png", style: "" }, ...specToItems({})])
        withMedia.settings = { backgroundPath: "/media/loop.mp4" }
        expect(getTemplateFiles(withMedia)).toEqual(["/media/logo.png", "/media/loop.mp4"])
    })
})
