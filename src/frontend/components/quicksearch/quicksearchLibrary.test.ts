import { describe, expect, it, vi } from "vitest"

// only the pure helpers are tested: the rest of the module talks to the app
vi.mock("../../stores", () => ({}))
vi.mock("../../utils/common", () => ({}))
vi.mock("../actions/apiHelper", () => ({}))
vi.mock("../drawer/bible/scripture", () => ({}))
vi.mock("../edit/scripts/edit", () => ({}))
vi.mock("../helpers/history", () => ({}))
vi.mock("../helpers/showActions", () => ({}))
vi.mock("./quicksearchData", () => ({}))

import { parseBibleReference, prioritizeLibrary } from "./quicksearchLibrary"

describe("parseBibleReference", () => {
    it("reads book, chapter and verse however they are separated", () => {
        expect(parseBibleReference("juan 3 16")).toEqual({ book: "juan", chapter: 3, verses: [16] })
        expect(parseBibleReference("Juan 3:16")).toEqual({ book: "Juan", chapter: 3, verses: [16] })
        expect(parseBibleReference("jua 3.16")).toEqual({ book: "jua", chapter: 3, verses: [16] })
        expect(parseBibleReference("sal 23")).toEqual({ book: "sal", chapter: 23, verses: [] })
    })
    it("reads ranges", () => {
        expect(parseBibleReference("jua 3:16-18")).toEqual({ book: "jua", chapter: 3, verses: [16, 17, 18] })
        expect(parseBibleReference("jua 3:18-16")).toBeNull()
    })
    it("keeps the number of numbered books in the book", () => {
        expect(parseBibleReference("1 co 13")).toEqual({ book: "1 co", chapter: 13, verses: [] })
        expect(parseBibleReference("1co13")).toEqual({ book: "1co", chapter: 13, verses: [] })
        expect(parseBibleReference("2 timoteo 3:16")).toEqual({ book: "2 timoteo", chapter: 3, verses: [16] })
        expect(parseBibleReference("san juan 1 1")).toEqual({ book: "san juan", chapter: 1, verses: [1] })
    })
    it("leaves phrases for the text search", () => {
        expect(parseBibleReference("de tal manera amó")).toBeNull()
        expect(parseBibleReference("juan")).toBeNull()
        expect(parseBibleReference("316")).toBeNull()
        expect(parseBibleReference("")).toBeNull()
    })
})

describe("prioritizeLibrary", () => {
    it("puts songs, Bible and media first and keeps the order inside each group", () => {
        const values = ["settings", "shows", "navigation", "media", "shows", "bible", "faq"].map((category, index) => ({ category, index }))
        expect(prioritizeLibrary(values).map((value) => `${value.category}${value.index}`)).toEqual(["shows1", "shows4", "bible5", "media3", "settings0", "navigation2", "faq6"])
    })
})
