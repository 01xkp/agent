<script setup lang="ts">
import { computed, ref } from "vue";
import AgentView from "./AgentView.vue";
import ToolboxView from "./ToolboxView.vue";

type PageKey = "agent" | "toolbox";

const activePage = ref<PageKey>("agent");
const activeView = computed(() =>
  activePage.value === "agent" ? AgentView : ToolboxView,
);
</script>

<template>
  <component
    :is="activeView"
    @open-toolbox="activePage = 'toolbox'"
    @open-agent="activePage = 'agent'"
  ></component>
</template>
