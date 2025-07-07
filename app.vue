<template>
  <NuxtRouteAnnouncer/>
  <NuxtLayout>
    <NuxtPage/>
  </NuxtLayout>
</template>
<script setup lang="ts">
import { useLangStore } from '~/stores/lang'
const langStore = useLangStore()

langStore.initLanguage()
</script>

<style>
.q-card,
.q-table,
.q-btn,
.q-btn-dropdown,
.q-dialog__inner,
.q-item,
.q-menu {
  border-radius: 12px !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06); 
}

.q-page {
  background: #f9f9f9; 
}

.hoverable-link {
  transition: background-color 0.3s ease;
  border-radius: 8px;
  padding: 6px 12px;
}

.hoverable-link:hover {
  background-color: #f5f5f5; /* soft hover effect */
}

.map {
  border: 1px solid #ccc;
  margin-top: 20px;
}

</style>