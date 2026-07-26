// FORK-ONLY MODULE — not part of upstream FreeShow.
//
// Deleting shows is the one thing the stock API cannot do, which makes any
// bulk import a one-way trip. A migration that cannot be rolled back is a
// migration you cannot safely retry, so this exposes the same delete the
// drawer uses.
//
// Wired in through a single entry in API_ACTIONS, like the other custom modules.

import { get } from "svelte/store"
import { shows } from "../../../stores"
import { save } from "../../../utils/save"
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

/**
 * API: flush everything to disk now.
 *
 * Shows created through the API only live in memory until FreeShow saves, and
 * autosave defaults to every 15 minutes — so a bulk import that is interrupted
 * before then is lost entirely. A migration script should call this when it
 * finishes.
 */
export function saveData() {
    save()
    return { ok: true, saved: Object.keys(get(shows)).length }
}
