import { describe, expect, it } from "vitest"
import { filterBooks, filterNumbers, getVerseNumbers, isBookPrefix, isPickerKey, isStartOfBookName, normalizeBookText } from "./scripturePicker"

const names = ["Génesis", "Éxodo", "Josué", "Jueces", "1 Samuel", "2 Samuel", "Job", "Jeremías", "Joel", "Jonás", "Mateo", "Marcos", "Lucas", "Juan", "Hechos", "Romanos", "1 Corintios", "2 Corintios", "Santiago", "1 Juan", "2 Juan", "3 Juan", "Judas", "Apocalipsis"]
const books = names.map((name) => ({ name, abbreviation: "" }))
const pick = (typed: string) => filterBooks(books, typed).map((a) => a.name)

describe("normalizeBookText", () => {
    it("drops accents, spaces, dots and case", () => {
        expect(normalizeBookText("1 Corintios")).toBe("1corintios")
        expect(normalizeBookText("Génesis")).toBe("genesis")
        expect(normalizeBookText("1 Co.")).toBe("1co")
    })
})

describe("filterBooks", () => {
    it("returns every book when nothing is typed", () => {
        expect(pick("")).toHaveLength(books.length)
    })
    it("narrows by the start of the name, accents ignored", () => {
        expect(pick("j")).toEqual(["Josué", "Jueces", "Job", "Jeremías", "Joel", "Jonás", "Juan", "Judas"])
        expect(pick("ju")).toEqual(["Jueces", "Juan", "Judas"])
        expect(pick("ge")).toEqual(["Génesis"])
    })
    it("leaves a single book as soon as the text is unique", () => {
        expect(pick("jua")).toEqual(["Juan"])
        expect(pick("ap")).toEqual(["Apocalipsis"])
    })
    it("keeps numbered books apart by their number", () => {
        expect(pick("1")).toEqual(["1 Samuel", "1 Corintios", "1 Juan"])
        expect(pick("1j")).toEqual(["1 Juan"])
        expect(pick("1 j")).toEqual(["1 Juan"])
        expect(pick("2c")).toEqual(["2 Corintios"])
    })
    it("reaches numbered books without the number when no other book fits", () => {
        expect(pick("sam")).toEqual(["1 Samuel", "2 Samuel"])
        expect(pick("cor")).toEqual(["1 Corintios", "2 Corintios"])
    })
    it("uses the abbreviation when no name starts like that", () => {
        const withAbbreviation = [
            { name: "Juan", abbreviation: "Jn" },
            { name: "Jonás", abbreviation: "Jon" },
            { name: "Judas", abbreviation: "Jud" }
        ]
        expect(filterBooks(withAbbreviation, "jn").map((a) => a.name)).toEqual(["Juan"])
    })
    it("falls back to letters in order from the first one", () => {
        expect(pick("mt")).toEqual(["Mateo"])
        expect(pick("mr")).toEqual(["Marcos"])
        expect(pick("1co")).toEqual(["1 Corintios"])
        expect(pick("hch")).toEqual(["Hechos"])
    })
    it("returns nothing when no book fits", () => {
        expect(pick("x")).toEqual([])
        expect(pick("j3")).toEqual([])
    })
})

// book names as the Reina Valera 1909 has them: the Gospels carry "San"
describe("filterBooks with titled Gospels", () => {
    const rv = ["Josué", "Jueces", "Salmos", "San Mateo", "San Marcos", "San Lucas", "San Juan", "Santiago", "1 Juan", "2 Juan", "3 Juan", "Judas"].map((name) => ({ name, abbreviation: "" }))
    const pickRv = (typed: string) => filterBooks(rv, typed).map((a) => a.name)

    it("finds a Gospel by its name alone", () => {
        expect(pickRv("jua")).toEqual(["San Juan"])
        expect(pickRv("mat")).toEqual(["San Mateo"])
        expect(pickRv("ju")).toEqual(["Jueces", "San Juan", "Judas"])
    })
    it("still finds it with the title", () => {
        expect(pickRv("sanj")).toEqual(["San Juan"])
        expect(pickRv("san")).toEqual(["San Mateo", "San Marcos", "San Lucas", "San Juan", "Santiago"])
    })
    it("does not take the start of a name for a title", () => {
        expect(pickRv("sant")).toEqual(["Santiago"])
        expect(pickRv("tiago")).toEqual([])
    })
    it("accepts the rest of the name after the book was picked", () => {
        expect(isStartOfBookName("San Juan", "juan")).toBe(true)
        expect(isStartOfBookName("San Juan", "sanjua")).toBe(true)
        expect(isStartOfBookName("1 Corintios", "corin")).toBe(true)
        expect(isStartOfBookName("San Juan", "juanm")).toBe(false)
    })
    it("tells a phrase from a book that is being typed out", () => {
        const all = [...rv, { name: "Deuteronomio", abbreviation: "" }, { name: "Amós", abbreviation: "" }]
        expect(isBookPrefix(all, "san j")).toBe(true)
        expect(isBookPrefix(all, "deut")).toBe(true)
        expect(isBookPrefix(all, "1 ju")).toBe(true)
        // "det" has the letters of Deuteronomio in order, but nobody writes it like that
        expect(isBookPrefix(all, "de t")).toBe(false)
        expect(isBookPrefix(all, "amor")).toBe(false)
        expect(isBookPrefix(all, "santo")).toBe(false)
    })
    it("keeps the letters of John apart from the Gospel", () => {
        expect(pickRv("1j")).toEqual(["1 Juan"])
    })
})

describe("filterNumbers", () => {
    const chapters = Array.from({ length: 21 }, (_, i) => i + 1) // Juan

    it("keeps the numbers the text can still become", () => {
        expect(filterNumbers(chapters, "1")).toEqual([1, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
        expect(filterNumbers(chapters, "2")).toEqual([2, 20, 21])
    })
    it("is unique once no longer number is possible", () => {
        expect(filterNumbers(chapters, "3")).toEqual([3])
        expect(filterNumbers(chapters, "16")).toEqual([16])
    })
    it("rejects numbers out of range, zero and letters", () => {
        expect(filterNumbers(chapters, "22")).toEqual([])
        expect(filterNumbers(chapters, "0")).toEqual([])
        expect(filterNumbers(chapters, "a")).toEqual([])
    })
    it("handles chapters over 100", () => {
        const psalms = Array.from({ length: 150 }, (_, i) => i + 1)
        expect(filterNumbers(psalms, "15")).toEqual([15, 150])
        expect(filterNumbers(psalms, "2")).toHaveLength(11)
    })
})

describe("getVerseNumbers", () => {
    it("lists each verse once when long verses are split in parts", () => {
        expect(getVerseNumbers([{ number: 1 }, { number: 2 }, { number: 2 }, { number: "3" }])).toEqual([1, 2, 3])
    })
})

describe("keys the picker takes back", () => {
    it("takes letters, digits and the text search key", () => {
        ;["j", "J", "ñ", "é", "1", "0", "/"].forEach((key) => expect(isPickerKey(key)).toBe(true))
    })

    it("leaves the keys that drive the service to the app", () => {
        ;[" ", "Enter", "Escape", "ArrowRight", "ArrowLeft", "PageDown", "F1", ".", "-", "Backspace", "Tab", ""].forEach((key) => expect(isPickerKey(key)).toBe(false))
    })
})
