// https://nuxt.com/docs/api/configuration/nuxt-config
import {defineQuasarConfig} from './quasar.config'
import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
    app: {
        baseURL: process.env.NUXT_APP_BASE_URL || '/',
        head: {
            title: 'ZOO-Project Nuxt Client',
            meta: [
                {
                    name: 'description',
                    content: 'ZOO-Project WebApp Client Made with Nuxt3 and VueJS 3.'
                }
            ],
            link: [
                {rel: 'stylesheet', href: 'https://fonts.googleapis.com/icon?family=Material+Icons'}
            ]
        },
    },
    compatibilityDate: '2024-12-31',
    devtools: {enabled: true},
    components: true,
    imports: {
        dirs: [
            // Scan top-level modules
            'composables',
            // ... or scan all modules within given directory
            'composables/**',
        ]
    },
    quasar: defineQuasarConfig(),
    vue: {
        compilerOptions: {}
    },
    vite: {
        optimizeDeps: {
            // CommonJS libraries behind the workflow graph (components/common/CwlGraph.vue)
            include: [
                'cwl-svg/src/graph/workflow',
                'cwl-svg/src/plugins/arrange/arrange',
                'cwl-svg/src/plugins/edge-hover/edge-hover',
                'cwl-svg/src/plugins/node-move/node-move',
                'cwl-svg/src/plugins/selection/selection',
                'cwl-svg/src/plugins/zoom/zoom',
                'cwl-svg/src/utils/svg-dumper',
                'cwlts/models'
            ]
        }
    },
    modules: ["@pinia/nuxt", "nuxt-quasar-ui", "@sidebase/nuxt-auth","@nuxtjs/i18n"],

    nitro: {
        // @sidebase/nuxt-auth 0.9 imports `next-auth/core`, no longer exported by next-auth 4.22+:
        // see server/shims/next-auth-core.mjs. The core files must be traced into the server
        // bundle's node_modules since nothing else in the bundle references them.
        alias: {
            'next-auth/core': fileURLToPath(new URL('./server/shims/next-auth-core.mjs', import.meta.url)),
        },
        externals: {
            traceInclude: [fileURLToPath(new URL('./node_modules/next-auth/core/index.js', import.meta.url))],
        },
    },

    i18n: {
        langDir: 'locales',
        locales: [
          { code: 'en-US', iso: 'en-US', file: 'en.json', name: 'English' },
          { code: 'fr-FR', iso: 'fr-FR', file: 'fr.json', name: 'Français' }
        ],
        defaultLocale: 'en-US',
        lazy: true,
        strategy: 'no_prefix',
        detectBrowserLanguage: {
          useCookie: true,
          cookieKey: 'i18n_redirected',
          fallbackLocale: 'en-US',
        }
      },
       

    auth: {
        isEnabled: true,
        disableServerSideAuth: false,
        originEnvKey: 'AUTH_ORIGIN',

        provider: {
            type: 'authjs',
            trustHost: true,
        },
        sessionRefresh: {
            enablePeriodically: false,
            enableOnWindowFocus: true,
        },

    },
    runtimeConfig: {
        authSecret: process.env.NUXT_AUTH_SECRET,
        public: {
            quasarBrand: defineQuasarConfig().config.brand,
            NUXT_ZOO_BASEURL: process.env.NUXT_ZOO_BASEURL,
            NUXT_OIDC_ISSUER: process.env.NUXT_OIDC_ISSUER,
            NUXT_OIDC_CLIENT_ID: process.env.NUXT_OIDC_CLIENT_ID,
            AUTH_ORIGIN: process.env.AUTH_ORIGIN,
            NEXTAUTH_URL: process.env.NEXTAUTH_URL,
            ZOO_OGCAPI_REQUIRES_BEARER_TOKEN: process.env.ZOO_OGCAPI_REQUIRES_BEARER_TOKEN,
            ZOO_IAM_ENABLED: process.env.ZOO_IAM_ENABLED,
            NUXT_WS_URL: process.env.NUXT_WS_URL,
            SUBSCRIBERURL: process.env.SUBSCRIBERURL,
        },
    }
})
