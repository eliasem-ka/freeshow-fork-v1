<script lang="ts">
    // Fork feature: Holyrics-style Bible picker.
    // Large book / chapter / verse tiles, plus a type-to-find box: what is typed narrows the tiles,
    // and as soon as a single option is left it is picked and the box moves on to the next part.
    import { createEventDispatcher, onMount, tick } from "svelte"
    import { dictionary } from "../../../stores"
    import { translateText } from "../../../utils/language"
    import { brightenDarkColor, fadeColor } from "../../helpers/color"
    import Icon from "../../helpers/Icon.svelte"
    import T from "../../helpers/T.svelte"
    import Loader from "../../main/Loader.svelte"
    import { filterBooks, filterNumbers, getVerseNumbers, normalizeBookText, type PickerBook } from "./scripturePicker"

    export let books: { number: number | string; name: string }[] | null
    export let booksData: { abbreviation?: string; category?: { color?: string } | null }[] = []
    export let customNames: string[] | undefined = undefined
    export let chapters: { number: number | string }[] | null
    export let verses: { id: string; number?: number | string; text?: string }[] = []

    export let activeBook: number | string | null
    export let activeChapters: (number | string)[] = []
    export let activeVerses: (number | string)[] = []
    export let reference = ""
    export let previewText = ""

    const dispatch = createEventDispatcher<{
        book: string
        chapter: string
        verses: number[]
        verseclick: { event: MouseEvent; id: string; isClick: boolean }
        play: null
    }>()

    // every book / chapter pick is one navigation for the parent, which counts the finished ones here.
    // Keys typed while one is still loading wait, so "jn316" works however fast it is typed.
    export let settled = 0

    type Step = "book" | "chapter" | "verse"
    let step: Step = activeBook ? (activeChapters.length ? "verse" : "chapter") : "book"
    let typed = ""
    // first verse of a range being typed ("16-" waits for the last verse)
    let rangeStart: number | null = null
    let rejected = false
    let inputElem: HTMLInputElement | undefined

    let requested = settled
    let pending: string[] = []
    let lastPick: "book" | "chapter" | null = null
    // the verse just picked here: the active verses only follow on the next update
    let lastVerse: number | null = null
    $: waiting = requested > settled

    $: bookList = (books || []).map(
        (book, i): PickerBook => ({
            id: book.number?.toString(),
            name: customNames?.[i] || book.name,
            abbreviation: booksData[i]?.abbreviation || "",
            color: booksData[i]?.category?.color || ""
        })
    )
    $: chapterNumbers = (chapters || []).map((a) => Number(a.number)).filter((a) => !isNaN(a))
    $: verseNumbers = getVerseNumbers(verses)

    $: shownBooks = step === "book" && typed ? filterBooks(bookList, typed) : bookList
    $: shownChapters = step === "chapter" && typed ? filterNumbers(chapterNumbers, typed) : chapterNumbers
    $: shownVerseNumbers = step === "verse" && typed ? filterNumbers(verseNumbers, typed) : verseNumbers
    $: shownVerses = verses.filter((a) => shownVerseNumbers.includes(Number(a.number)))

    $: activeBookName = bookList.find((a) => a.id === activeBook?.toString())?.name || ""
    $: activeChapter = activeChapters[activeChapters.length - 1]?.toString() || ""
    $: activeVerseLabel = getVerseLabel(activeVerses)
    function getVerseLabel(ids: (number | string)[]) {
        const numbers = [...new Set(ids.map((a) => Number(a.toString().split("_")[0].split("-")[0])).filter((a) => !isNaN(a)))].sort((a, b) => a - b)
        if (!numbers.length) return ""
        const last = numbers[numbers.length - 1]
        return numbers.length > 1 && last - numbers[0] === numbers.length - 1 ? `${numbers[0]}-${last}` : numbers.join(",")
    }

    // a navigation finished (the lists are the new ones): go on with the keys that were waiting
    // (run after this update: values changed inside a reactive statement would not reach the tiles)
    $: if (settled >= requested && chapterNumbers && verseNumbers) tick().then(flush)
    function flush() {
        // a book with a single chapter has nothing to choose there
        if (lastPick === "book" && step === "chapter" && chapterNumbers.length === 1) {
            pickChapter(chapterNumbers[0])
            return
        }

        while (pending.length && requested <= settled) {
            const key = pending[0]
            pending = pending.slice(1)
            handleKey(key)
        }
    }

    // a book is picked as soon as its first letters are unique ("ro" for Romanos), but people go on
    // typing the name: those letters are taken as part of it, and not as a new search
    let pickedBook: { name: string; typed: string; tail: string } | null = null

    function reject() {
        rejected = true
        pending = []
        setTimeout(() => (rejected = false), 250)
    }

    function setStep(newStep: Step) {
        step = newStep
        typed = ""
        rangeStart = null
        lastPick = null
        lastVerse = null
        pickedBook = null
    }

    function pickBook(id: string) {
        setStep("chapter")
        lastPick = "book"
        requested++
        dispatch("book", id)
    }

    function pickChapter(number: number) {
        setStep("verse")
        lastPick = "chapter"
        requested++
        dispatch("chapter", number.toString())
    }

    function pickVerse(number: number) {
        typed = ""
        lastVerse = number
        if (rangeStart !== null && number >= rangeStart) {
            const start = rangeStart
            rangeStart = null
            dispatch(
                "verses",
                verseNumbers.filter((a) => a >= start && a <= number)
            )
            return
        }
        rangeStart = null
        dispatch("verses", [number])
    }

    function type(char: string) {
        const isDigit = /\d/.test(char)

        if (!isDigit && step === "chapter" && pickedBook) {
            const tail = pickedBook.tail + char
            if (normalizeBookText(pickedBook.name).startsWith(normalizeBookText(pickedBook.typed + tail))) {
                pickedBook.tail = tail
                return
            }
            // not that book's name after all: it is a new search, with every letter typed since
            setStep("book")
            for (const letter of tail) type(letter)
            return
        }
        if (isDigit) pickedBook = null

        // letters always start a new book search, wherever the box is
        if (!isDigit && step !== "book") setStep("book")

        const next = typed + char
        if (step === "book") {
            const matches = filterBooks(bookList, next)
            if (!matches.length) return reject()
            if (matches.length === 1) {
                pickBook(matches[0].id)
                pickedBook = { name: matches[0].name, typed: next, tail: "" }
                return
            }
            typed = next
            return
        }

        const numbers = step === "chapter" ? chapterNumbers : verseNumbers
        const matches = filterNumbers(numbers, next)
        if (!matches.length) return reject()
        if (matches.length === 1) return step === "chapter" ? pickChapter(matches[0]) : pickVerse(matches[0])
        typed = next
    }

    /** Take what is typed as it is: the first book left, or the exact number. */
    function confirm(): boolean {
        if (!typed) return false
        if (step === "book") {
            const match = filterBooks(bookList, typed)[0]
            if (!match) return false
            pickBook(match.id)
            return true
        }

        const numbers = step === "chapter" ? chapterNumbers : verseNumbers
        const value = Number(typed)
        if (!numbers.includes(value)) return false
        if (step === "chapter") pickChapter(value)
        else pickVerse(value)
        return true
    }

    function back() {
        if (typed) {
            typed = typed.slice(0, -1)
            return
        }
        if (rangeStart !== null) {
            rangeStart = null
            return
        }
        if (step === "verse") setStep(chapterNumbers.length === 1 ? "book" : "chapter")
        else if (step === "chapter") setStep("book")
    }

    function handleKey(key: string) {
        if (key === "Enter") {
            // nothing left to confirm: send the picked verse to the output
            if (!confirm() && step === "verse" && activeVerses.length) dispatch("play", null)
            return
        }
        if (key === "Backspace") return back()
        if (key === " " || key === ":" || key === "." || key === ",") {
            // inside a book name a space is part of the name ("1 Juan")
            if (step === "book" && key === " ") return
            if (typed && !confirm()) reject()
            return
        }
        if (key === "-") {
            if (step !== "verse") return reject()
            // "16-" : range from the typed verse, or from the one already picked
            const start = typed ? Number(typed) : (lastVerse ?? Number(String(activeVerses[0] ?? "").split("_")[0]))
            if (!verseNumbers.includes(start)) return reject()
            if (typed) dispatch("verses", [start])
            typed = ""
            lastVerse = start
            rangeStart = start
            return
        }
        type(key)
    }

    function keydown(e: KeyboardEvent) {
        if (e.ctrlKey || e.metaKey || e.altKey) return

        if (e.key === "Escape") {
            if (!typed && step === "book" && !pending.length) return // let Escape do its usual job
            e.preventDefault()
            e.stopPropagation()
            pending = []
            requested = settled
            setStep("book")
            return
        }

        if (e.key.length !== 1 && e.key !== "Enter" && e.key !== "Backspace") return
        e.preventDefault()
        e.stopPropagation()

        if (waiting) pending = [...pending, e.key]
        else handleKey(e.key)
    }

    export function focus() {
        inputElem?.focus({ preventScroll: true })
    }
    onMount(() => setTimeout(focus, 50))

    function areaClick(e: MouseEvent) {
        if ((e.target as HTMLElement)?.closest("input")) return
        // keep typing after any click on a tile
        tick().then(focus)
    }

    function isVerseActive(id: string, _updater: any) {
        const base = id.split("_")[0].split("-")[0]
        return activeVerses.some((a) => a.toString() === id || a.toString() === base)
    }

    // keep the picked tile in view
    let booksElem: HTMLElement | undefined
    let chaptersElem: HTMLElement | undefined
    let versesElem: HTMLElement | undefined
    $: if (activeBook) scrollToActive(booksElem)
    $: if (activeChapter) scrollToActive(chaptersElem)
    $: if (activeVerses.length) scrollToActive(versesElem)
    function scrollToActive(elem: HTMLElement | undefined) {
        tick().then(() => {
            const active = elem?.querySelector(".isActive") as HTMLElement | null
            if (!elem || !active) return
            const box = elem.getBoundingClientRect()
            const tile = active.getBoundingClientRect()
            if (tile.top >= box.top && tile.bottom <= box.bottom) return
            elem.scrollTo(0, Math.max(0, elem.scrollTop + tile.top - box.top - 50))
        })
    }

    $: hint = step === "book" ? "scripture.picker_type_book" : step === "chapter" ? "scripture.picker_type_chapter" : rangeStart !== null ? "scripture.picker_type_range" : "scripture.picker_type_verse"
