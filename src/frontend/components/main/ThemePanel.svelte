<script lang="ts">
    // Fork feature: ProPresenter-style "Themes" button in the top bar.
    // Opens a floating panel: folders (template categories) -> theme thumbnails.
    // Click a thumbnail to apply it to the selected slides, or to the whole show when none are selected.
    import { activeDrawerTab, activeEdit, activePage, activeShow, dictionary, groups, labelsDisabled, outputs, selected, showsCache, styles, templateCategories, templates } from "../../stores"
    import { translateText } from "../../utils/language"
    import Card from "../drawer/Card.svelte"
    import TemplateSlide from "../drawer/pages/TemplateSlide.svelte"
    import { clone, keysToID, sortByName } from "../helpers/array"
    import Icon from "../helpers/Icon.svelte"
    import { getResolution } from "../helpers/output"
    import { applyShowTheme, applySlideTheme, applyThemePackage, getActiveThemeId, getThemeMap, getThemeRoles, getThemeTemplates, REMOVE_SLIDE_THEME, setThemeRole, THEME_ROLE_DEFAULT, THEME_ROLE_FIRST } from "../helpers/slideTheme"
    import T from "../helpers/T.svelte"
    import MaterialButton from "../inputs/MaterialButton.svelte"

    const UNCATEGORIZED = "__uncategorized__"

    let open = false
    let category: string | null = null // null = folder list
    let editMode = false
    let mapping = false // "assign groups" view of a theme package

    $: isShowActive = !!$activeShow?.id && ($activeShow.type || "show") === "show" && !!$showsCache[$activeShow.id]
    $: if (!isShowActive) open = false

    $: slideSelection = $selected.id === "slide" && $selected.data?.length ? ($selected.data as { index?: number }[]) : null
    // re-read when the show or the selection changes
    $: activeThemeId = isShowActive && $showsCache ? getActiveThemeId(slideSelection) : ""

    $: resolution = getResolution(null, { $outputs, $styles })

    // templates grouped by category, archived categories and text-only templates left out
    $: grouped = groupTemplates($templates, $templateCategories)
    function groupTemplates(..._updaters: any[]) {
        const categories = $templateCategories
        const list = sortByName(keysToID(clone($templates))).filter((t) => t?.settings?.mode !== "text" && !categories[t.category || ""]?.isArchive)

        const byCategory: { [key: string]: typeof list } = {}
        list.forEach((t) => {
            const key = t.category && categories[t.category] ? t.category : UNCATEGORIZED
            if (!byCategory[key]) byCategory[key] = []
            byCategory[key].push(t)
        })

        const folders = sortByName(keysToID(clone(categories)))
            .filter((c) => byCategory[c.id])
            .map((c) => ({ id: c.id, name: c.default ? translateText(c.name, $dictionary) : c.name, icon: c.icon || "folder", count: byCategory[c.id].length }))
        if (byCategory[UNCATEGORIZED]) folders.push({ id: UNCATEGORIZED, name: translateText("category.unlabeled", $dictionary), icon: "folder", count: byCategory[UNCATEGORIZED].length })

        return { byCategory, folders }
    }

    // with a single folder there is nothing to choose, go straight to the thumbnails
    $: singleFolder = grouped.folders.length === 1 ? grouped.folders[0].id : null
    $: currentCategory = category ?? singleFolder
    $: currentFolder = grouped.folders.find((f) => f.id === currentCategory)
    $: themes = currentCategory ? grouped.byCategory[currentCategory] || [] : []
    $: if (currentCategory !== undefined) mapping = false

    // THEME PACKAGES: a real category is a theme, each template a "theme slide"
    $: packageId = currentCategory && currentCategory !== UNCATEGORIZED ? currentCategory : ""
    $: themeMap = packageId && $templateCategories && $templates ? getThemeMap(packageId) : null
    $: packageTemplates = packageId && $templates ? getThemeTemplates(packageId) : []
    $: roles = $groups ? getThemeRoles() : []

    function roleLabel(role: string) {
        if (role === THEME_ROLE_FIRST) return translateText("actions.theme_role_first", $dictionary)
        if (role === THEME_ROLE_DEFAULT) return translateText("actions.theme_role_default", $dictionary)
        const group = $groups[role]
        if (!group) return role
        return group.default ? translateText("groups." + group.name, $dictionary) : group.name
    }

    function roleChange(role: string, e: Event) {
        if (!packageId) return
        setThemeRole(packageId, role, (e.currentTarget as HTMLSelectElement).value)
    }

    function toggle() {
        open = !open
        if (open) editMode = mapping = false
    }

    function themeClick(templateId: string) {
        if (editMode) {
            activeDrawerTab.set("templates")
            activeEdit.set({ type: "template", id: templateId, items: [] })
            activePage.set("edit")
            open = false
            return
        }

        if (slideSelection) applySlideTheme(templateId, slideSelection)
        else applyShowTheme(templateId)
    }

    function removeTheme() {
        if (slideSelection) applySlideTheme(REMOVE_SLIDE_THEME, slideSelection)
    }

    function windowMousedown(e: MouseEvent) {
        if (!open) return
        const target = e.target as HTMLElement | null
        if (target?.closest(".themePanelWrap") || target?.closest(".contextMenu") || target?.closest(".popup")) return
        open = false
    }

    function keydown(e: KeyboardEvent) {
        if (open && e.key === "Escape") open = false
    }
