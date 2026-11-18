<script lang="ts">
    // Fork feature: ProPresenter-style library in the left sidebar.
    // The songs are always in sight under the playlists (projects): pick a library (category), type to
    // search, click to open, double click or drag to add to the playlist. The drawer below is then
    // free to stay on Media, like ProPresenter's media bin.
    import { onMount } from "svelte"
    import type { ShowList } from "../../../types/Show"
    import { addProjectItem } from "../../converters/project"
    import { activeDrawerTab, activeProfile, activeProject, activeShow, categories, dictionary, focusedArea, projects, sortedShowsList, special } from "../../stores"
    import { translateText } from "../../utils/language"
    import { getAccess } from "../../utils/profile"
    import { formatSearch, showSearch } from "../../utils/search"
    import VirtualList from "../drawer/VirtualList.svelte"
    import { keysToID, sortByName } from "../helpers/array"
    import Icon from "../helpers/Icon.svelte"
    import T from "../helpers/T.svelte"
    import MaterialButton from "../inputs/MaterialButton.svelte"
    import ShowButton from "../inputs/ShowButton.svelte"
    import SelectElem from "../system/SelectElem.svelte"

    const MIN_HEIGHT = 120
    const HEADER_HEIGHT = 34

    $: collapsed = !!$special.libraryPanelCollapsed
    $: height = Number($special.libraryPanelHeight) || 320
    let active = (($special.libraryPanelCategory as string) || "all") as string

    function setSpecial(key: string, value: any) {
        special.update((a) => ({ ...a, [key]: value }))
    }

    $: profile = $activeProfile ? getAccess("shows") : {}

    // LIBRARIES (show categories)

    $: visible = $sortedShowsList.filter((a) => !$categories[a?.category || ""]?.isArchive && profile[a?.category || ""] !== "none")
    $: libraries = getLibraries($categories, visible)
    function getLibraries(..._updaters: any[]) {
        const counts: { [key: string]: number } = {}
        let unlabeled = 0
        visible.forEach((a) => {
            if (a.category && $categories[a.category]) counts[a.category] = (counts[a.category] || 0) + 1
            else unlabeled++
        })

        const list = sortByName(keysToID($categories))
            .filter((a) => !a.isArchive && profile[a.id] !== "none")
            .map((a) => ({ id: a.id, name: a.default ? translateText(a.name, $dictionary) : a.name, icon: a.icon || "noIcon", count: counts[a.id] || 0 }))

        const all = { id: "all", name: translateText("category.all", $dictionary), icon: "all", count: visible.length }
        const rest = unlabeled && list.length ? [{ id: "unlabeled", name: translateText("category.unlabeled", $dictionary), icon: "noIcon", count: unlabeled }] : []
        return [all, ...list, ...rest]
    }
    // the stored library may be gone
    $: if (libraries.length && !libraries.some((a) => a.id === active)) active = "all"

    function openLibrary(id: string) {
        active = id
        setSpecial("libraryPanelCategory", id)
    }

    // SONGS

    let searchValue = ""
    $: query = searchValue.trim()
    $: isSearching = formatSearch(query).trim().length > 1

    $: inLibrary = active === "all" ? visible : visible.filter((a) => (active === "unlabeled" ? !a.category || !$categories[a.category] : a.category === active))
    let list: ShowList[] = []
    $: list = isSearching ? showSearch(query, inLibrary) : inLibrary

    $: activeIndex = list.findIndex((a) => a.id === $activeShow?.id)

    function open(id: string) {
        activeShow.set({ id, type: "show" })
    }

    $: project = $activeProject ? $projects[$activeProject] : null
    function addToPlaylist(id: string) {
        if (!project) return
        // a second Enter / double click on the song just added would only repeat it
        const last = project.shows?.[project.shows.length - 1]
        if (last?.id === id && (last.type || "show") === "show") return
        addProjectItem({ id, type: "show" })
    }

    function searchKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            if (!searchValue) return
            e.stopPropagation()
            searchValue = ""
            return
        }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault()
            if (!list.length) return
            const next = activeIndex < 0 ? (e.key === "ArrowDown" ? 0 : list.length - 1) : activeIndex + (e.key === "ArrowDown" ? 1 : -1)
            if (list[next]) open(list[next].id)
            return
        }
        if (e.key === "Enter") {
            e.preventDefault()
            e.stopPropagation()
            // Enter opens the first result, a second Enter (or Ctrl+Enter) adds it to the playlist
            const target = activeIndex >= 0 ? list[activeIndex] : list[0]
            if (!target) return
            if (activeIndex < 0 && !(e.ctrlKey || e.metaKey)) open(target.id)
            else addToPlaylist(target.id)
        }
    }

    // RESIZE (drag the top edge)

    let panelElem: HTMLElement | undefined
    let dragging = false
    function resizeStart(e: MouseEvent) {
        if (collapsed) return
        e.preventDefault()
        dragging = true
    }
    function mousemove(e: MouseEvent) {
        if (!dragging || !panelElem) return
        const parent = panelElem.parentElement
        if (!parent) return
        const bottom = panelElem.getBoundingClientRect().bottom
        const max = parent.clientHeight - 90
        height = Math.max(MIN_HEIGHT, Math.min(max, bottom - e.clientY))
    }
    function mouseup() {
        if (!dragging) return
        dragging = false
        setSpecial("libraryPanelHeight", Math.round(height))
    }

    // the songs are here now, so the drawer can start on Media (once: after that it is the user's choice)
    onMount(() => {
        if ($special.libraryPanelInit) return
        setSpecial("libraryPanelInit", true)
        if ($activeDrawerTab === "shows") activeDrawerTab.set("media")
    })
</script>

