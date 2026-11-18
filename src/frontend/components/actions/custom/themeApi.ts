// FORK-ONLY MODULE — not part of upstream FreeShow.
//
// Everything an agent (or a script) needs to work with themes through the API: list, read, create,
// edit, delete and apply them, look at a rendered preview, change a colour or font across a whole
// folder, set backgrounds, and move theme folders between machines.
//
// A theme is a FreeShow template; a theme folder is a template category. Themes can be written as
// raw template items, or as the small "spec" of ../../helpers/themeSpec.ts (font, size, colour,
// position, background...), which is what an agent should normally use.
//
// Wired in through entries in API_ACTIONS (api.ts), like the other files of this folder.

import { get } from "svelte/store"
import { uid } from "uid"
import { EXPORT } from "../../../../types/Channels"
import { Main } from "../../../../types/IPC/Main"
import type { Item, Show, Slide, Template, TemplateSettings } from "../../../../types/Show"
import { requestMain, sendMain } from "../../../IPC/main"
import { activeProject, activeShow, dictionary, groups, language, mediaFolders, outputs, projects, showsCache, styles, templateCategories, templates } from "../../../stores"
import { newToast } from "../../../utils/common"
import { translateText } from "../../../utils/language"
import { send } from "../../../utils/request"
import { imageExtensions, videoExtensions } from "../../../values/extensions"
import { clone, keysToID, sortByName } from "../../helpers/array"
import { history } from "../../helpers/history"
import { getExtension } from "../../helpers/media"
import { getFirstActiveOutput } from "../../helpers/output"
import { loadShows } from "../../helpers/setShow"
import { getLayoutRef } from "../../helpers/show"
import { applyShowTheme, applySlideTheme, applyThemePackage, getThemeMap, getThemeRoles, getThemeTemplates, REMOVE_SLIDE_THEME, setThemeRole } from "../../helpers/slideTheme"
import { FACTORY_FOLDER, THEME_PRESETS } from "../../helpers/themePresets"
import { fillSampleText, getPalette, getTemplateFiles, getTemplateFonts, itemsToSpec, patchItemsWithSpec, patchSettingsWithSpec, replacePaletteValue, specToItems, THEME_CANVAS, type ThemeSpec } from "../../helpers/themeSpec"
import { formatToFileName } from "../../helpers/show"

/// TYPES ///

export type API_template_create = {
    name?: string
    /** Folder id (see get_template_categories). */
    category?: string
    /** Folder name: used when no id is given, and created if it does not exist. */
    categoryName?: string
    color?: string
    /** The simple description of the theme. */
    spec?: ThemeSpec
    /** Raw FreeShow items, instead of (or before) the spec. */
    items?: Item[]
    settings?: TemplateSettings
}
export type API_template_update = API_template_create & { id: string }
export type API_template_duplicate = { id: string; name?: string; category?: string }
export type API_template_apply = {
    /** Theme id. "" with scope "slides" or "group" removes the slides' own theme. */
    id: string
    /** Default: "show". "project" applies it to every show of a project. */
    scope?: "show" | "slides" | "group" | "project"
    /** Default: the show that is open. */
    showId?: string
    /** Slide numbers, starting at 1, for scope "slides". */
    indexes?: number[]
    /** Group id or name ("chorus", "Coro"), for scope "group". */
    group?: string
    /** For scope "project". Default: the project that is open. */
    projectId?: string
}
export type API_theme_package_apply = { categoryId: string; showId?: string; projectId?: string }
export type API_theme_role = { categoryId: string; role: string; templateId: string }
export type API_template_preview = {
    /** An existing theme... */
    id?: string
    /** ...or a spec to look at before saving it. */
    spec?: ThemeSpec
    /** Example text, one line per line. */
    text?: string
    /** Width of the picture in pixels (height follows 16:9). Default 960. */
    width?: number
    /** Draw this file behind it (to try a theme over a real background). */
    backgroundPath?: string
    /** Colour behind a theme that has no background of its own, so boxes, outlines and dark shapes can be seen. Default "#2B3A4A"; "none" leaves it black. */
    backdrop?: string
    /** Milliseconds to wait for the picture to settle; raise it for video backgrounds. Default 1200. */
    wait?: number
}
export type API_theme_palette = { categoryId?: string; templateId?: string }
export type API_theme_replace = API_theme_palette & { kind: "color" | "font"; from: string; to: string }
export type API_media_list = { folderId?: string; path?: string; type?: "video" | "image"; search?: string; depth?: number; limit?: number }
export type API_background = {
    /** File path. "" removes the background. */
    path: string
    showId?: string
    /** Slide numbers, starting at 1. Default: every slide. */
    indexes?: number[]
    loop?: boolean
    muted?: boolean
}
export type API_style_template = { styleId: string; templateId: string; kind?: "template" | "templateScripture" }
export type API_theme_export = { categoryId: string }
export type API_theme_import = { path: string }

