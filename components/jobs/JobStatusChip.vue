<template>
  <q-chip
    :color="color"
    text-color="white"
    :icon="icon"
    dense
    square
    class="job-status-chip"
  >
    {{ label }}
  </q-chip>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { normalizeStatus, statusColor, statusIcon } from '~/composables/utils/jobs'

const props = defineProps<{ status?: string | null }>()
const { t } = useI18n()
const normalized = computed(() => normalizeStatus(props.status))
const color = computed(() => statusColor(normalized.value))
const icon = computed(() => statusIcon(normalized.value))
const label = computed(() => (normalized.value ? t(`status.${normalized.value}`, normalized.value) : t('status.unknown')))
</script>

<style scoped>
.job-status-chip {
  font-weight: 600;
  letter-spacing: 0.2px;
}
</style>
