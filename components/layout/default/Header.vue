<template>
  <q-header bordered>
    <q-toolbar class="bg-white text-grey-10 justify-between">
      <div class="col-auto">
        <div class="row">

          <div class="col-auto">
            <NuxtLink to="/">
              <q-avatar square >
                <q-img src="https://zoo-project.org/images/zoo-sun-logo-big.png" width="128"/>
              </q-avatar>

            </NuxtLink>
          </div>
          <div class="col-auto q-pl-xs q-pt-xs" v-show="!isSmallScreen">
            <span class="q-pl-xs text-h6 ">
              <NuxtLink to="/" class="text-grey-10" style="text-decoration: none;">
                Zoo-Project
              </NuxtLink>
            </span>
          </div>
        </div>
      </div>
      <div :class="['q-px-sm', isSmallScreen ? '' : 'col-5'] ">

      </div>
      <div class="col-auto">
         <div class="row items-center"> 
          <SettingsMenu />

          <div v-if="!authStore.user && authConfigured" class="row items-center no-wrap">
            <q-chip v-if="authStore.sessionExpired" dense color="warning" text-color="black" icon="schedule" class="q-mr-sm">
              {{ t('Session expired') }}
            </q-chip>
            <q-btn v-if="isSmallScreen" class="q-px-sm" dense no-caps color="accent" round
                   icon="mdi-account-circle" @click="login"/>
            <q-btn v-else class="q-px-md" no-caps color="accent" :label="t('Authenticate')"
                   @click="login"/>
          </div>
          <div v-else-if="authStore.user" class="row items-center no-wrap">
            <span v-if="!isSmallScreen" class="text-grey-8 q-mr-xs ellipsis" style="max-width: 180px">
              {{ authStore.user.name || authStore.user.email }}
            </span>
            <q-btn rounded dense flat>
              <q-avatar>
                <img :src="gravatarUrl" :alt="authStore.user.email || ''">
              </q-avatar>
              <q-menu>
                <q-list dense style="min-width: 200px">
                  <q-item>
                    <q-item-section>
                      <q-item-label class="text-weight-bold">{{ authStore.user.name || '—' }}</q-item-label>
                      <q-item-label caption>{{ authStore.user.email }}</q-item-label>
                    </q-item-section>
                  </q-item>
                  <q-separator/>
                  <q-item clickable v-close-popup
                    :href="`${config.public.NUXT_OIDC_ISSUER}/account/?referrer=${config.public.NUXT_OIDC_CLIENT_ID}&referrer_uri=${config.public.AUTH_ORIGIN}`"
                    target="_blank" rel="noopener">
                    <q-item-section avatar><q-icon name="manage_accounts" /></q-item-section>
                    <q-item-section>{{ t('Profile') }}</q-item-section>
                  </q-item>
                  <q-item clickable v-close-popup @click="showLogoutDialog">
                    <q-item-section avatar><q-icon name="logout" /></q-item-section>
                    <q-item-section>{{ t('Logout') }}</q-item-section>
                  </q-item>
                </q-list>
              </q-menu>
            </q-btn>
          </div>
        </div>
      </div>
    </q-toolbar>
<!-- One non-wrapping row: on narrow screens the tabs shrink and scroll
     (arrows) instead of wrapping onto two lines and clipping the last one. -->
<div class="row no-wrap items-center">
  <div class="col-auto">
    <q-tabs dense align="left" shrink>
      <q-route-tab
        v-for="tab in homeTab"
        :key="tab.path"
        :to="tab.path"
        exact
        :label="t(tab.label)"
        no-caps
      />
    </q-tabs>
  </div>
  <q-space/>
  <div class="col" style="min-width: 0">
    <q-tabs dense align="right" shrink mobile-arrows outside-arrows>
      <q-route-tab
        v-for="tab in rightTabs"
        :key="tab.path"
        :label="t(tab.label)"
        :to="tab.path"
        no-caps
      />
    </q-tabs>
  </div>
</div>


  </q-header>
</template>

<script setup lang="ts">
import SettingsMenu from '~/components/layout/shared/SettingsMenu.vue'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCookie } from '#app'
import { useAuthStore } from '~/stores/auth'
import { useLandingLinks } from '~/composables/utils/useLandingLinks'

const config = useRuntimeConfig()
const { authConfigured } = useOgcApiServer()


const authStore = useAuthStore()
const { landingLinks } = useLandingLinks()
// Get baseURL from app config
const { $config } = useNuxtApp()
const baseURL = $config.app.baseURL || '/'
const authBase = (config.public.AUTH_ORIGIN || '').replace(/\/$/, '') || ''