<svelte:window on:mousemove={mousemove} on:mouseup={mouseup} />

<div class="library" class:collapsed class:dragging bind:this={panelElem} style="height: {collapsed ? HEADER_HEIGHT : height}px;" role="none" on:mouseup={() => focusedArea.set("show_drawer")}>
    <div class="resize" role="none" on:mousedown={resizeStart} />

    <div class="header">
        <MaterialButton style="flex: 1;justify-content: flex-start;padding: 0.3em 0.7em;font-weight: 600;" title={translateText(collapsed ? "actions.library_show" : "actions.library_hide", $dictionary)} on:click={() => setSpecial("libraryPanelCollapsed", !collapsed)}>
            <Icon id="shows" size={1.1} white />
            <p><T id="actions.library" /></p>
            <span class="count">{list.length}</span>
            <span style="flex: 1;" />
            <Icon id={collapsed ? "arrow_up" : "arrow_down"} size={1.1} white />
        </MaterialButton>
    </div>

    {#if !collapsed}
        {#if libraries.length > 1}
            <div class="libraries">
                {#each libraries as library (library.id)}
                    <button class="chip" class:isActive={active === library.id} title={library.name} on:click={() => openLibrary(library.id)}>
                        <Icon id={library.icon} custom={library.id !== "all" && library.icon !== "noIcon"} size={0.85} white />
                        <span class="name">{library.name}</span>
                        <span class="number">{library.count}</span>
                    </button>
                {/each}
            </div>
        {/if}

        <div class="search">
            <Icon id="search" size={1} white />
            <input class="edit" type="text" placeholder={translateText("actions.library_search", $dictionary)} bind:value={searchValue} on:keydown={searchKeydown} />
            {#if searchValue}
                <button class="clear" title={translateText("clear.search", $dictionary)} on:click={() => (searchValue = "")}><Icon id="close" size={0.9} white /></button>
            {/if}
        </div>

        <div class="list context #drawer_show">
            {#if list.length}
                {#key active}
                    <VirtualList items={list} let:item={show} {activeIndex}>
                        <SelectElem id="show_drawer" data={{ id: show.id }} shiftRange={list} draggable>
                            <div class="row" role="none" on:dblclick={() => addToPlaylist(show.id)}>
                                <ShowButton id={show.id} {show} class="#drawer_show_button" match={isSearching ? show.match || null : null} searchValue={isSearching ? query : ""} />
                                {#if project}
                                    <button class="add" title={translateText("context.addToProject", $dictionary)} on:click|stopPropagation={() => addToPlaylist(show.id)}>
                                        <Icon id="add" size={0.9} white />
                                    </button>
                                {/if}
                            </div>
                        </SelectElem>
                    </VirtualList>
                {/key}
            {:else}
                <p class="empty"><T id={isSearching ? "empty.search" : "empty.shows"} /></p>
            {/if}
        </div>
    {/if}
</div>

<style>
    .library {
        position: relative;
        flex: none;
        display: flex;
        flex-direction: column;
        min-height: 0;
        background-color: var(--primary-darker);
        border-top: 2px solid var(--primary-lighter);
    }
    .library.dragging {
        user-select: none;
    }

    .resize {
        position: absolute;
        top: -4px;
        left: 0;
        right: 0;
        height: 7px;
        cursor: ns-resize;
        z-index: 2;
    }
    .library.collapsed .resize {
        display: none;
    }
    .resize:hover,
    .library.dragging .resize {
        background-color: var(--secondary);
        opacity: 0.6;
    }

    .header {
        display: flex;
        background-color: var(--primary-darkest);
    }
    .header p {
        margin-inline-start: 8px;
        font-size: 1.02em;
    }
    .count {
        margin-inline-start: 8px;
        opacity: 0.5;
        font-size: 0.8em;
        font-weight: normal;
    }

    .libraries {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        padding: 6px;
        max-height: 92px;
        overflow-y: auto;
        border-bottom: 1px solid var(--primary-lighter);
    }
    .chip {
        display: flex;
        align-items: center;
        gap: 5px;
        max-width: 100%;
        padding: 3px 9px;
        font-family: inherit;
        font-size: 0.85em;
        color: var(--text);
        background-color: var(--primary);
        border: 1px solid var(--primary-lighter);
        border-radius: 20px;
        cursor: pointer;
    }
    .chip .name {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
    }
    .chip .number {
        opacity: 0.5;
        font-size: 0.85em;
    }
    .chip:hover {
        background-color: var(--hover);
    }
    .chip.isActive {
        border-color: var(--secondary);
        background-color: var(--focus);
    }

    .search {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 5px 10px;
        border-bottom: 1px solid var(--primary-lighter);
    }
    .search input {
        flex: 1;
        min-width: 0;
        padding: 4px 2px;
        font-family: inherit;
        font-size: 1em;
        color: var(--text);
        background: none;
        border: none;
        outline: none;
    }
    .search input::placeholder {
        color: var(--text);
        opacity: 0.45;
    }
    .clear,
    .add {
        display: flex;
        align-items: center;
        padding: 4px;
        background: none;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    }
    .clear:hover,
    .add:hover {
        background-color: var(--hover);
    }

    .list {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }
    .list :global(svelte-virtual-list-viewport) {
        flex: 1;
    }

    .row {
        position: relative;
        display: flex;
    }
    .row :global(button:not(.add)) {
        flex: 1;
        min-width: 0;
    }
    .add {
        position: absolute;
        inset-inline-end: 4px;
        top: 50%;
        transform: translateY(-50%);
        background-color: var(--primary-darkest);
        opacity: 0;
    }
    .row:hover .add {
        opacity: 1;
    }

    .empty {
        padding: 16px;
        text-align: center;
        opacity: 0.5;
    }
</style>
