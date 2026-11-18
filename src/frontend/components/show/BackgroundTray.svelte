<script lang="ts">
    // Fork feature: backgrounds one click away, under the slides of a show.
    // The tray holds the backgrounds this show already uses and the media marked as favourite:
    // a click puts one behind the whole show (or behind the selected slides), without a trip to
    // the Media tab. Shift+click only sends it to the screen, to try it.
    import { activeShow, dictionary, media, outLocked, outputs, selected, showsCache, special } from "../../stores"
    import { translateText } from "../../utils/language"
    import { videoExtensions } from "../../values/extensions"
    import { setBackgroundAPI } from "../actions/custom/themeApi"
    import MediaLoader from "../drawer/media/MediaLoader.svelte"
    import { openDrawer } from "../edit/scripts/edit"
    import Icon from "../helpers/Icon.svelte"
    import { getExtension, getMedia, getThumbnailPath, mediaSize } from "../helpers/media"
    import { getActiveOutputs, setOutput } from "../helpers/output"
    import { getLayoutRef } from "../helpers/show"
    import T from "../helpers/T.svelte"
    import MaterialButton from "../inputs/MaterialButton.svelte"

    $: showId = $activeShow?.id || ""
    $: show = $showsCache[showId]
    $: collapsed = !!$special.backgroundTrayCollapsed
    function toggle() {
        special.update((a) => ({ ...a, backgroundTrayCollapsed: !collapsed }))
    }

    const fileName = (path: string) => path.split(/[\\/]/).pop() || path
    const isMedia = (path: string) => !!path && !/^(https?:|data:|blob:)/.test(path)

    // this show's own backgrounds first, then the favourites, each file once
    $: list = getList(show, $media)
    function getList(..._updaters: any[]) {
        const used = Object.values(show?.media || {})
            .filter((item: any) => item?.path && (item.type === "video" || item.type === "image" || !item.type))
            .map((item: any) => item.path as string)
        const favourites = Object.entries($media)
            .filter(([, style]) => style?.favourite === true && style.audio !== true)
            .map(([path]) => path)
        const paths = [...used, ...favourites].filter(isMedia)
        return paths.filter((path, index) => paths.indexOf(path) === index).map((path) => ({ path, name: fileName(path), video: videoExtensions.includes(getExtension(path)), used: used.includes(path) }))
    }

    // thumbnails are made the first time a file is seen: until then the path they will have is used
    let thumbnails: { [path: string]: string } = {}
    $: list.forEach((item) => loadThumbnail(item.path))
    async function loadThumbnail(path: string) {
        if (thumbnails[path] !== undefined) return
        thumbnails[path] = ""
        const loaded = await getMedia(path, mediaSize.drawerSize)
        if (loaded?.thumbnail) thumbnails = { ...thumbnails, [path]: loaded.thumbnail }
    }

    // the background of the selected slides, or the one every slide shares
    $: selection = $selected.id === "slide" && $selected.data?.length ? ($selected.data as { index?: number }[]) : null
    $: activePath = getActivePath(show, selection)
    function getActivePath(..._updaters: any[]) {
        if (!show) return ""
        const ref = getLayoutRef(showId)
        const targets = selection ? selection.map((slide) => ref[slide.index ?? -1]).filter(Boolean) : ref
        const paths = targets.map((entry) => show.media?.[entry.data?.background || ""]?.path || "")
        return paths.length && paths.every((path) => path === paths[0]) ? paths[0] : ""
    }

    $: outputId = getActiveOutputs($outputs, true, true, true)[0] || ""
    $: isLive = $outputs[outputId]?.out?.slide?.id === showId

    function toOutput(path: string, video: boolean) {
        if ($outLocked) return
        setOutput("background", { path, type: video ? "video" : "image", loop: true, muted: true })
    }

    async function pick(e: any, item: { path: string; video: boolean }) {
        const event: MouseEvent | undefined = e?.detail?.event || e
        if (event?.shiftKey) return toOutput(item.path, item.video)

        const indexes = selection ? selection.map((slide) => (slide.index ?? -1) + 1).filter((number) => number > 0) : undefined
        const keep = selection
        await setBackgroundAPI({ showId, path: item.path, indexes })
        // the show is on screen: change what is behind it now, not at the next slide
        if (isLive) toOutput(item.path, item.video)
        if (keep) setTimeout(() => !$selected.id && selected.set({ id: "slide", data: keep }), 50)
    }

    async function remove() {
        const indexes = selection ? selection.map((slide) => (slide.index ?? -1) + 1).filter((number) => number > 0) : undefined
        await setBackgroundAPI({ showId, path: "", indexes })
    }

    $: hasBackground = show ? getLayoutRef(showId).some((entry) => entry.data?.background) : false
