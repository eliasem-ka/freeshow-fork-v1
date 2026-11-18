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
 */
export function filterBooks<T extends { name: string; abbreviation?: string }>(books: T[], typed: string): T[] {
    const query = normalizeBookText(typed)
    if (!query) return books

    const rules: ((name: string, abbreviation: string) => boolean)[] = [(name) => name.startsWith(query), (_name, abbreviation) => abbreviation.startsWith(query), (name) => name.replace(/^\d+/, "").startsWith(query), (name) => name[0] === query[0] && isSubsequence(query, name)]

    for (const rule of rules) {
        const matches = books.filter((book) => rule(normalizeBookText(book.name), normalizeBookText(book.abbreviation || "")))
        if (matches.length) return matches
    }
    return []
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
