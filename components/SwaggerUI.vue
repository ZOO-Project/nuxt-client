<template>
  <div id="swagger-ui"/>
</template>

<script setup>
import { onMounted } from 'vue';
import SwaggerUI from 'swagger-ui';
import 'swagger-ui/dist/swagger-ui.css';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();
const config = useRuntimeConfig();
const { resolveOpenApiServerBase, getRequestHeaders } = useOgcApiServer();

onMounted(async () => {
  const fallback = `${config.public.NUXT_ZOO_BASEURL}/ogc-api`;
  const iamFlagRaw = config.public.ZOO_IAM_ENABLED;
  const iamEnabled = ['true', '1', 'yes', 'on'].includes(String(iamFlagRaw).toLowerCase());
  const requiresBearer = String(config.public.ZOO_OGCAPI_REQUIRES_BEARER_TOKEN).toLowerCase() === 'true';

  // Auth state hydration can lag a bit on first page load. When bearer is
  // required, wait briefly so the initial OpenAPI request does not get
  // redirected to IAM (CORS failure in browser).
  if (requiresBearer) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 4000) {
      const headers = getRequestHeaders();
      if (headers.Authorization) {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  let serverUrl;

  if (iamEnabled) {
    // IAM enabled: APISIX may protect the per-user server URL advertised
    // in the OpenAPI spec. Use the static base URL only.
    serverUrl = fallback.replace(/\/+$/, '');
  } else {
    // No IAM: resolve the OGC API server base from /ogc-api/api
    // (servers[0].url), which is the per-user URL when authenticated.
    const serverBase = await resolveOpenApiServerBase();
    serverUrl = (serverBase || fallback).replace(/\/+$/, '');
  }
  console.log('SwaggerUI flags', { iamFlagRaw, iamEnabled, requiresBearer });
  console.log('SwaggerUI serverUrl', serverUrl);

  // Fetch the OpenAPI spec ourselves so we can attach the bearer token —
  // SwaggerUI's own fetch bypasses the requestInterceptor for this first call.
  let spec;
  try {
    const specHeaders = getRequestHeaders();
    console.log('SwaggerUI spec fetch headers', Object.keys(specHeaders));
    spec = await $fetch(serverUrl + '/api', { headers: specHeaders });
  } catch (err) {
    console.error('SwaggerUI: failed to fetch spec', err);
  }

  SwaggerUI({
    dom_id: '#swagger-ui',
    ...(spec ? { spec } : { url: serverUrl + '/api' }),
    presets: [SwaggerUI.presets.apis],
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
        if (requiresBearer && headers.Authorization) {
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
});
</script>

<style scoped>
::v-deep .scheme-container {
  display: none !important;
}

::v-deep h2 small,
::v-deep h2 small .version {
  line-height: initial;
}

::v-deep h2 small .version-stamp {
  line-height: initial;
}
</style>
