<template>
  <q-layout view="hHh LpR fFf">
    <q-page-container>
      <q-page class="flex flex-center">
        <q-card flat bordered class="q-pa-lg text-center" style="max-width: 520px">
          <q-icon :name="is404 ? 'search_off' : 'error_outline'" size="64px" color="primary" />
          <div class="text-h4 text-weight-bold q-mt-md">{{ error?.statusCode || 500 }}</div>
          <div class="text-subtitle1 q-mt-sm">
            {{ is404 ? t('This page does not exist.') : (error?.statusMessage || error?.message || t('Something went wrong.')) }}
          </div>
          <div class="q-mt-lg q-gutter-sm">
            <q-btn color="primary" icon="home" :label="t('Home')" @click="goHome" />
            <q-btn flat color="primary" icon="list" :label="t('Processes')" @click="goTo('/processes')" />
            <q-btn flat color="primary" icon="work" :label="t('Jobs')" @click="goTo('/jobs')" />
          </div>
        </q-card>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ error?: any }>()
const { t } = useI18n()
const is404 = computed(() => Number(props.error?.statusCode) === 404)
const goHome = () => clearError({ redirect: '/' })
const goTo = (path: string) => clearError({ redirect: path })
</script>
