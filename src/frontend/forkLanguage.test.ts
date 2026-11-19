// Fork feature check: every text the fork's own screens ask for exists in English and in Spanish.
// A missing key shows up in the app as the raw key ("actions.backgrounds"), so it is caught here.
import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

const ROOT = join(__dirname, "..", "..")
const FORK_FILES = [
    "src/frontend/components/main/ThemePanel.svelte",
    "src/frontend/components/main/ThemeQuickEdit.svelte",
    "src/frontend/components/main/ThemeFolderTools.svelte",
    "src/frontend/components/main/ServiceButton.svelte",
    "src/frontend/components/show/LibraryPanel.svelte",
    "src/frontend/components/show/ServicePanel.svelte",
    "src/frontend/components/show/BackgroundTray.svelte",
    "src/frontend/components/drawer/bible/ScripturePicker.svelte",
    "src/frontend/components/quicksearch/quicksearchLibrary.ts"
]

// "section.key" strings: <T id="..." />, translateText("..."), newToast("..."), title="..." and the like
const KEY = /["'`]([a-z][a-z_]*\.[a-zA-Z0-9_]+)["'`]/g
// strings of that shape that are not texts
const NOT_TEXT = /^(special|e|event|item|slide|show|style|data|value|result|bible)\./

function getKeys(file: string) {
    const source = readFileSync(join(ROOT, file), "utf8")
    const keys = new Set<string>()
    for (const match of source.matchAll(KEY)) if (!NOT_TEXT.test(match[1])) keys.add(match[1])
    return [...keys]
}

// a key that ends in "_" is the start of several ("actions.theme_position_" + "top"): they are checked as a group
const withPrefix = (dictionary: any, key: string) => {
    const [section, start] = key.split(".")
    return Object.keys(dictionary?.[section] || {})
        .filter((name) => name.startsWith(start))
        .sort()
}

function has(dictionary: any, key: string) {
    if (key.endsWith("_")) return withPrefix(dictionary, key).length > 0
    const [section, name] = key.split(".")
    return typeof dictionary?.[section]?.[name] === "string" && dictionary[section][name].length > 0
}

describe("fork texts", () => {
    const en = JSON.parse(readFileSync(join(ROOT, "public/lang/en.json"), "utf8"))
    const es = JSON.parse(readFileSync(join(ROOT, "public/lang/es.json"), "utf8"))

    FORK_FILES.forEach((file) => {
        it(`${file.split("/").pop()} has every text in English and Spanish`, () => {
            const keys = getKeys(file).filter((key) => en[key.split(".")[0]] !== undefined)
            expect(keys.length).toBeGreaterThan(0)
            expect(keys.filter((key) => !has(en, key)).map((key) => "en: " + key)).toEqual([])
            expect(keys.filter((key) => !has(es, key)).map((key) => "es: " + key)).toEqual([])
            keys.filter((key) => key.endsWith("_")).forEach((key) => expect(withPrefix(es, key)).toEqual(withPrefix(en, key)))
        })
    })
})
