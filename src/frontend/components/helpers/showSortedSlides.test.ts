import { describe, expect, it, vi } from "vitest"
import type { Show } from "../../../types/Show"

// only the pure helper is tested: the rest of the module talks to the app
vi.mock("../../stores", () => ({}))
vi.mock("../../utils/language", () => ({}))
vi.mock("./get", () => ({}))
vi.mock("./history", () => ({}))
vi.mock("./output", () => ({}))
vi.mock("./setShow", () => ({}))
vi.mock("./showActions", () => ({}))
vi.mock("./shows", () => ({}))

import { getSortedLayoutSlides } from "./show"

const slide = (group: string | null) => ({ group, color: null, settings: {}, notes: "", items: [{ lines: [{ align: "", text: [{ value: "text", style: "" }] }] }] })
const show = (slides: { [id: string]: any }, layouts: { [id: string]: string[] }) => ({ slides, layouts: Object.fromEntries(Object.entries(layouts).map(([id, ids]) => [id, { name: id, notes: "", slides: ids.map((slideId) => ({ id: slideId })) }])) }) as unknown as Show

describe("slides in layout order", () => {
    it("follows the layout when there is one, with slides outside it last", () => {
        const sorted = getSortedLayoutSlides(show({ a: slide("verse"), b: slide("chorus"), c: slide("verse"), d: slide("bridge") }, { main: ["c", "b", "a"] }))
        expect(sorted).toEqual([
            { id: "c", group: "verse" },
            { id: "b", group: "chorus" },
            { id: "a", group: "verse" },
            { id: "d", group: "bridge" }
        ])
    })

    it("uses the first place of a slide that is repeated in the layout", () => {
        const sorted = getSortedLayoutSlides(show({ verse: slide("verse"), chorus: slide("chorus") }, { main: ["chorus", "verse", "chorus"] }))
        expect(sorted.map((a) => a.id)).toEqual(["chorus", "verse"])
    })

    it("keeps the stored order with several layouts or an empty one", () => {
        const slides = { a: slide("verse"), b: slide("chorus") }
        expect(getSortedLayoutSlides(show(slides, { one: ["b", "a"], two: ["a"] })).map((a) => a.id)).toEqual(["a", "b"])
        expect(getSortedLayoutSlides(show(slides, { one: [] })).map((a) => a.id)).toEqual(["a", "b"])
        expect(getSortedLayoutSlides({} as Show)).toEqual([])
    })

    it("does not copy or change the show", () => {
        const data = show({ a: slide("verse"), b: slide("chorus") }, { main: ["b", "a"] })
        const before = JSON.stringify(data)
        const sorted = getSortedLayoutSlides(data)
        expect(JSON.stringify(data)).toBe(before)
        expect(Object.keys(sorted[0])).toEqual(["id", "group"])
    })

    it("stays fast on a long show", () => {
        const ids = Array.from({ length: 400 }, (_, index) => "s" + index)
        const data = show(Object.fromEntries(ids.map((id, index) => [id, slide(index % 2 ? "verse" : "chorus")])), { main: [...ids].reverse() })
        const start = performance.now()
        for (let i = 0; i < 400; i++) getSortedLayoutSlides(data)
        // one call per slide of the grid, on every slide change: before the fix this took seconds
        expect(performance.now() - start).toBeLessThan(400)
    })
})
