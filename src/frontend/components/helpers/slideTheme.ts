// Fork feature: right-click a slide -> "Tema" -> pick a template (ProPresenter-style themes).
// Kept in its own file so upstream merges only touch the small hooks in contextMenus/loadItems/menuClick.

import { get } from "svelte/store"
import type { Slide } from "../../../types/Show"
import { activePopup, activeShow, alertMessage, templateCategories, templates } from "../../stores"
import { newToast } from "../../utils/common"
import { getAccess } from "../../utils/profile"
import type { ContextMenuItem } from "../context/contextMenus"
import { clone, keysToID, sortByName } from "./array"
import { history } from "./history"
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

/** Set (or remove, with REMOVE_SLIDE_THEME) the template on the selected slides, as one undo step. */
export function applySlideTheme(templateId: string, selection: SlideSelection) {
    const showId = get(activeShow)?.id
    const show = _show().get()
    if (!showId || !show) return

    if (show.locked) {
        alertMessage.set("show.locked")
        activePopup.set("alert")
        return
    }
    const profile = getAccess("shows")
    if (profile.global === "read" || profile[show.category || ""] === "read") {
        alertMessage.set("profile.locked")
        activePopup.set("alert")
        return
    }

    const removing = templateId === REMOVE_SLIDE_THEME
    if (!removing && !get(templates)[templateId]) return

    const ref = getLayoutRef()
    const oldSlides: { [key: string]: Slide } = clone(show.slides || {})
    const newSlides: { [key: string]: Slide } = clone(oldSlides)

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

    const layoutId: string = show.settings?.activeLayout
    const layout = clone(show.layouts?.[layoutId]?.slides || [])
    history({
        id: "slide",
        newData: { slides: newSlides, layout },
        oldData: { slides: oldSlides, layout },
        location: { page: "show", show: get(activeShow)!, layout: layoutId }
    })

    // re-render the slides with their (new) templates, same as dropping a template on a slide
    const showTemplateId: string = show.settings?.template || ""
    history({ id: "TEMPLATE", save: false, newData: { id: showTemplateId }, location: { page: "show" } })
}