</script>

<svelte:window on:mousedown={windowMousedown} on:keydown={keydown} />

<!-- "menus" keeps the slide selection alive when clicking in here (see SelectElem deselect) -->
<div class="themePanelWrap menus">
    <MaterialButton style="border-radius: 0;border-bottom: 2px solid var(--primary);{!$labelsDisabled ? 'padding: 0.3em 1.2em;' : ''}" title={translateText("actions.themes", $dictionary)} isActive={open} disabled={!isShowActive} on:click={toggle}>
        <Icon id="templates" size={1.5} white={open} />
        {#if !$labelsDisabled}<span class="label"><T id="actions.themes" /></span>{/if}
    </MaterialButton>

    {#if open}
        <div class="panel" role="dialog">
            <div class="header">
                {#if currentCategory && !singleFolder}
                    <MaterialButton title={translateText("actions.back", $dictionary)} on:click={() => (category = null)}>
                        <Icon id="back" size={1.3} white />
                    </MaterialButton>
                {:else}
                    <div class="spacer" />
                {/if}

                <h3>{currentFolder ? currentFolder.name : translateText("actions.themes", $dictionary)}</h3>

                <MaterialButton title={translateText("actions.themes_edit_mode", $dictionary)} isActive={editMode} on:click={() => (editMode = !editMode)}>
                    <Icon id="edit" size={1.2} white={editMode} />
                </MaterialButton>
            </div>

            <div class="target" class:editing={editMode}>
                {#if editMode}
                    <T id="actions.themes_edit_hint" />
                {:else if slideSelection}
                    {translateText("actions.themes_applies_selected", $dictionary, [String(slideSelection.length)])}
                {:else}
                    <T id="actions.themes_applies_show" />
                {/if}
            </div>

            <div class="content">
                {#if !grouped.folders.length}
                    <p class="empty"><T id="empty.general" /></p>
                {:else if !currentCategory}
                    {#each grouped.folders as folder (folder.id)}
                        <button class="folder" on:click={() => (category = folder.id)}>
                            <Icon id={folder.icon} size={1.2} white />
                            <span class="name">{folder.name}</span>
                            <span class="count">{folder.count}</span>
                            <Icon id="arrow_right" size={1.1} white />
                        </button>
                    {/each}
                {:else}
                    {#if packageId && !editMode}
                        <div class="package">
                            <MaterialButton variant="outlined" icon="templates" disabled={!isShowActive || !themeMap || !Object.keys(themeMap.map).length} title={translateText("actions.theme_apply_package_tip", $dictionary)} on:click={() => applyThemePackage(packageId)} small>
                                <T id="actions.theme_apply_package" />
                            </MaterialButton>
                            <MaterialButton icon="groups" isActive={mapping} on:click={() => (mapping = !mapping)} small>
                                <T id="actions.theme_assign_groups" />
                            </MaterialButton>
                        </div>
                    {/if}
                {/if}
                {#if currentCategory && mapping && packageId && !editMode}
                    {#if themeMap?.guessed}
                        <p class="hint"><T id="actions.theme_map_guessed" /></p>
                    {/if}
                    <div class="mapping">
                        {#each roles as role (role)}
                            <label class="row">
                                <span class="role">{roleLabel(role)}</span>
                                <select value={themeMap?.map[role] || ""} on:change={(e) => roleChange(role, e)}>
                                    <option value="">{role === THEME_ROLE_DEFAULT ? "—" : translateText("actions.theme_role_unset", $dictionary)}</option>
                                    {#each packageTemplates as t (t.id)}
                                        <option value={t.id}>{t.name}</option>
                                    {/each}
                                </select>
                            </label>
                        {/each}
                    </div>
                {:else if currentCategory}
                    <div class="grid">
                        {#each themes as theme (theme.id)}
                            <div class="tile">
                                <Card width={100} label={theme.name} color={theme.color} active={theme.id === activeThemeId} {resolution} on:click={() => themeClick(theme.id)}>
                                    <TemplateSlide templateId={theme.id} template={theme} preview />
                                </Card>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>

            {#if slideSelection && !editMode}
                <div class="footer">
                    <MaterialButton icon="remove_circle" disabled={!activeThemeId} on:click={removeTheme}>
                        <T id="actions.remove_slide_theme" />
                    </MaterialButton>
                </div>
            {/if}
        </div>
    {/if}
</div>

<style>
    .themePanelWrap {
        position: relative;
        display: flex;
    }

    .panel {
        position: absolute;
        top: 100%;
        inset-inline-end: 0;
        z-index: 40;

        width: 520px;
        max-width: 90vw;
        max-height: 70vh;
        display: flex;
        flex-direction: column;

        background-color: var(--primary-darker);
        border: 1px solid var(--primary-lighter);
        border-radius: 0 0 8px 8px;
        box-shadow: 0 6px 18px rgb(0 0 0 / 0.5);

        -webkit-app-region: no-drag;
    }

    .header {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 6px;
        border-bottom: 1px solid var(--primary-lighter);
    }
    .header h3 {
        flex: 1;
        text-align: center;
        font-size: 1.05em;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .spacer {
        width: 36px;
    }

    .target {
        padding: 5px 12px;
        font-size: 0.85em;
        opacity: 0.7;
    }
    .target.editing {
        opacity: 1;
        color: var(--secondary);
    }

    .content {
        flex: 1;
        overflow-y: auto;
        padding: 4px 6px 8px;
    }

    .folder {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 8px 10px;

        background: none;
        border: none;
        border-radius: 5px;
        color: var(--text);
        font: inherit;
        text-align: start;
        cursor: pointer;
    }
    .folder:hover {
        background-color: rgb(255 255 255 / 0.06);
    }
    .folder .name {
        flex: 1;
    }
    .folder .count {
        opacity: 0.5;
        font-size: 0.85em;
    }

    .grid {
        display: flex;
        flex-wrap: wrap;
    }
    .tile {
        width: 33.33%;
    }

    .empty {
        padding: 20px;
        text-align: center;
        opacity: 0.6;
    }

    .footer {
        display: flex;
        justify-content: flex-end;
        padding: 4px 6px;
        border-top: 1px solid var(--primary-lighter);
    }

    .package {
        display: flex;
        gap: 6px;
        padding: 2px 4px 8px;
        flex-wrap: wrap;
    }

    .hint {
        padding: 0 6px 6px;
        font-size: 0.8em;
        opacity: 0.6;
    }

    .mapping {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 0 4px;
    }
    .mapping .row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 4px 6px;
        border-radius: 5px;
    }
    .mapping .row:hover {
        background-color: rgb(255 255 255 / 0.04);
    }
    .mapping .role {
        width: 40%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .mapping select {
        flex: 1;
        padding: 4px 6px;
        background-color: var(--primary-darkest, var(--primary-darker));
        color: var(--text);
        border: 1px solid var(--primary-lighter);
        border-radius: 4px;
        font: inherit;
    }

    @media screen and (max-width: 750px) {
        .label {
            display: none;
        }
    }
</style>