/// HELPERS ///

const fail = (error: string) => ({ error })

function categoryName(id: string | null | undefined) {
    const category = get(templateCategories)[id || ""]
    if (!category) return ""
    return category.default ? translateText(category.name, get(dictionary)) : category.name
}

function describeTemplate(id: string, template: Template) {
    return {
        id,
        name: template.name || "",
        category: template.category && get(templateCategories)[template.category] ? template.category : null,
        categoryName: categoryName(template.category),
        color: template.color || null,
        mode: template.settings?.mode || "default",
        isDefault: !!template.isDefault,
        spec: itemsToSpec(template.items, template.settings)
    }
}

/** Folder id for an id or a name; a name that does not exist becomes a new folder. */
function resolveCategory(data: { category?: string; categoryName?: string }): string | null {
    const categories = get(templateCategories)
    if (data.category && categories[data.category]) return data.category

    const name = (data.categoryName || "").trim()
    if (!name) return null
    const existing = Object.keys(categories).find((id) => categoryName(id).toLowerCase() === name.toLowerCase())
    if (existing) return existing

    const id = uid()
    templateCategories.update((a) => ({ ...a, [id]: { name, icon: "folder" } }))
    return id
}

/** A theme's text box shows the theme's name in the thumbnails (as FreeShow's own templates do), instead of being blank. */
function nameEmptyText(items: Item[], name: string) {
    const hasText = items.some((item) => item.lines?.some((line) => line.text?.some((text) => text.value)))
    return hasText || !name ? items : fillSampleText(items, name)
}

function saveTemplate(id: string, template: Template) {
    history({ id: "UPDATE", newData: { data: template }, oldData: { id }, location: { page: "drawer", id: "template" } })
}

function buildTemplate(base: Template, data: API_template_create): Template {
    const template: Template = clone(base)
    if (data.name !== undefined) template.name = data.name
    if (data.color !== undefined) template.color = data.color || null
    if (data.items) template.items = clone(data.items)
    if (data.settings) template.settings = { ...(template.settings || {}), ...clone(data.settings) }
    if (data.spec) {
        template.items = patchItemsWithSpec(template.items || [], data.spec)
        template.settings = patchSettingsWithSpec(template.settings, data.spec)
    }
    if (template.settings && !Object.keys(template.settings).length) delete template.settings
    return template
}

/** Run something on a show as the open one (the theme helpers work on the open show), then go back. */
async function withShow<T>(showId: string | undefined, run: () => T): Promise<T | { error: string }> {
    const previous = get(activeShow)
    const id = showId || previous?.id || ""
    if (!id) return fail("no show: give a showId or open one")

    await loadShows([id])
    if (!get(showsCache)[id]) return fail("show not found: " + id)

    const switched = previous?.id !== id || (previous?.type || "show") !== "show"
    if (switched) activeShow.set({ id, type: "show" })
    try {
        return run()
    } finally {
        if (switched) activeShow.set(previous)
    }
}

/// THEMES ///

export function getTemplatesAPI() {
    return sortByName(keysToID(get(templates))).map((template) => describeTemplate(template.id, template))
}

export function getTemplateAPI(data: { id: string }) {
    const template = get(templates)[data?.id]
    if (!template) return fail("theme not found: " + data?.id)
    return { ...describeTemplate(data.id, template), items: clone(template.items), settings: clone(template.settings || {}), canvas: THEME_CANVAS }
}

