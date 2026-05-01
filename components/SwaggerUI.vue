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
  // Resolve the OGC API server base from /ogc-api/api (servers[0].url),
  // which is the per-user URL when authenticated.
  const serverBase = await resolveOpenApiServerBase();
  const fallback = `${config.public.NUXT_ZOO_BASEURL}/ogc-api`;
  const serverUrl = (serverBase || fallback).replace(/\/+$/, '');
  console.log('SwaggerUI serverUrl', serverUrl);

  SwaggerUI({
    dom_id: '#swagger-ui',
    url: serverUrl + '/api',
    presets: [SwaggerUI.presets.apis],
    deepLinking: true,
    showExtensions: true,
    showCommonExtensions: true,
    requestInterceptor: (req) => {
      const paths = ['/api', '/me', '/jobs', '/processes', '/stac', '/raster'];
      if (paths.some(path => req.url.includes('/ogc-api' + path))) {
        // Add bearer token only when the user is authenticated.
        const headers = getRequestHeaders();
        if (config.public.ZOO_OGCAPI_REQUIRES_BEARER_TOKEN === 'true' && headers.Authorization) {
          req.headers.Authorization = headers.Authorization;
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