const { locale, t } = useI18n()


const $q = useQuasar()
const stringToMD5 = useStringToMD5()

const isProcessing = ref(false)
const router = useRouter()
const { signOut, signIn } = useAuth()
// Go straight to the identity provider instead of the generic authjs sign-in page.
const login = () => signIn('keycloak', { callbackUrl: window.location.href })

const gravatarUrl = ref('https://www.gravatar.com/avatar/46d229b033af06a191ff2267bca9ae56/?d=identicon')

const updateGravatar = (email?: string) => {
  if (!email) return
  const hash = stringToMD5(email.trim().toLowerCase())
  gravatarUrl.value = `https://www.gravatar.com/avatar/${hash}?d=identicon`
}




const selfHref = computed(() => {
  const selfLink = landingLinks.value.find(link => link.rel === 'self')
  return selfLink?.href || ''
})


function rewriteHref(href: string): string {
  if (!selfHref.value) return href
  let relative = href.replace(selfHref.value, '') 


  if (relative === 'api') relative = 'swagger'

  // Add baseURL prefix
  return baseURL === '/' ? `/${relative}` : `${baseURL}/${relative}`
}

// helper to generate labels
function autoLabel(href: string, rel?: string): string {
  if (rel === 'service-desc') return 'Swagger'
  const filename = href.split('/').pop()?.replace('.html', '') || ''
  return filename.charAt(0).toUpperCase() + filename.slice(1)
}



const homeTab = computed(() =>
  landingLinks.value
    .filter(link => link.href && link.href.endsWith('index.html'))
    .map(link => ({
      path: baseURL === '/' ? '/' : baseURL, // use baseURL for Home
      label: 'Home'
    }))
)

const rightTabs = computed(() =>
  landingLinks.value
    .filter(link =>
      link.href &&
      !link.href.endsWith('index.html') &&
      !link.href.endsWith('/') && 
      !link.href.includes('index') && 
      (
        link.type === 'application/json' ||
        link.rel === 'service-desc'
      )
    )
    .map(link => ({
      path: rewriteHref(link.href),
      label: autoLabel(link.href, link.rel)
    }))
)


const isSmallScreen = computed(() => {
  return $q.screen.width <= $q.screen.sizes.sm
})

const showLogoutDialog = () => {
  $q.dialog({
   title: t('Logout'),
    message: t('Are you sure you want to logout?'),
    ok: {
      label: t('Ok'),
      color: 'primary'
    },
    cancel: {
      label: t('Cancel'),
      color: 'negative'
    }
  }).onOk(() => {
    handleLogout()
  })
}

const handleLogout = async () => {
  isProcessing.value = true
  try {
    const callbackUrl = process.client
      ? window.location.origin
      : (authBase || baseURL || '/')

    // 1) Invalidate NextAuth session + cookies (same origin)
    try {
      await fetch('/api/auth/signout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ callbackUrl }),
        credentials: 'include',
      })
    } catch (e) {
      console.warn('signout fetch failed', e)
    }
    await signOut({ redirect: false, callbackUrl })

    // 2) End Keycloak session via redirect (complete SSO logout)
    const token = authStore.token
    authStore.clearAuth()
    
    if (process.client && token?.id_token) {
      const logoutUrl = `${config.public.NUXT_OIDC_ISSUER}/protocol/openid-connect/logout`
      const params = new URLSearchParams({
        id_token_hint: token.id_token,
        post_logout_redirect_uri: callbackUrl,
        client_id: config.public.NUXT_OIDC_CLIENT_ID,
      })
      // Redirect to Keycloak for complete SSO logout
      window.location.href = `${logoutUrl}?${params.toString()}`
    } else if (process.client) {
      // Fallback: simple reload if no token
      window.location.href = callbackUrl
    }
  } catch (error) {
    console.error(error)
  } finally {
    isProcessing.value = false
  }
}

watch(() => authStore.user?.email, (email) => {
  updateGravatar(email)
}, { immediate: true })

// Tell the user once when the session died (expired token that could not be refreshed).
watch(() => authStore.sessionExpired, (expired) => {
  if (!expired || !import.meta.client) return
  $q.notify({
    type: 'warning',
    timeout: 10000,
    message: t('Your session has expired. Sign in again to keep using your account.'),
    actions: [{ label: t('Authenticate'), color: 'black', handler: login }]
  })
})

onMounted(() => {
  updateGravatar(authStore.user?.email)
})

</script>

<style scoped>
</style>