export function getTemplateCategoriesAPI() {
    const all = get(templates)
    return sortByName(keysToID(clone(get(templateCategories)))).map((category) => {
        const { map, guessed } = getThemeMap(category.id)
        return {
            id: category.id,
            name: categoryName(category.id),
            isDefault: !!category.default,
            isArchive: !!category.isArchive,
            templates: Object.keys(all).filter((id) => all[id].category === category.id).length,
            // which theme each kind of slide uses when the folder is applied as a package
            roles: map,
            rolesGuessed: guessed
        }
    })
}

export function createTemplateCategoryAPI(data: { name: string }) {
    const id = resolveCategory({ categoryName: data?.name })
    if (!id) return fail("a name is required")
    return { id, name: categoryName(id) }
}

export function createTemplateAPI(data: API_template_create = {}) {
    const base: Template = { name: data.name || translateText("main.unnamed", get(dictionary)), color: null, category: resolveCategory(data), items: [] }
    const template = buildTemplate(base, { ...data, spec: data.spec || (data.items ? undefined : {}) })
    // a theme with nothing given still gets a text box, or it could not show any text
    if (!template.items.length) template.items = specToItems({})
    template.items = nameEmptyText(template.items, template.name)

    const id = uid()
    saveTemplate(id, template)
    return describeTemplate(id, template)
}

export function updateTemplateAPI(data: API_template_update) {
    const current = get(templates)[data?.id]
    if (!current) return fail("theme not found: " + data?.id)

    const template = buildTemplate(current, data)
    if (data.category !== undefined || data.categoryName !== undefined) template.category = resolveCategory(data)
    // an edited factory template is the user's own from then on
    delete template.isDefault
    saveTemplate(data.id, template)
    return describeTemplate(data.id, template)
}

export function deleteTemplateAPI(data: { id: string }) {
    if (!get(templates)[data?.id]) return fail("theme not found: " + data?.id)
    history({ id: "UPDATE", newData: { id: data.id }, location: { page: "drawer", id: "template" } })
    return { id: data.id, deleted: true }
}

export function duplicateTemplateAPI(data: API_template_duplicate) {
    const current = get(templates)[data?.id]
    if (!current) return fail("theme not found: " + data?.id)

    const template: Template = clone(current)
    delete template.isDefault
    template.name = data.name || `${current.name} 2`
    if (data.category && get(templateCategories)[data.category]) template.category = data.category

    const id = uid()
    saveTemplate(id, template)
    return describeTemplate(id, template)
}

/// APPLY ///

function slideSelection(indexes: number[] | undefined) {
    const length = getLayoutRef().length
    return (indexes || [])
        .map((number) => Math.round(Number(number)) - 1)
        .filter((index, i, all) => index >= 0 && index < length && all.indexOf(index) === i)
        .map((index) => ({ index }))
}

/** Layout indexes of the slides (parents and their children) that belong to a group. */
function groupSelection(group: string) {
    const wanted = (group || "").trim().toLowerCase()
    const show = get(showsCache)[get(activeShow)?.id || ""]
    const allGroups = get(groups)
    const selection: { index: number }[] = []
    getLayoutRef().forEach((ref, index) => {
        const parent: Slide | undefined = show?.slides?.[ref.parent?.id || ref.id]
        const globalGroup = parent?.globalGroup || ""
        const info = allGroups[globalGroup]
        const names = [globalGroup, parent?.group || "", info?.name || "", info ? translateText("groups." + info.name, get(dictionary)) : ""].map((name) => name.toLowerCase())
        if (wanted && names.includes(wanted)) selection.push({ index })
    })
    return selection
}

