<script lang="ts">
    // Fork feature: one visible button for the service view (FreeShow's focus mode plus the
    // "now / next" panel of ServicePanel.svelte), instead of only a shortcut.
    import { activeProject, dictionary, focusMode, projects } from "../../stores"
    import { translateText } from "../../utils/language"
    import { menuClick } from "../context/menuClick"
    import Icon from "../helpers/Icon.svelte"
    import MaterialButton from "../inputs/MaterialButton.svelte"

    $: hasItems = !!$projects[$activeProject || ""]?.shows?.length
</script>

<!-- icon only, like the buttons next to it: the top bar has no room for one more label -->
<MaterialButton style="border-radius: 0;border-bottom: 2px solid var(--primary);padding: 0.3em 0.9em;" title="{translateText(hasItems ? 'actions.service_view_tip' : 'empty.project_select', $dictionary)} [Ctrl+Shift+F]" isActive={$focusMode} on:click={() => menuClick("focus_mode")}>
    <Icon id="focus_mode" size={1.5} white={$focusMode} />
</MaterialButton>
