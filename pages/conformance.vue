<template>
  <q-page class="q-pa-md">
    <div class="row justify-center">
      <div class="col-12" style="max-width: 800px;">
        <p class="text-h4 q-mb-md text-weight-bold">{{ t('Conformance Classes') }}</p>

        <q-card class="q-pa-md shadow-2 rounded-borders">
          <q-card-section>
            <p class="text-body1 q-mb-md">
              {{ t('Below are the supported conformance classes for this API:') }}
            </p>
            <q-list bordered separator>
              <q-item
                v-for="(link, index) in conformanceLinks"
                :key="index"
                clickable
                tag="a"
                :href="link"
                target="_blank"
              >
                <q-item-section>{{ link }}</q-item-section>
              </q-item>
            </q-list>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

const conformanceLinks = ref([])
const { locale, t } = useI18n()
const { buildOgcApiUrl, getRequestHeaders } = useOgcApiServer()


onMounted(async () => {
  try {
    const headers = getRequestHeaders(locale.value)
    const conformanceUrl = await buildOgcApiUrl('/conformance', {
      acceptLanguage: locale.value,
      preferOpenApiServer: true
    })

    const response = await fetch(conformanceUrl, {
      headers
    })

    const data = await response.json()
    conformanceLinks.value = data.conformsTo || []
  } catch (error) {
    console.error('Error fetching conformance classes:', error)
  }
})
</script>