export async function applyTemplateAPI(data: API_template_apply) {
    const scope = data?.scope || "show"
    const removing = !data?.id
    if (!removing && !get(templates)[data.id]) return fail("theme not found: " + data.id)
    if (removing && scope !== "slides" && scope !== "group") return fail('an empty id (remove the theme) needs scope "slides" or "group"')

    if (scope === "project") {
        const target = get(projects)[data.projectId || get(activeProject) || ""]
        if (!target) return fail("project not found")
        const showIds = (target.shows || []).filter((item) => (item.type || "show") === "show").map((item) => item.id)
        const applied: string[] = []
        for (const showId of showIds) {
            const result = await withShow(showId, () => applyShowTheme(data.id))
            if (!(result as any)?.error) applied.push(showId)
        }
        return { id: data.id, scope, shows: applied }
    }

    return withShow(data.showId, () => {
        const showId = get(activeShow)!.id
        if (scope === "show") {
            applyShowTheme(data.id)
            return { id: data.id, scope, showId }
        }

        const selection = scope === "group" ? groupSelection(data.group || "") : slideSelection(data.indexes)
        if (!selection.length) return fail(scope === "group" ? "no slides in that group: " + (data.group || "") : "no valid slide numbers (they start at 1)")
        applySlideTheme(removing ? REMOVE_SLIDE_THEME : data.id, selection)
        return { id: data.id, scope, showId, slides: selection.map((slide) => slide.index + 1) }
    })
}

export function setThemeRoleAPI(data: API_theme_role) {
    if (!get(templateCategories)[data?.categoryId]) return fail("folder not found: " + data?.categoryId)
    if (!getThemeRoles().includes(data.role)) return fail(`unknown role "${data.role}". Roles: ${getThemeRoles().join(", ")}`)
    if (data.templateId && !getThemeTemplates(data.categoryId).some((template) => template.id === data.templateId)) return fail("that theme is not in the folder")
    setThemeRole(data.categoryId, data.role, data.templateId || "")
    return { categoryId: data.categoryId, roles: getThemeMap(data.categoryId).map }
}

/** Give every slide the theme its group uses in a folder ("theme package"), in one show or a whole project. */
export async function applyThemePackageAPI(data: API_theme_package_apply) {
    if (!get(templateCategories)[data?.categoryId]) return fail("folder not found: " + data?.categoryId)
    const { map } = getThemeMap(data.categoryId)
    if (!Object.keys(map).length) return fail("the folder has no themes to apply")

    if (data.projectId !== undefined) {
        const project = get(projects)[data.projectId || get(activeProject) || ""]
        if (!project) return fail("project not found")
        const applied: string[] = []
        for (const item of project.shows || []) {
            if ((item.type || "show") !== "show") continue
            const result = await withShow(item.id, () => applyThemePackage(data.categoryId))
            if (!(result as any)?.error) applied.push(item.id)
        }
        return { categoryId: data.categoryId, roles: map, shows: applied }
    }

    const result = await withShow(data.showId, () => {
        applyThemePackage(data.categoryId)
        return { categoryId: data.categoryId, roles: map, showId: get(activeShow)!.id }
    })
    return result
}

/// PREVIEW ///

const SAMPLE_TEXT = { en: "Example text of the theme\nSecond line, a little longer", es: "Texto de ejemplo del tema\nSegunda línea, un poco más larga" }

/** A picture (PNG data URL) of a theme with example text: of a saved theme, or of a spec before saving it. */
export async function renderTemplatePreview(data: API_template_preview = {}) {
    let items: Item[]
    let settings: TemplateSettings | undefined
    if (data.id) {
        const template = get(templates)[data.id]
        if (!template) return fail("theme not found: " + data.id)
        items = clone(template.items || [])
        settings = clone(template.settings)
        if (data.spec) {
            items = patchItemsWithSpec(items, data.spec)
            settings = patchSettingsWithSpec(settings, data.spec)
        }
    } else if (data.spec) {
        items = specToItems(data.spec)
        settings = patchSettingsWithSpec(undefined, data.spec)
    } else return fail("give a theme id or a spec")

    const sample = data.text || SAMPLE_TEXT[get(language) === "es" ? "es" : "en"]
    const showId = "theme_preview_" + uid(6)
    const layoutId = "preview"
    const backgroundPath = data.backgroundPath || settings?.backgroundPath
    const backdrop = settings?.backgroundColor || (backgroundPath || data.backdrop === "none" ? "" : data.backdrop || "#2B3A4A")
    const slide: Slide = { group: "", color: null, settings: backdrop ? { color: backdrop } : {}, notes: "", items: fillSampleText(items, sample) }
    const show = {
        name: "Theme preview",
        category: null,
        settings: { activeLayout: layoutId, template: null },
        timestamps: { created: Date.now(), modified: null, used: null },
        quickAccess: {},
        meta: {},
        slides: { slide },
        layouts: { [layoutId]: { name: "", notes: "", slides: [{ id: "slide" }] } },
        media: {}
    } as unknown as Show

    const currentOutput = getFirstActiveOutput()
    if (!currentOutput?.id) return fail("no output to draw the preview with")
    const output = clone(currentOutput)
    // the theme alone: no output style on top, nothing else that is on screen
    output.style = ""
    output.out = { slide: { id: showId, layout: layoutId, index: 0 } }
    if (backgroundPath) output.out.background = { path: backgroundPath, loop: true, muted: true }

    const width = Math.max(160, Math.min(1920, Math.round(Number(data.width) || 960)))
    const resolution = { width, height: Math.round((width * THEME_CANVAS.height) / THEME_CANVAS.width) }
    const wait = data.wait || (backgroundPath && videoExtensions.includes(getExtension(backgroundPath)) ? 2500 : 1200)

    const result = await requestMain(Main.CAPTURE_THEME_PREVIEW, { output: { [currentOutput.id]: output }, shows: { [showId]: show }, resolution, wait }, undefined, 40000)
    if (!result?.base64) return fail("the preview could not be drawn")
    return { image: result.base64, width: resolution.width, height: resolution.height, backdrop: backdrop || null }
}

