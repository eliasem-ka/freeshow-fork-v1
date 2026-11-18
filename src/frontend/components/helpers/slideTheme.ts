// Fork feature: ProPresenter-style themes — right-click "Tema" menu, top-bar Themes panel, and theme packages.
// Kept in its own file so upstream merges only touch the small hooks in contextMenus/loadItems/menuClick.

import { get } from "svelte/store"
import { uid } from "uid"
import type { Slide, Template } from "../../../types/Show"
import { activePopup, activeRename, activeShow, alertMessage, dictionary, groups, templateCategories, templates } from "../../stores"
import { newToast } from "../../utils/common"
import { translateText } from "../../utils/language"
import { getAccess, isGroupHidden } from "../../utils/profile"
import type { ContextMenuItem } from "../context/contextMenus"
import { clone, keysToID, sortByName } from "./array"
import { history } from "./history"
import { setDrawerTabData } from "./historyHelpers"
import { getLayoutRef } from "./show"
import { _show } from "./shows"

export const REMOVE_SLIDE_THEME = "__remove_slide_theme__"

type SlideSelection = { index?: number }[]

/** Slide ids (as stored on the layout ref) for the selected layout indexes. */
function getSelectedSlideIds(selection: SlideSelection) {
    const ref = getLayoutRef()
    const ids: string[] = []
    selection.forEach(({ index }) => {
        const slideId = ref[index ?? -1]?.id
        if (slideId && !ids.includes(slideId)) ids.push(slideId)
    })
    return ids
}

/** Context submenu items: "remove theme", then templates grouped by category. */
export function loadSlideThemeItems(selection: SlideSelection): (ContextMenuItem | "SEPARATOR")[] {
    const slides: { [key: string]: Slide } = _show().get("slides") || {}
    const selectedIds = getSelectedSlideIds(selection)
    const currentThemes = selectedIds.map((id) => slides[id]?.settings?.template || "")
    // a theme is marked only when every selected slide uses it
    const sharedTheme = currentThemes.length && currentThemes.every((t) => t === currentThemes[0]) ? currentThemes[0] : ""

    const categories = get(templateCategories)
    const list = sortByName(keysToID(clone(get(templates)))).filter((t) => t?.settings?.mode !== "text" && !categories[t.category || ""]?.isArchive)
    if (!list.length) return [{ label: "empty.general", disabled: true }]

    const items: (ContextMenuItem | "SEPARATOR")[] = [{ id: REMOVE_SLIDE_THEME, label: "actions.remove_slide_theme", icon: "remove_circle", iconColor: "#ff6b54", disabled: !currentThemes.some(Boolean) }]

    // group by category, categories in name order, uncategorized last
    const byCategory: { [key: string]: typeof list } = {}
    list.forEach((t) => {
        const key = t.category && categories[t.category] ? t.category : ""
        if (!byCategory[key]) byCategory[key] = []
        byCategory[key].push(t)
    })
    const categoryOrder = sortByName(keysToID(clone(categories)))
        .map((c) => c.id)
        .filter((id) => byCategory[id])
    if (byCategory[""]) categoryOrder.push("")

    const showHeaders = categoryOrder.length > 1
    categoryOrder.forEach((categoryId) => {
        items.push("SEPARATOR")
        if (showHeaders) {
            const category = categories[categoryId]
            const label = category ? category.name : "category.unlabeled"
            items.push({ label, translate: !!category?.default || !category, icon: category?.icon || "folder", disabled: true })
        }
        byCategory[categoryId].forEach((t) => {
            items.push({ id: t.id, label: t.name, translate: false, icon: "templates", iconColor: t.color || undefined, enabled: t.id === sharedTheme })
        })
    })

    return items
}

/** Active show, or null (with an alert) when it is locked or read-only for this profile. */
function getEditableShow() {
    const showId = get(activeShow)?.id
    const show = _show().get()
    if (!showId || !show) return null

    if (show.locked) {
        alertMessage.set("show.locked")
        activePopup.set("alert")
        return null
    }
    const profile = getAccess("shows")
    if (profile.global === "read" || profile[show.category || ""] === "read") {
        alertMessage.set("profile.locked")
        activePopup.set("alert")
        return null
    }

    return { showId, show }
}

/** Apply a template to the whole active show (same as clicking it in the Templates drawer). */
export function applyShowTheme(templateId: string) {
    const editable = getEditableShow()
    if (!editable || !get(templates)[templateId]) return

    // per-slide templates win over the show template, so a theme applied to the whole show
    // (e.g. after a theme package) would otherwise leave those slides unchanged
    const slides: { [key: string]: Slide } = clone(editable.show.slides || {})
    const withOwnTemplate = Object.values(slides).filter((s) => s?.settings?.template)
    if (withOwnTemplate.length) {
        withOwnTemplate.forEach((s) => delete s.settings.template)
        commitSlides(editable.show, slides)
    }

    history({ id: "TEMPLATE", newData: { id: templateId, data: { createItems: true } }, location: { page: "none", override: "show#" + editable.showId } })
}

