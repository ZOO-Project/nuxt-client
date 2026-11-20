<template>
  <div class="json-block">
    <div class="row items-center q-mb-xs">
      <div class="text-caption text-grey-7">{{ title }}</div>
      <q-space />
      <CopyButton :text="text" :label="t('Copy JSON')" />
    </div>
    <pre class="json-block__pre" :style="{ maxHeight }">{{ text }}</pre>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import CopyButton from '~/components/common/CopyButton.vue'

const props = withDefaults(defineProps<{ value: any; title?: string; maxHeight?: string }>(), {
  title: '',
  maxHeight: '420px'
})
const { t } = useI18n()
const text = computed(() => {
  if (typeof props.value === 'string') return props.value
  try {
    return JSON.stringify(props.value, null, 2)
  } catch {
    return String(props.value)
  }
})
</script>

<style scoped>
.json-block__pre {
  margin: 0;
  padding: 10px 12px;
  background: var(--surface-code, #f4f4f4);
  color: inherit;
  border-radius: 8px;
  overflow: auto;
  font-size: 12.5px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