/// PALETTE ///

function paletteTemplates(data: API_theme_palette): { id: string; template: Template }[] {
    const all = get(templates)
    if (data?.templateId) return all[data.templateId] ? [{ id: data.templateId, template: all[data.templateId] }] : []
    return Object.keys(all)
        .filter((id) => !data?.categoryId || all[id].category === data.categoryId)
        .map((id) => ({ id, template: all[id] }))
}

/** The colours and fonts a folder (or one theme, or every theme) uses, most used first. */
export function getThemePaletteAPI(data: API_theme_palette = {}) {
    const list = paletteTemplates(data)
    return { templates: list.length, ...getPalette(list.map((entry) => entry.template)) }
}

/** Change one colour or font everywhere a folder (or one theme) uses it. */
export function replaceThemeValueAPI(data: API_theme_replace) {
    if (data?.kind !== "color" && data?.kind !== "font") return fail('kind must be "color" or "font"')
    if (!data.from || !data.to) return fail("from and to are required")
    if (!data.categoryId && !data.templateId) return fail("give a categoryId or a templateId")

    const changed: string[] = []
    paletteTemplates(data).forEach(({ id, template }) => {
        const replaced = replacePaletteValue(template, data.kind, data.from, data.to)
        if (!replaced) return
        delete replaced.isDefault
        saveTemplate(id, replaced)
        changed.push(id)
    })
    return { kind: data.kind, from: data.from, to: data.to, changed }
}

/** Font families installed on this computer. */
export async function getFontsAPI() {
    try {
        const fonts: { family: string }[] = await (window as any).queryLocalFonts()
        return [...new Set(fonts.map((font) => font.family))].sort((a, b) => a.localeCompare(b))
    } catch (err) {
        return []
    }
}

/// MEDIA & BACKGROUNDS ///

export function getMediaFoldersAPI() {
    return keysToID(clone(get(mediaFolders)))
        .filter((folder) => folder.path)
        .map((folder) => ({ id: folder.id, name: folder.default ? translateText(folder.name, get(dictionary)) : folder.name, path: folder.path }))
}

/** Videos and images of the media library (every folder, one folder, or any path). */
export async function getMediaAPI(data: API_media_list = {}) {
    const folders = get(mediaFolders)
    let paths: string[] = []
    if (data.path) paths = [data.path]
    else if (data.folderId) paths = folders[data.folderId]?.path ? [folders[data.folderId].path!] : []
    else paths = Object.values(folders).map((folder) => folder.path || "")
    paths = paths.filter(Boolean)
    if (!paths.length) return []

    const content = (await requestMain(Main.READ_FOLDER, { path: paths, depth: Math.max(0, Math.min(5, data.depth ?? 2)) }, undefined, 30000)) || {}
    const search = (data.search || "").toLowerCase()
    const limit = Math.max(1, Math.min(2000, data.limit || 500))

    const files: { path: string; name: string; type: "video" | "image"; folder: string }[] = []
    Object.values(content).forEach((entry) => {
        if (entry.isFolder) return
        const extension = getExtension(entry.path)
        const type = videoExtensions.includes(extension) ? "video" : imageExtensions.includes(extension) ? "image" : null
        if (!type || (data.type && data.type !== type)) return
        if (search && !entry.name.toLowerCase().includes(search)) return
        files.push({ path: entry.path, name: entry.name, type, folder: entry.path.slice(0, entry.path.length - entry.name.length - 1) })
    })
    return files.sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit)
}

