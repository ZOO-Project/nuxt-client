<template>
  <q-btn
    flat
    dense
    round
    :size="size"
    :icon="copied ? 'check' : 'content_copy'"
    :color="copied ? 'positive' : 'grey-7'"
    :aria-label="label"
    @click.stop="copy"
  >
    <q-tooltip>{{ copied ? t('Copied') : label }}</q-tooltip>
  </q-btn>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { copyToClipboard } from 'quasar'

const props = withDefaults(defineProps<{ text: string; label?: string; size?: string }>(), {
  label: 'Copy',
  size: 'sm'
})
const { t } = useI18n()
const copied = ref(false)

const copy = async () => {
  try {
    await copyToClipboard(props.text)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch (err) {
    console.error('copy failed', err)
  }
}
</script>