/** Replace the active show's slides as one undo step (layout unchanged). */
function commitSlides(show: any, newSlides: { [key: string]: Slide }) {
    const layoutId: string = show.settings?.activeLayout
    const layout = clone(show.layouts?.[layoutId]?.slides || [])
    history({
        id: "slide",
        newData: { slides: newSlides, layout },
        oldData: { slides: clone(show.slides || {}), layout },
        location: { page: "show", show: get(activeShow)!, layout: layoutId }
    })
}

/// THEME PACKAGES ///
// A template category is a theme: each template in it is a "theme slide", and the category's
// themeMap says which one each group uses ("first" = the show's first slide, "default" = the rest).

export const THEME_ROLE_FIRST = "first"
export const THEME_ROLE_DEFAULT = "default"

const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
// name hints used to guess a mapping when the theme has none stored
const ROLE_HINTS: { [role: string]: RegExp } = {
    [THEME_ROLE_FIRST]: /titulo|title|portada|primera|first/,
    pre_chorus: /pre.?coro|pre.?chorus/,
    chorus: /coro|chorus/,
    verse: /verso|verse|estrofa/,
    bridge: /puente|bridge/,
    intro: /intro/,
    outro: /final|outro|cierre/,
    tag: /tag|coletilla/,
    break: /break|pausa|instrumental/,
    [THEME_ROLE_DEFAULT]: /defecto|default|general|base|normal/
}

/** Roles a theme can map: first slide, every (visible) global group, then the default. */
export function getThemeRoles() {
    const groupIds = Object.keys(get(groups)).filter((id) => !isGroupHidden(id))
    return [THEME_ROLE_FIRST, ...groupIds, THEME_ROLE_DEFAULT]
}

/** Templates that belong to a theme (category), sorted by name. */
export function getThemeTemplates(categoryId: string) {
    return sortByName(keysToID(clone(get(templates)))).filter((t) => t.category === categoryId && t?.settings?.mode !== "text")
}

/** Stored mapping (dropping templates that no longer exist), or a guess from template names. */
export function getThemeMap(categoryId: string): { map: { [role: string]: string }; guessed: boolean } {
    const themeTemplates = getThemeTemplates(categoryId)
    const ids = new Set(themeTemplates.map((t) => t.id))

    const stored = get(templateCategories)[categoryId]?.themeMap
    if (stored) {
        const storedMap: { [role: string]: string } = {}
        Object.entries(stored).forEach(([role, id]) => {
            if (ids.has(id)) storedMap[role] = id
        })
        return { map: storedMap, guessed: false }
    }

    const map: { [role: string]: string } = {}
    const roles = getThemeRoles()
    themeTemplates.forEach((t) => {
        const name = normalize(t.name || "")
        const role = Object.keys(ROLE_HINTS).find((r) => roles.includes(r) && ROLE_HINTS[r].test(name))
        if (role && !map[role]) map[role] = t.id
    })
    // nothing named as the default: first unclaimed template, else the verse one
    if (!map[THEME_ROLE_DEFAULT] && themeTemplates.length) {
        const claimed = new Set(Object.values(map))
        map[THEME_ROLE_DEFAULT] = themeTemplates.find((t) => !claimed.has(t.id))?.id || map.verse || themeTemplates[0].id
    }
    return { map, guessed: true }
}

/** Store which template a role uses ("" clears it). The first edit also stores the guessed roles. */
export function setThemeRole(categoryId: string, role: string, templateId: string) {
    const current = getThemeMap(categoryId).map
    templateCategories.update((a) => {
        if (!a[categoryId]) return a
        const map = { ...current }
        if (templateId) map[role] = templateId
        else delete map[role]
        a[categoryId].themeMap = map
        return a
    })
}

/** Give every slide of the active show the template its group uses in this theme, as one undo step. */
export function applyThemePackage(categoryId: string) {
    const editable = getEditableShow()
    if (!editable) return
    const { map } = getThemeMap(categoryId)
    if (!Object.keys(map).length) return

    const show = editable.show
    const slides: { [key: string]: Slide } = clone(show.slides || {})
    const ref = getLayoutRef()
    const firstSlideId = ref[0]?.id // only the very first slide is the "title"

    let changed = 0
    let skippedLocked = 0
    ref.forEach((layoutSlide) => {
        const slide = slides[layoutSlide.id]
        if (!slide) return
        const parentId = layoutSlide.parent?.id || layoutSlide.id
        const parent = slides[parentId]
        if (parent?.locked) {
            skippedLocked++
            return
        }

        const group = parent?.globalGroup || ""
        const templateId = (layoutSlide.id === firstSlideId && map[THEME_ROLE_FIRST]) || (group && map[group]) || map[THEME_ROLE_DEFAULT] || ""
        if (!templateId || slide.settings?.template === templateId) return

        slide.settings = { ...(slide.settings || {}), template: templateId }
        changed++
    })

    if (skippedLocked) newToast("output.state_locked")
    if (!changed) return

    commitSlides(show, slides)
    history({ id: "TEMPLATE", save: false, newData: { id: show.settings?.template || "" }, location: { page: "show" } })
}