/** Set (or with path "" remove) the background of every slide of a show, or of some of them. */
export async function setBackgroundAPI(data: API_background) {
    const showId = data?.showId || get(activeShow)?.id || ""
    if (!showId) return fail("no show: give a showId or open one")
    await loadShows([showId])
    if (!get(showsCache)[showId]) return fail("show not found: " + showId)
    if (get(showsCache)[showId].locked) return fail("the show is locked")

    const path = data.path || ""
    const ref = getLayoutRef(showId)
    const targets = data.indexes?.length ? data.indexes.map((number) => Math.round(Number(number)) - 1).filter((index) => ref[index]) : ref.map((_slide, index) => index)
    if (!targets.length) return fail("no valid slide numbers (they start at 1)")

    const extension = getExtension(path)
    const isVideo = videoExtensions.includes(extension)

    showsCache.update((a) => {
        const show = a[showId]
        const layout = show.layouts?.[show.settings?.activeLayout]
        if (!layout) return a

        let mediaId = ""
        if (path) {
            if (!show.media) show.media = {}
            mediaId = Object.keys(show.media).find((id) => show.media[id].path === path) || uid()
            const name = path.split(/[\\/]/).pop() || path
            show.media[mediaId] = { ...(show.media[mediaId] || {}), name, path, type: isVideo ? "video" : "image", ...(isVideo ? { loop: data.loop ?? true, muted: data.muted ?? true } : {}) }
        }

        targets.forEach((index) => {
            const entry: any = ref[index]
            const layoutSlide: any = entry.type === "child" ? layout.slides[entry.parent?.index] : layout.slides[entry.index]
            if (!layoutSlide) return
            let slideData = layoutSlide
            if (entry.type === "child") {
                if (!layoutSlide.children) layoutSlide.children = {}
                if (!layoutSlide.children[entry.id]) layoutSlide.children[entry.id] = {}
                slideData = layoutSlide.children[entry.id]
            }
            if (mediaId) slideData.background = mediaId
            else delete slideData.background
        })
        return a
    })

    return { showId, path, slides: targets.map((index) => index + 1) }
}

/// OUTPUT VARIANTS ///
// An output style can force its own theme: the same song looks one way on the main screen and
// another on the stream's lower third or on the stage display.

export function getOutputStylesAPI() {
    const allOutputs = get(outputs)
    return keysToID(clone(get(styles))).map((style) => ({
        id: style.id,
        name: style.name,
        template: style.template || null,
        templateScripture: style.templateScripture || null,
        outputs: Object.keys(allOutputs)
            .filter((id) => allOutputs[id].style === style.id)
            .map((id) => ({ id, name: allOutputs[id].name }))
    }))
}

/** Make an output style use a theme of its own ("" goes back to each show's theme). */
export function setOutputStyleTemplateAPI(data: API_style_template) {
    if (!get(styles)[data?.styleId]) return fail("output style not found: " + data?.styleId)
    if (data.templateId && !get(templates)[data.templateId]) return fail("theme not found: " + data.templateId)
    const key = data.kind === "templateScripture" ? "templateScripture" : "template"
    styles.update((a) => {
        if (data.templateId) a[data.styleId][key] = data.templateId
        else delete a[data.styleId][key]
        return a
    })
    return { styleId: data.styleId, [key]: data.templateId || null }
}

/// PACKAGES ///

export type ThemePackageFile = {
    themePackage: { id: string; name: string; icon?: string | null; themeMap?: { [role: string]: string }; fonts: string[] }
    templates: (Template & { id: string })[]
    files: string[]
}

