// plugins/vue3-openlayers.client.js

import { defineNuxtPlugin } from '#app'
import * as Vue3Openlayers from 'vue3-openlayers'
// vue3-openlayers 12 no longer injects its styles: load OpenLayers' and the
// library's own stylesheets once, for every map component.
import 'ol/ol.css'
import 'vue3-openlayers/vue3-openlayers.css'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(Vue3Openlayers)
})