</script>

{#if show}
    <div class="tray" class:collapsed>
        <div class="head">
            <MaterialButton style="padding: 0.2em 0.6em;font-weight: 600;" title={translateText(collapsed ? "actions.backgrounds_show" : "actions.backgrounds_hide", $dictionary)} on:click={toggle}>
                <Icon id="image" size={1} white />
                <span><T id="actions.backgrounds" /></span>
                <Icon id={collapsed ? "arrow_up" : "arrow_down"} size={1} white />
            </MaterialButton>
            {#if !collapsed}
                <span class="target">
                    {#if selection}{translateText("actions.themes_applies_selected", $dictionary, [String(selection.length)])}{:else}<T id="actions.themes_applies_show" />{/if}
                </span>
                <MaterialButton style="padding: 0.2em 0.6em;flex: none;" icon="remove_circle" disabled={!hasBackground} on:click={remove}>
                    <T id="actions.backgrounds_remove" />
                </MaterialButton>
                <MaterialButton style="padding: 0.2em 0.6em;flex: none;" icon="media" title={translateText("actions.backgrounds_more_tip", $dictionary)} on:click={() => openDrawer("media")}>
                    <T id="actions.backgrounds_more" />
                </MaterialButton>
            {/if}
        </div>

        {#if !collapsed}
            {#if list.length}
                <div class="strip">
                    {#each list as item (item.path)}
                        <button class="thumb" class:active={item.path === activePath} title="{item.name} — {translateText('actions.backgrounds_tip', $dictionary)}" on:click={(e) => pick(e, item)}>
                            <div class="picture">
                                {#key thumbnails[item.path]}
                                    <MediaLoader name={item.name} path={item.path} thumbnailPath={thumbnails[item.path] || getThumbnailPath(item.path, mediaSize.drawerSize)} type={item.video ? "video" : "image"} />
                                {/key}
                            </div>
                            {#if item.video}<span class="badge"><Icon id="movie" size={0.75} white /></span>{/if}
                            <span class="name">{item.name}</span>
                        </button>
                    {/each}
                </div>
            {:else}
                <p class="empty"><T id="actions.backgrounds_empty" /></p>
            {/if}
        {/if}
    </div>
{/if}

<style>
    .tray {
        flex: none;
        display: flex;
        flex-direction: column;
        background-color: var(--primary-darker);
        border-top: 2px solid var(--primary-lighter);
    }
    .head {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 2px 4px;
    }
    .head span:not(.target) {
        margin: 0 4px;
    }
    .target {
        flex: 1;
        min-width: 0;
        font-size: 0.8em;
        opacity: 0.6;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .strip {
        display: flex;
        gap: 6px;
        padding: 2px 8px 8px;
        overflow-x: auto;
    }
    .thumb {
        position: relative;
        flex: 0 0 132px;
        display: flex;
        flex-direction: column;
        padding: 0;
        color: var(--text);
        font: inherit;
        background-color: var(--primary-darkest);
        border: 2px solid transparent;
        border-radius: 6px;
        overflow: hidden;
        cursor: pointer;
    }
    .thumb:hover {
        border-color: var(--primary-lighter);
    }
    .thumb.active {
        border-color: var(--secondary);
    }
    .picture {
        width: 100%;
        aspect-ratio: 16 / 9;
        background-color: #000;
        pointer-events: none;
    }
    .name {
        padding: 2px 6px;
        font-size: 0.75em;
        text-align: center;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .badge {
        position: absolute;
        top: 4px;
        inset-inline-end: 4px;
        display: flex;
        padding: 2px;
        background-color: rgb(0 0 0 / 0.6);
        border-radius: 4px;
    }

    .empty {
        padding: 6px 12px 10px;
        font-size: 0.85em;
        opacity: 0.6;
        white-space: normal;
    }
</style>