/** Everything a theme folder needs to travel: its themes, which group uses which, and its media files. */
export function buildThemePackage(categoryId: string): ThemePackageFile | null {
    const category = get(templateCategories)[categoryId]
    if (!category) return null

    const all = get(templates)
    const list = Object.keys(all)
        .filter((id) => all[id].category === categoryId)
        .map((id) => ({ ...clone(all[id]), id }))
    const files: string[] = []
    const fonts: string[] = []
    list.forEach((template) => {
        getTemplateFiles(template).forEach((path) => !files.includes(path) && files.push(path))
        getTemplateFonts(template).forEach((font) => !fonts.includes(font) && fonts.push(font))
    })

    return { themePackage: { id: categoryId, name: categoryName(categoryId), icon: category.icon, themeMap: getThemeMap(categoryId).map, fonts }, templates: list, files }
}

/** Write a theme folder to one file (.fstemplate, with its media inside) in the exports folder. */
export function exportThemePackage(data: API_theme_export) {
    const file = buildThemePackage(data?.categoryId)
    if (!file) return fail("folder not found: " + data?.categoryId)
    if (!file.templates.length) return fail("the folder has no themes")

    // the template export of the main process: it zips the listed files next to the data
    send(EXPORT, ["TEMPLATE"], { name: formatToFileName(file.themePackage.name), file })
    return { name: file.themePackage.name, templates: file.templates.length, files: file.files.length, fonts: file.themePackage.fonts, folder: "exports" }
}

/** Bring in a theme package (called by the template import when the file is one). */
export async function importThemePackage(file: ThemePackageFile) {
    if (!Array.isArray(file?.templates) || !file.templates.length) return null

    // same folder again (an update of the package) keeps its id; a name clash with another folder does not merge
    const categories = get(templateCategories)
    const categoryId = file.themePackage.id && (!categories[file.themePackage.id] || categoryName(file.themePackage.id) === file.themePackage.name) ? file.themePackage.id : uid()
    templateCategories.update((a) => {
        a[categoryId] = { ...(a[categoryId] || {}), name: file.themePackage.name || translateText("main.unnamed", get(dictionary)), icon: file.themePackage.icon || "folder", themeMap: file.themePackage.themeMap || {} }
        return a
    })

    file.templates.forEach((entry) => {
        const template: Template = clone(entry)
        const id = (template as any).id || uid()
        delete (template as any).id
        delete template.isDefault
        template.category = categoryId
        saveTemplate(id, template)
    })

    // fonts cannot travel in the file: say which ones this computer does not have
    const installed = (await getFontsAPI()).map((font) => font.toLowerCase())
    const missingFonts = installed.length ? (file.themePackage.fonts || []).filter((font) => !installed.includes(font.replace(/["']/g, "").split(",")[0].trim().toLowerCase())) : []
    if (missingFonts.length) newToast(translateText("actions.theme_missing_fonts", get(dictionary)) + " " + missingFonts.join(", "))

    return { categoryId, name: file.themePackage.name, templates: file.templates.length, missingFonts }
}

/** Import a package (or any .fstemplate file) from a path on this computer. */
export function importThemeFileAPI(data: API_theme_import) {
    if (!data?.path) return fail("a path is required")
    sendMain(Main.IMPORT_FILES, { id: "freeshow_template", paths: [data.path] })
    return { path: data.path, importing: true }
}

/** Add the factory themes as a folder (again: only the ones that are missing). */
export function addFactoryThemes() {
    const lang = get(language) === "es" ? "es" : "en"
    const categoryId = "factory_themes"
    const map: { [role: string]: string } = {}

    templateCategories.update((a) => {
        if (!a[categoryId]) a[categoryId] = { name: FACTORY_FOLDER[lang], icon: "star" }
        return a
    })

    const added: string[] = []
    THEME_PRESETS.forEach((preset) => {
        const id = "factory_" + preset.id
        if (preset.role) map[preset.role] = id
        if (get(templates)[id]) return
        saveTemplate(id, { name: preset.name[lang], color: null, category: categoryId, items: nameEmptyText(specToItems(preset.spec), preset.name[lang]), settings: patchSettingsWithSpec(undefined, preset.spec) })
        added.push(id)
    })

    templateCategories.update((a) => {
        if (a[categoryId] && !a[categoryId].themeMap) a[categoryId].themeMap = map
        return a
    })
    return { categoryId, added }
}