/** Template ids currently in use by the active show: its global template, or the one shared by the given slides. */
export function getActiveThemeId(selection: SlideSelection | null) {
    const show = _show().get()
    if (!show) return ""
    if (!selection?.length) return show.settings?.template || ""

    const slides: { [key: string]: Slide } = show.slides || {}
    const themes = getSelectedSlideIds(selection).map((id) => slides[id]?.settings?.template || "")
    return themes.length && themes.every((t) => t === themes[0]) ? themes[0] : ""
}

/** Set (or remove, with REMOVE_SLIDE_THEME) the template on the selected slides, as one undo step. */
export function applySlideTheme(templateId: string, selection: SlideSelection) {
    const editable = getEditableShow()
    if (!editable) return
    const { show } = editable

    const removing = templateId === REMOVE_SLIDE_THEME
    if (!removing && !get(templates)[templateId]) return

    const ref = getLayoutRef()
    const newSlides: { [key: string]: Slide } = clone(show.slides || {})

    let changed = 0
    let skippedLocked = 0
    selection.forEach(({ index }) => {
        const layoutSlide = ref[index ?? -1]
        if (!layoutSlide) return
        const slide = newSlides[layoutSlide.id]
        if (!slide) return

        const parentId = layoutSlide.parent?.id || layoutSlide.id
        if (newSlides[parentId]?.locked) {
            skippedLocked++
            return
        }

        if (removing) {
            if (!slide.settings?.template) return
            delete slide.settings.template
        } else {
            if (slide.settings?.template === templateId) return
            slide.settings = { ...(slide.settings || {}), template: templateId }
        }
        changed++
    })

    if (skippedLocked) newToast("output.state_locked")
    if (!changed) return

    commitSlides(show, newSlides)

    // re-render the slides with their (new) templates, same as dropping a template on a slide
    const showTemplateId: string = show.settings?.template || ""
    history({ id: "TEMPLATE", save: false, newData: { id: showTemplateId }, location: { page: "show" } })
}

/// CREATING THEMES ///

/** Text with accents, case and spacing ignored, to find themes by name. */
export function normalizeThemeText(value: string) {
    return (value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
}

/**
 * New theme (template) in a folder, in rename mode. With selected slides it is ProPresenter's
 * "save as theme": the design of the first one (its items, and its background if it has one).
 */
export function createTheme(categoryId: string, selection: SlideSelection | null) {
    const data: Template = { name: "", color: null, category: categoryId || null, items: [] }

    const show = _show().get()
    const layoutSlide = selection?.length && show ? getLayoutRef()[selection[0].index ?? -1] : null
    const slide: Slide | undefined = layoutSlide ? show.slides?.[layoutSlide.id] : undefined
    if (slide) {
        data.items = clone(slide.items || [])

        const parent = show.slides?.[layoutSlide.parent?.id || layoutSlide.id]
        const group = get(groups)[parent?.globalGroup || ""]
        const groupName = group ? (group.default ? translateText("groups." + group.name, get(dictionary)) : group.name) : parent?.group || ""
        data.name = [show.name, groupName].filter(Boolean).join(" - ")
        data.color = parent?.color || group?.color || null

        if (slide.settings?.color) data.settings = { backgroundColor: slide.settings.color }
        const backgroundPath = show.media?.[layoutSlide.data?.background || ""]?.path
        if (backgroundPath) data.settings = { ...(data.settings || {}), backgroundPath }
    }

    // a new template takes the category that is open in the drawer, so open this one there
    setDrawerTabData("templates", categoryId && get(templateCategories)[categoryId] ? categoryId : "unlabeled")

    const id = uid()
    history({ id: "UPDATE", newData: { data }, oldData: { id }, location: { page: "drawer", id: "template" } })
    // name it right away (an empty new theme then opens in the editor, like a new template does)
    setTimeout(() => activeRename.set("template_" + id), 50)
    return id
}

/** New theme folder (template category). */
export function createThemeFolder() {
    const id = uid()
    const name = translateText("main.unnamed", get(dictionary))
    history({ id: "UPDATE", newData: { data: { name, icon: "folder" } }, oldData: { id }, location: { page: "drawer", id: "category_templates" } })
    return id
}
