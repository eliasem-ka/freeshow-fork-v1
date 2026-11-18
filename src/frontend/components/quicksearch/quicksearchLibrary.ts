// Fork feature: the quick search as a ProPresenter-style global search.
// Songs, Bible verses and media come first; the Bible is searched by reference ("jua 3 16",
// "1co13") and by text ("de tal manera amó"); and a result can be opened, added to the project
// or sent straight to the screen.
// Kept in its own file: QuickSearch.svelte only calls into it.

import { get } from "svelte/store"
import { activeProject, activeShow, customScriptureBooks, drawerTabsData, openScripture, outLocked, projects, quickSearchActive } from "../../stores"
import { newToast } from "../../utils/common"
import { playMedia } from "../actions/apiHelper"
import { loadJsonBible } from "../drawer/bible/scripture"
import { filterBooks } from "../drawer/bible/scripturePicker"
import { openDrawer } from "../edit/scripts/edit"
import { history } from "../helpers/history"
import { startShowSync } from "../helpers/showActions"
import { getBibleResults } from "./quicksearchData"

type Value = { type: string; id: string; name: string; category: string; description?: string; data?: any; [key: string]: any }

/// ORDER ///

// what an operator looks for during a service goes first; settings and help stay reachable below
const LIBRARY_ORDER = ["shows", "bible", "media", "audio"]

export function prioritizeLibrary<T extends { category: string }>(values: T[]): T[] {
    const rank = (value: T) => {
        const index = LIBRARY_ORDER.indexOf(value.category)
        return index < 0 ? LIBRARY_ORDER.length : index
    }
    // stable: results keep their order inside a category, and the other categories keep theirs
    return values
        .map((value, index) => ({ value, index }))
        .sort((a, b) => rank(a.value) - rank(b.value) || a.index - b.index)
        .map((entry) => entry.value)
}

/// BIBLE ///

export type ParsedReference = { book: string; chapter: number; verses: number[] }

/**
 * "juan 3 16", "jua 3:16-18", "1co13", "sal 23" -> the book text, chapter and verses.
 * null when it does not end in a chapter number (then it is a phrase to search for).
 */
export function parseBibleReference(query: string): ParsedReference | null {
    const match = (query || "").trim().match(/^(\d?\s*[^\d\s][^\d]*?)\s*(\d{1,3})(?:\s*[\s:.,]\s*(\d{1,3})(?:\s*-\s*(\d{1,3}))?)?$/)
    if (!match) return null

    const chapter = Number(match[2])
    const first = match[3] ? Number(match[3]) : 0
    const last = match[4] ? Number(match[4]) : first
    if (!chapter || last < first || last - first > 200) return null

    const verses: number[] = []
    for (let verse = first; first && verse <= last; verse++) verses.push(verse)
    return { book: match[1].trim(), chapter, verses }
}

/** The reference a query names in the open Bible, found the way the Scripture picker finds books. */
async function getReferenceResult(query: string, bibleId: string): Promise<Value | null> {
    const parsed = parseBibleReference(query)
    if (!parsed) return null

    const bible = await loadJsonBible(bibleId)
    const customNames = get(customScriptureBooks)[bibleId] || []
    const books = (bible?.data?.books || []).map((book: any, index: number) => ({ number: book.number ?? index + 1, name: customNames[index] || book.name || "", abbreviation: book.abbreviation || "" }))
    const book = filterBooks(books, parsed.book)[0]
    if (!bible || !book) return null

    let text = ""
    try {
        const chapter = await (await bible.getBook(book.number)).getChapter(parsed.chapter)
        text = (chapter.getVerse(parsed.verses[0] || 1)?.getHTML() || "").replace(/<[^>]*>/g, "")
    } catch (err) {
        // no such chapter or verse in this book
        return null
    }

    const verses = parsed.verses
    const range = verses.length > 1 ? `:${verses[0]}-${verses[verses.length - 1]}` : verses.length ? `:${verses[0]}` : ""
    return {
        type: "bible",
        id: bibleId,
        name: `${book.name} ${parsed.chapter}${range}`,
        icon: "scripture",
        category: "bible",
        description: text.slice(0, 140),
        data: { reference: { book: book.number, chapter: parsed.chapter, verses: [verses.length ? verses : [1]] }, play: false }
    }
}

const MAX_BIBLE_RESULTS = 8

/** Bible results for the quick search: the reference the text names, then verses that contain it. */
export async function getLibraryBibleResults(query: string): Promise<Value[]> {
    const bibleId = get(drawerTabsData).scripture?.activeSubTab || ""
    if (!bibleId || query.trim().length < 3) return []

    const results: Value[] = []
    try {
        const reference = await getReferenceResult(query, bibleId)
        if (reference) results.push(reference)
        // a reference is not also a phrase: "juan 3 16" should not search the text for "juan 3 16"
        const found = reference ? [] : await getBibleResults(query)
        found.forEach((result: any) => {
            if (results.some((existing) => existing.name === result.name)) return
            // opening shows the verse; sending it to the screen is the user's choice (Shift+Enter)
            results.push({ ...result, type: "bible", category: "bible", data: { ...result.data, play: false } })
        })
    } catch (err) {
        console.error("Bible search failed:", err)
    }
    return results.slice(0, MAX_BIBLE_RESULTS)
}

/// ACTIONS ///

/** Shift+Enter: straight to the screen. Returns false when this kind of result cannot be presented. */
export function presentQuicksearchValue(value: Value): boolean {
    if (!value || !["show", "bible", "media"].includes(value.type)) return false
    if (get(outLocked)) {
        newToast("output.state_locked")
        return true
    }

    quickSearchActive.set(false)
    if (value.type === "show") {
        activeShow.set({ id: value.id, type: "show" })
        startShowSync(value.id)
    } else if (value.type === "bible") {
        openDrawer("scripture")
        if (value.data?.reference) openScripture.set({ ...value.data.reference, play: true })
    } else {
        playMedia({ path: value.id, data: { type: value.data?.type } } as any)
    }
    return true
}

/** Ctrl+Enter on a media file: into the open project (shows already do this in the quick search itself). */
export function addMediaToProject(value: Value): boolean {
    if (value?.type !== "media") return false
    const projectId = get(activeProject) || ""
    const project = get(projects)[projectId]
    if (!project) {
        newToast("empty.project_select")
        return true
    }

    quickSearchActive.set(false)
    const index = project.shows?.length || 0
    history({ id: "UPDATE", newData: { key: "shows", index, data: { id: value.id, type: value.data?.type, name: value.data?.name || value.name } }, oldData: { id: projectId }, location: { page: "show", id: "project_ref" } })
    return true
}
