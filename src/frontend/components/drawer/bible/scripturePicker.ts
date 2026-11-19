// Fork feature: matching rules of the Holyrics-style Bible picker (ScripturePicker.svelte).
// Pure functions, so they can be unit tested.

export type PickerBook = { id: string; name: string; abbreviation: string; color: string }

/** Lower case, no accents, no spaces or dots: "1 Corintios" and "1co" compare as "1corintios" / "1co". */
export function normalizeBookText(value: string) {
    return (value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\s.]/g, "")
}

/**
 * Books that fit what was typed, by the first rule that finds any:
 * 1. the name starts with it ("1 Juan" starts with its number, so "jua" leaves only Juan)
 * 2. the abbreviation starts with it
 * 3. the name without its number starts with it ("ju" reaches "1 Juan" when no other book does)
 * 4. its letters appear in the name in that order, from the first one ("jn" for John / Juan, "1co")
 * A title before the name ("San Juan") is optional in all of them.
 */
export function filterBooks<T extends { name: string; abbreviation?: string }>(books: T[], typed: string): T[] {
    const query = normalizeBookText(typed)
    if (!query) return books

    const rules: ((name: string, abbreviation: string) => boolean)[] = [(name) => name.startsWith(query), (_name, abbreviation) => abbreviation.startsWith(query), (name) => name.replace(/^\d+/, "").startsWith(query), (name) => name[0] === query[0] && isSubsequence(query, name)]

    for (const rule of rules) {
        // a book fits by its name as written or without its title ("San Juan" is found as "juan" and as "san juan")
        const matches = books.filter((book) => bookNames(book.name).some((name) => rule(name, normalizeBookText(book.abbreviation || ""))))
        if (matches.length) return matches
    }
    return []
}

/** Spanish Bibles title the Gospels ("San Mateo", "S. Juan", "Santo Evangelio según..."): people type the name, not the title. */
const BOOK_TITLE = /^(san|santo|santa|s\.)\s+/i

function bookNames(name: string) {
    const full = normalizeBookText(name)
    const plain = normalizeBookText((name || "").trim().replace(BOOK_TITLE, ""))
    return plain && plain !== full ? [plain, full] : [full]
}

/** True while what was typed is still the start of the book's name, with or without its title or number ("juan" for "San Juan", "cor" for "1 Corintios"). */
export function isStartOfBookName(name: string, typed: string) {
    const query = normalizeBookText(typed)
    return bookNames(name).some((bookName) => bookName.startsWith(query) || bookName.replace(/^\d+/, "").startsWith(query))
}

/**
 * True when the text could still be the start of a book's name as it is written ("san j", "1 cor"):
 * by name only, not by abbreviation or loose letters. Used to tell a phrase ("de tal manera")
 * from a book that is being typed out.
 */
export function isBookPrefix(books: { name: string }[], text: string) {
    return books.some((book) => isStartOfBookName(book.name, text))
}

function isSubsequence(query: string, text: string) {
    let index = 0
    for (const char of text) {
        if (char === query[index]) index++
        if (index === query.length) return true
    }
    return false
}

/**
 * Numbers that what was typed can still become: "1" keeps 1 and 10-19 (and 100+).
 * A single result means there is nothing left to wait for.
 */
export function filterNumbers(numbers: number[], typed: string): number[] {
    if (!typed) return numbers
    if (!/^\d+$/.test(typed) || /^0/.test(typed)) return []
    return numbers.filter((number) => number.toString().startsWith(typed))
}

/** Verse numbers of a chapter, once each (long verses are split into several parts). */
export function getVerseNumbers(verses: { number?: number | string }[]): number[] {
    const numbers: number[] = []
    verses.forEach((verse) => {
        const number = Number(verse.number)
        if (!isNaN(number) && !numbers.includes(number)) numbers.push(number)
    })
    return numbers
}

/**
 * A key that starts or continues a reference or a phrase: a letter (accents included), a digit or "/".
 * The picker takes these back when nothing has the keyboard, so typing after Escape is not lost.
 */
export function isPickerKey(key: string) {
    return /^[\p{L}\d/]$/u.test(key)
}
