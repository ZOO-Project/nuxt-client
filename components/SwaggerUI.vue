<template>
  <div class="swagger-page">
    <!-- Resolver errors reported by Swagger UI (external $ref documents referencing their own
         #/definitions are resolved against the root document and fail). The built-in panel is
         disabled; this compact banner lists them on demand. -->
    <q-banner
      v-if="resolverErrors.length && !errorsHidden"
      dense
      rounded
      class="swagger-errors q-mb-md"
    >
      <template #avatar>
        <q-icon name="warning_amber" color="warning" />
      </template>
      <div class="row items-center no-wrap">
        <div class="col">
          <span class="text-weight-medium">
            {{ t('{n} reference(s) of the OpenAPI document could not be resolved.', { n: resolverErrors.length }) }}
          </span>
          <span class="text-caption q-ml-sm">{{ t('The documentation remains usable; the affected schemas are shown partially.') }}</span>
        </div>
        <q-btn flat dense no-caps :label="showErrorDetails ? t('Hide details') : t('Details')" @click="showErrorDetails = !showErrorDetails" />
        <q-btn flat dense round icon="close" @click="errorsHidden = true">
          <q-tooltip>{{ t('Hide') }}</q-tooltip>
        </q-btn>
      </div>
      <q-slide-transition>
        <div v-show="showErrorDetails" class="swagger-errors__list q-mt-sm">
          <div v-for="(err, index) in resolverErrors" :key="index" class="swagger-errors__item">
            <div class="text-caption text-weight-medium">{{ err.message }}</div>
            <div class="text-caption swagger-errors__path">{{ err.path }}</div>
          </div>
        </div>
      </q-slide-transition>
    </q-banner>

    <div v-if="loadError" class="q-pa-md">
      <q-banner dense rounded class="bg-red-1 text-negative">
        <template #avatar><q-icon name="error" color="negative" /></template>
        {{ loadError }}
      </q-banner>
    </div>

    <div id="swagger-ui" />
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import SwaggerUI from 'swagger-ui';
import 'swagger-ui/dist/swagger-ui.css';
import { errorSummary } from '~/composables/utils/ogcError';

const { t, locale } = useI18n();
const config = useRuntimeConfig();
const { resolveOpenApiServerBase, getRequestHeaders, waitUntilReady, requiresBearerToken, iamEnabled, apiFetch } = useOgcApiServer();
const loadingBar = useGlobalLoading();

const resolverErrors = ref([]);
const showErrorDetails = ref(false);
const errorsHidden = ref(false);
const loadError = ref('');
let unsubscribe = null;
let collectTimer = null;

// Replace Swagger UI's "Errors" panel with nothing: errors are rendered by the banner above.
const HideErrorsPlugin = () => ({
  components: {
    errors: () => null
  }
});

const collectErrors = (ui) => {
  try {
    const all = ui.errSelectors.allErrors().toJS();
    const seen = new Set();
    const list = [];
    for (const err of all) {
      const message = err.message || String(err);
      const path = Array.isArray(err.fullPath) ? err.fullPath.join('.') : err.path || '';
      const key = `${message}|${path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ message, path, level: err.level || 'error' });
    }
    resolverErrors.value = list;
  } catch (err) {
    console.debug('SwaggerUI: cannot read errors', err);
  }
};

onMounted(async () => {
  const fallback = `${config.public.NUXT_ZOO_BASEURL}/ogc-api`;

  // Auth state hydration can lag a bit on first page load: when a bearer is
  // required, wait briefly so the first OpenAPI request is not redirected to IAM.
  if (requiresBearerToken) {
    await waitUntilReady();
  }

  let serverUrl;
  if (iamEnabled) {
    // IAM enabled: the gateway may protect the per-user server URL advertised
    // in the OpenAPI spec. Use the static base URL only.
    serverUrl = fallback.replace(/\/+$/, '');
  } else {
    const serverBase = await resolveOpenApiServerBase();
    serverUrl = (serverBase || fallback).replace(/\/+$/, '');
  }

  // Fetch the OpenAPI spec ourselves so we can attach the bearer token:
  // Swagger UI's own fetch bypasses the requestInterceptor for this first call.
  // The document is bundled server side (/api/openapi) so that the external OGC
  // schema files it references resolve correctly; fall back to the raw document.
  let spec;
  const specUrl = serverUrl + '/api';
  try {
    spec = await loadingBar.track(() => $fetch('/api/openapi', { query: { url: specUrl }, headers: getRequestHeaders(locale.value) }));
  } catch (bundleErr) {
    console.warn('SwaggerUI: bundled document unavailable, loading the raw one', bundleErr);
    try {
      spec = await apiFetch(specUrl, { acceptLanguage: locale.value });
    } catch (err) {
      loadError.value = errorSummary(err, t('Failed to load the OpenAPI document'));
    }
  }

  const ui = SwaggerUI({
    dom_id: '#swagger-ui',
    ...(spec ? { spec } : { url: specUrl }),
    presets: [SwaggerUI.presets.apis],
    plugins: [HideErrorsPlugin],
    deepLinking: true,
    showExtensions: true,
    showCommonExtensions: true,
    requestInterceptor: (req) => {
      const protectedResources = ['api', 'me', 'jobs', 'processes', 'stac', 'raster'];

      let pathname = '';
      try {
        pathname = new URL(req.url, serverUrl).pathname;
      } catch {
        pathname = '';
      }

      // Support both /ogc-api/<resource> and /<namespace>/ogc-api/<resource>.
      const shouldAttachBearer = protectedResources.some((resource) => {
        const pattern = new RegExp(`(?:^|/)ogc-api/${resource}(?:/|$)`);
        return pattern.test(pathname);
      });

      if (shouldAttachBearer) {
        const headers = getRequestHeaders();
        if (headers.Authorization) {
          if (!req.headers) {
            req.headers = {};
          }
          if (typeof req.headers.set === 'function') {
            if (typeof req.headers.delete === 'function') {
              req.headers.delete('authorization');
            }
            req.headers.set('Authorization', headers.Authorization);
          } else {
            req.headers.Authorization = headers.Authorization;
            if ('authorization' in req.headers) {
              delete req.headers.authorization;
            }
          }
        }
      }
      return req;
    },
  });

  // Errors arrive asynchronously while remote $refs are resolved.
  try {
    unsubscribe = ui.getStore().subscribe(() => {
      if (collectTimer) clearTimeout(collectTimer);
      collectTimer = setTimeout(() => collectErrors(ui), 300);
    });
    collectErrors(ui);
  } catch (err) {
    console.debug('SwaggerUI: store subscription failed', err);
  }
});

onBeforeUnmount(() => {
  if (unsubscribe) unsubscribe();
  if (collectTimer) clearTimeout(collectTimer);
});
</script>

<style>
/* Not scoped: Swagger UI renders its own markup inside #swagger-ui. */
.swagger-page {
  max-width: 1400px;
  margin: 0 auto;
  padding: 8px 16px 32px;
}

.swagger-errors {
  background: var(--surface-warning, #fff6e5);
  border: 1px solid rgba(255, 152, 0, 0.45);
}
.swagger-errors__list {
  max-height: 320px;
  overflow: auto;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  padding-top: 8px;
}
.swagger-errors__item + .swagger-errors__item {
  margin-top: 6px;
}
.swagger-errors__path {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  opacity: 0.75;
  word-break: break-all;
  white-space: normal;
}

/* Safety net if the built-in panel ever shows up: wrap instead of overflowing. */
#swagger-ui .errors-wrapper {
  overflow: hidden;
}
#swagger-ui .errors-wrapper .error-wrapper pre,
#swagger-ui .errors-wrapper .message {
  white-space: pre-wrap;
  word-break: break-word;
}

/* Hide the server selector: the UI already targets the configured server. */
#swagger-ui .scheme-container {
  display: none !important;
}

/* Version pills next to the title (was rendered as tall blobs by the global line-height). */
#swagger-ui .info .title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
#swagger-ui .info .title small,
#swagger-ui .info .title small.version-stamp {
  display: inline-flex;
  align-items: center;
  margin: 0;
  padding: 0 10px;
  height: 22px;
  border-radius: 11px;
  background: var(--q-primary, #663e05);
  top: 0;
  position: static;
  vertical-align: middle;
}
#swagger-ui .info .title small.version-stamp {
  background: #2e7d4f;
}
#swagger-ui .info .title small pre.version {
  margin: 0;
  padding: 0;
  background: transparent;
  color: #fff;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px;
  font-weight: 600;
  line-height: 22px;
  letter-spacing: 0.02em;
  text-transform: none;
}

/* Dark theme: Swagger UI only ships a light theme, invert it and keep brand hues readable. */
.body--dark #swagger-ui .swagger-ui {
  filter: invert(0.9) hue-rotate(180deg);
}
.body--dark #swagger-ui .swagger-ui img,
.body--dark #swagger-ui .swagger-ui .highlight-code,
.body--dark #swagger-ui .swagger-ui .microlight {
  filter: invert(1) hue-rotate(180deg);
}
.body--dark #swagger-ui .info .title small {
  filter: invert(1) hue-rotate(180deg);
}
.body--dark .swagger-errors {
  --surface-warning: rgba(255, 152, 0, 0.14);
}
</style>