</script>

<div class="picker" role="none" on:click={areaClick}>
    <div class="bar" class:rejected class:waiting>
        <Icon id="search" size={1.3} white />

        <button class="crumb" class:current={step === "book"} class:placeholder={step === "book" ? !typed : !activeBookName} on:click={() => setStep("book")}>
            {(step === "book" && typed) || activeBookName || translateText("scripture.picker_book", $dictionary)}
        </button>
        <button class="crumb number" class:current={step === "chapter"} class:placeholder={step === "chapter" ? !typed : !activeChapter} disabled={!activeBook} on:click={() => setStep("chapter")}>
            {(step === "chapter" && typed) || (step !== "book" || !typed ? activeChapter : "") || "—"}
        </button>
        <span class="divider">:</span>
        <button class="crumb number" class:current={step === "verse"} class:placeholder={step === "verse" ? !typed && rangeStart === null : !activeVerseLabel} disabled={!activeBook || !activeChapter} on:click={() => setStep("verse")}>
            {#if step === "verse" && rangeStart !== null}{rangeStart}-{typed || "…"}{:else}{(step === "verse" && typed) || (step === "verse" || !typed ? activeVerseLabel : "") || "—"}{/if}
        </button>

        <!-- the real text field: invisible, it only receives the keys -->
        <input bind:this={inputElem} class="edit pickerInput" type="text" value="" aria-label={translateText("scripture.picker_type_book", $dictionary)} on:keydown={keydown} on:input={(e) => (e.currentTarget.value = "")} />

        <span class="hint"><T id={hint} /></span>
    </div>

    <div class="columns">
        <div class="column books" class:current={step === "book"} bind:this={booksElem}>
            {#if bookList.length}
                <div class="tiles bookTiles">
                    {#each shownBooks as book (book.id)}
                        {@const isActive = activeBook?.toString() === book.id}
                        <button class="tile book" class:isActive title={book.name} style="--tile-color: {book.color || 'var(--secondary)'};background-color: {book.color ? fadeColor(book.color, isActive ? 0.45 : 0.16) : ''};color: {book.color ? brightenDarkColor(book.color) : ''};" on:click={() => pickBook(book.id)}>
                            {book.name}
                        </button>
                    {/each}
                </div>
            {:else}
                <Loader />
            {/if}
        </div>

        <div class="column chapters" class:current={step === "chapter"} bind:this={chaptersElem}>
            <h4><T id="scripture.picker_chapter" /></h4>
            {#if chapters?.length}
                <div class="tiles">
                    {#each shownChapters as chapter (chapter)}
                        <button class="tile" class:isActive={activeChapter === chapter.toString()} on:click={() => pickChapter(chapter)}>{chapter}</button>
                    {/each}
                </div>
            {:else if activeBook}
                <Loader />
            {/if}
        </div>

        <div class="column verses" class:current={step === "verse"} bind:this={versesElem}>
            <h4><T id="scripture.picker_verse" /></h4>
            {#if verses.length}
                <div class="tiles">
                    {#each shownVerses as verse (verse.id)}
                        {@const part = Number(verse.id.split("-")[0].split("_")[1] || 0)}
                        <button
                            class="tile"
                            class:isActive={isVerseActive(verse.id, activeVerses)}
                            class:part={part > 1}
                            title={verse.text?.replace(/<[^>]*>/g, "") || ""}
                            on:mousedown={(event) => dispatch("verseclick", { event, id: verse.id, isClick: false })}
                            on:click={(event) => {
                                setStep("verse")
                                dispatch("verseclick", { event, id: verse.id, isClick: true })
                            }}
                            on:dblclick={() => dispatch("play", null)}
                        >
                            {verse.number}{#if part}<small>{String.fromCharCode(96 + part)}</small>{/if}
                        </button>
                    {/each}
                </div>
            {:else if activeChapter}
                <Loader />
            {/if}
        </div>
    </div>

    <div class="preview">
        <span class="ref">{reference}</span>
        <span class="text">{@html previewText}</span>
    </div>
</div>

<style>
    .picker {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        overflow: hidden;
    }

    /* TYPE BAR */

    .bar {
        position: relative;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background-color: var(--primary-darkest);
        border-bottom: 2px solid var(--primary-lighter);
    }
    .bar.rejected {
        animation: shake 0.25s;
    }
    @keyframes shake {
        25% {
            transform: translateX(-4px);
        }
        75% {
            transform: translateX(4px);
        }
    }

    .crumb {
        min-width: 150px;
        padding: 6px 14px;
        font-size: 1.35em;
        font-weight: 600;
        font-family: inherit;
        text-align: start;
        color: var(--text);
        background-color: var(--primary);
        border: 2px solid var(--primary-lighter);
        border-radius: 6px;
        cursor: pointer;
        white-space: nowrap;
    }
    .crumb.number {
        min-width: 90px;
        text-align: center;
    }
    .crumb.current {
        border-color: var(--secondary);
        background-color: var(--primary-darker);
    }
    .crumb.placeholder {
        color: var(--text);
        opacity: 0.55;
        font-weight: 400;
    }
    .crumb.current.placeholder {
        opacity: 0.8;
    }
    .crumb:disabled {
        opacity: 0.4;
        cursor: default;
    }
    .divider {
        font-size: 1.4em;
        font-weight: bold;
        opacity: 0.6;
    }

    .pickerInput {
        position: absolute;
        opacity: 0;
        width: 1px;
        height: 1px;
        pointer-events: none;
    }
    /* the highlighted box shows where the keys go, only while the hidden field has focus */
    .bar:not(:focus-within) .crumb.current {
        border-style: dashed;
    }

    .hint {
        flex: 1;
        text-align: end;
        opacity: 0.6;
        font-size: 0.9em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    /* COLUMNS */

    .columns {
        flex: 1;
        display: flex;
        min-height: 0;
    }
    .column {
        display: flex;
        flex-direction: column;
        overflow-y: auto;
        padding: 8px;
        border-top: 3px solid transparent;
    }
    .column:not(:last-child) {
        border-inline-end: 2px solid var(--primary-lighter);
    }
    .column.current {
        border-top-color: var(--secondary);
        background-color: rgb(255 255 255 / 0.02);
    }
    .column.books {
        flex: 5;
    }
    .column.chapters {
        flex: 3;
    }
    .column.verses {
        flex: 3;
    }

    h4 {
        font-size: 0.75em;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        opacity: 0.5;
        margin: 0 0 6px 2px;
        font-weight: 600;
    }

    .tiles {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(58px, 1fr));
        gap: 6px;
        align-content: start;
    }
    .tiles.bookTiles {
        grid-template-columns: repeat(auto-fill, minmax(124px, 1fr));
    }

    .tile {
        min-height: 46px;
        padding: 4px 8px;
        font-family: inherit;
        font-size: 1.3em;
        font-weight: 700;
        color: var(--text);
        background-color: var(--primary);
        border: 2px solid transparent;
        border-radius: 6px;
        cursor: pointer;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
    }
    .tile.book {
        font-size: 1.1em;
        font-weight: 600;
        border-inline-start: 4px solid var(--tile-color);
        text-align: start;
    }
    .tile.part {
        opacity: 0.75;
    }
    .tile small {
        font-size: 0.65em;
        opacity: 0.6;
        margin-inline-start: 1px;
    }
    .tile:hover {
        border-color: var(--primary-lighter);
        filter: brightness(1.2);
    }
    .tile.isActive {
        border-color: var(--secondary);
        background-color: var(--focus);
        opacity: 1;
    }

    /* PREVIEW */

    .preview {
        display: flex;
        gap: 12px;
        align-items: baseline;
        /* room for the floating buttons (play, mode, history, search) in the corner */
        padding: 8px 300px 10px 14px;
        min-height: 56px;
        max-height: 30%;
        overflow-y: auto;
        background-color: var(--primary-darkest);
        border-top: 2px solid var(--primary-lighter);
    }
    .preview .ref {
        color: var(--secondary);
        font-weight: 700;
        font-size: 1.1em;
        white-space: nowrap;
    }
    .preview .text {
        font-size: 1.1em;
        line-height: 1.35;
    }
    .preview :global(.wj) {
        color: #ff5050;
    }
    .preview :global(.xt) {
        display: none;
    }
</style>
