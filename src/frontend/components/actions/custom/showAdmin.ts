// FORK-ONLY MODULE — not part of upstream FreeShow.
//
// Deleting shows is the one thing the stock API cannot do, which makes any
// bulk import a one-way trip. A migration that cannot be rolled back is a
// migration you cannot safely retry, so this exposes the same delete the
// drawer uses.
//
// Wired in through a single entry in API_ACTIONS, like the other custom modules.

import { get } from "svelte/store"
import { convertText } from "../../../converters/txt"
import { activeProject, projects, shows } from "../../../stores"
import { history } from "../../helpers/history"

export type API_delete_shows = {
    /** Show ids to delete. */
    ids?: string[]
    /** Delete every show whose name starts with this, e.g. a test prefix. */
    namePrefix?: string
    /** Must be true to actually delete; otherwise the matches are only listed. */
    confirm?: boolean
}

/**
 * API: delete shows by id, or by a name prefix.
 *
 * Without `confirm: true` this only reports what it would remove — deleting in
 * bulk from a script is easy to get wrong, and there is no undo once the files
 * are gone.
 */
export function deleteShows(data: API_delete_shows = {}) {
    const all = get(shows)

    let ids: string[] = []
    if (data.ids?.length) {
        ids = data.ids.filter((id) => all[id])
    } else if (data.namePrefix) {
        const prefix = data.namePrefix.toLowerCase()
        ids = Object.keys(all).filter((id) => (all[id]?.name || "").toLowerCase().startsWith(prefix))
    } else {
        return { error: "indica 'ids' o 'namePrefix'" }
    }

    const matched = ids.map((id) => ({ id, name: all[id]?.name || "" }))
    const missing = (data.ids || []).filter((id) => !all[id])

    if (!ids.length) return { deleted: 0, matched, missing, confirmed: false }

    if (!data.confirm) {
        return { deleted: 0, matched, missing, confirmed: false, note: "nada borrado: enviá confirm=true" }
    }

    history({ id: "SHOWS", oldData: { data: matched.map(({ id }) => ({ id })) }, location: { page: "drawer" } })

    return { deleted: matched.length, matched, missing, confirmed: true }
}

export type API_trim_project = {
    /** Project to trim. */
    projectId: string
    /** Item ids to keep, in order. Everything else is removed. */
    keepIds: string[]
    confirm?: boolean
}

/**
 * API: cut a project back to a chosen set of items.
 *
 * Creating a show adds it to whatever project is active, so a bulk import
 * silently appends hundreds of entries to whatever the user had open. There is
 * no stock way to undo that in one step.
 */
export function trimProject(data: API_trim_project) {
    const project = get(projects)[data.projectId]
    if (!project) return { error: `proyecto no encontrado: ${data.projectId}` }

    const keep = new Set(data.keepIds || [])
    const before = project.shows?.length || 0
    const kept = (project.shows || []).filter((s: any) => keep.has(s.id))

    if (!data.confirm) {
        return { ok: false, before, wouldKeep: kept.length, wouldRemove: before - kept.length, note: "nada cambiado: enviá confirm=true" }
    }

    projects.update((all) => {
        if (!all[data.projectId]) return all
        all[data.projectId].shows = kept.map((s: any, i: number) => ({ ...s, index: i }))
        return all
    })

    return { ok: true, before, after: kept.length, removed: before - kept.length }
}

/**
 * REMOVED: saveData.
 *
 * It forced FreeShow to write everything in showsCache to disk. That cache
 * degrades under bulk API use — entries come back with their slides, and
 * sometimes their layout, emptied — and saving then wrote those blanks over
 * good files. It destroyed the lyrics of 503 shows once, and 26 more after a
 * guard was added, because the damage takes shapes the guard did not match.
 *
 * Bulk writes now bypass the app: freeshow-mcp/src/escribirShow.js writes
 * .show files directly while FreeShow is closed. For anything created through
 * the API, FreeShow's own save on quit is the only safe path.
 */

/// CREATE ///

export type API_create_show = {
    text: string
    name?: string
    category?: string
    /** Add it to the project that is open. Default false: it only goes into the library. */
    addToProject?: boolean
    /** Add it to this project instead. */
    projectId?: string
    /** Open it in the app. Default false: the operator keeps what is on their screen. */
    open?: boolean
}

/** API: create a show from plain text. Returns its id, so it can be themed, edited or presented next. */
export function createShowAPI(data: API_create_show) {
    if (!data?.text) return { error: "text is required" }
    const project = data.projectId || (data.addToProject ? get(activeProject) || "" : "")
    if (data.projectId && !get(projects)[data.projectId]) return { error: "project not found: " + data.projectId }

    const { text, name, category } = data
    const created = convertText({ noFormatting: true, text, name, category, open: !!data.open, project })
    return { id: created.id, name: created.show?.name || name || "", project: project || null }
}
