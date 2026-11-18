<script lang="ts">
    // Fork feature: the service view's "now / next" panel, under the preview while in focus mode.
    // For whoever only runs the service: what is on screen, what comes next, the clock, and big
    // buttons to go forward, back, clear, and leave.
    import { onDestroy } from "svelte"
    import { activeProject, dictionary, focusMode, groups, outLocked, outputs, projects, shows, showsCache } from "../../stores"
    import { translateText } from "../../utils/language"
    import { getTextLines } from "../edit/scripts/textStyle"
    import Icon from "../helpers/Icon.svelte"
    import { getActiveOutputs } from "../helpers/output"
    import { OutputHelper } from "../helpers/OutputHelper"
    import { _show } from "../helpers/shows"
    import T from "../helpers/T.svelte"
    import MaterialButton from "../inputs/MaterialButton.svelte"
    import { clearAll } from "../output/clear"

    let now = new Date()
    const clock = setInterval(() => (now = new Date()), 1000)
    onDestroy(() => clearInterval(clock))
    const two = (value: number) => value.toString().padStart(2, "0")
    $: time = `${two(now.getHours())}:${two(now.getMinutes())}`
    $: seconds = two(now.getSeconds())

    $: outputId = getActiveOutputs($outputs, true, true, true)[0] || ""
    $: outSlide = $outputs[outputId]?.out?.slide || null
    $: project = $projects[$activeProject || ""]

    type SlideInfo = { group: string; color: string; text: string } | null

    $: info = getInfo(outSlide, $showsCache, project)
    function getInfo(..._updaters: any[]) {
        const empty = { name: "", current: null as SlideInfo, next: null as SlideInfo, index: 0, total: 0, nextItem: "" }
        if (!outSlide?.id) return { ...empty, nextItem: itemName(project?.shows?.[0]) }

        const show = $showsCache[outSlide.id]
        const ref = _show(outSlide.id).layouts([outSlide.layout]).ref()[0] || []
        const describe = (index: number): SlideInfo => {
            const entry = ref[index]
            const slide = show?.slides?.[entry?.id]
            if (!slide) return null
            const parent = show.slides[entry.parent?.id || entry.id] || slide
            const group = $groups[parent.globalGroup || ""]
            return {
                group: group ? (group.default ? translateText("groups." + group.name, $dictionary) : group.name) : parent.group || "",
                color: parent.color || group?.color || "",
                text: getTextLines(slide).join("\n")
            }
        }

        const index = outSlide.index ?? 0
        // after the last slide comes the next item of the project
        const items = project?.shows || []
        const showId = outSlide.id
        const position = outSlide.projectIndex ?? items.findIndex((item) => item.id === showId)
        const nextItem = position >= 0 ? itemName(items.slice(position + 1).find((item) => item.type !== "section")) : ""
        return { name: show?.name || "", current: describe(index), next: describe(index + 1), index: index + 1, total: ref.length, nextItem }
    }
    function itemName(item: any) {
        if (!item) return ""
        return $shows[item.id]?.name || item.name || (item.id || "").split(/[\\/]/).pop() || ""
    }
</script>

<div class="service">
    <div class="clock">{time}<small>{seconds}</small></div>

    <div class="block now">
        <div class="title">
            <span><T id="actions.service_now" /></span>
            {#if info.current?.group}<span class="group" style="color: {info.current.color || 'inherit'};">{info.current.group}</span>{/if}
            {#if info.total}<span class="count">{info.index} / {info.total}</span>{/if}
        </div>
        {#if info.name}<div class="name">{info.name}</div>{/if}
        <p class="text">{info.current?.text || translateText("actions.service_nothing", $dictionary)}</p>
    </div>

    <div class="block next">
        <div class="title">
            <span><T id="actions.service_next" /></span>
            {#if info.next?.group}<span class="group" style="color: {info.next.color || 'inherit'};">{info.next.group}</span>{/if}
        </div>
        {#if info.next}
            <p class="text">{info.next.text || "—"}</p>
        {:else if info.nextItem}
            <p class="text item"><Icon id="arrow_right" size={1} white /> {info.nextItem}</p>
        {:else}
            <p class="text">—</p>
        {/if}
    </div>

    <div class="buttons">
        <MaterialButton variant="outlined" style="flex: 1;padding: 1em 0;" title="{translateText('preview._previous_slide', $dictionary)} [←]" disabled={$outLocked} on:click={() => OutputHelper.advanceOutputs("previous")}>
            <Icon id="previous" size={1.8} white />
        </MaterialButton>
        <MaterialButton variant="contained" style="flex: 2;padding: 1em 0;" title="{translateText('preview._next_slide', $dictionary)} [→]" disabled={$outLocked} on:click={() => OutputHelper.advanceOutputs("next")}>
            <Icon id="next" size={1.8} white />
        </MaterialButton>
    </div>
    <div class="buttons">
        <MaterialButton style="flex: 1;" icon="clear" disabled={$outLocked} on:click={() => clearAll(true)}>
            <T id="clear.all" />
        </MaterialButton>
        <MaterialButton style="flex: 1;" icon="close" on:click={() => focusMode.set(false)}>
            <T id="actions.service_exit" />
        </MaterialButton>
    </div>
</div>

<style>
    .service {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 8px;
        overflow-y: auto;
    }

    .clock {
        text-align: center;
        font-size: 2.4em;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        line-height: 1;
    }
    .clock small {
        margin-inline-start: 4px;
        font-size: 0.45em;
        opacity: 0.55;
    }

    .block {
        padding: 8px 10px;
        background-color: var(--primary-darker);
        border-radius: 8px;
        border-inline-start: 4px solid var(--primary-lighter);
    }
    .block.now {
        border-inline-start-color: var(--secondary);
    }
    .title {
        display: flex;
        align-items: baseline;
        gap: 8px;
        font-size: 0.75em;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        opacity: 0.8;
    }
    .title .group {
        text-transform: none;
        letter-spacing: 0;
        font-size: 1.15em;
    }
    .title .count {
        margin-inline-start: auto;
        font-weight: 400;
        opacity: 0.7;
    }
    .name {
        font-size: 0.85em;
        opacity: 0.6;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .text {
        margin-top: 4px;
        white-space: pre-line;
        line-height: 1.25;
        max-height: 7.5em;
        overflow: hidden;
    }
    .now .text {
        font-size: 1.1em;
        font-weight: 600;
    }
    .next .text {
        opacity: 0.85;
    }
    .text.item {
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 600;
    }

    .buttons {
        display: flex;
        gap: 8px;
    }
</style>
