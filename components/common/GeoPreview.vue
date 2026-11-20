<template>
  <ClientOnly>
    <div ref="mapEl" class="geo-preview" :style="{ height }" />
  </ClientOnly>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import 'ol/ol.css'
import Map from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import OSM from 'ol/source/OSM'
import GeoJSON from 'ol/format/GeoJSON'
import VectorSource from 'ol/source/Vector'
import VectorLayer from 'ol/layer/Vector'
import Feature from 'ol/Feature'
import Polygon from 'ol/geom/Polygon'
import { fromLonLat, transformExtent } from 'ol/proj'
import { Fill, Stroke, Style, Circle as CircleStyle } from 'ol/style'

/**
 * Small OpenLayers preview of a GeoJSON document and/or a WGS84 bounding box.
 */
const props = withDefaults(defineProps<{ geojson?: any; bbox?: number[] | null; height?: string }>(), {
  geojson: null,
  bbox: null,
  height: '320px'
})

const mapEl = ref<HTMLElement | null>(null)
let map: Map | null = null
let vectorLayer: VectorLayer<VectorSource> | null = null

const style = new Style({
  stroke: new Stroke({ color: '#663e05', width: 2 }),
  fill: new Fill({ color: 'rgba(102, 62, 5, 0.15)' }),
  image: new CircleStyle({ radius: 5, fill: new Fill({ color: '#663e05' }) })
})

const render = () => {
  if (!map) return
  const source = new VectorSource()
  if (props.geojson) {
    try {
      const features = new GeoJSON().readFeatures(props.geojson, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857'
      })
      source.addFeatures(features)
    } catch (err) {
      console.warn('GeoPreview: invalid GeoJSON', err)
    }
  }
  if (props.bbox && props.bbox.length >= 4) {
    const [minX, minY, maxX, maxY] = props.bbox
    const ring = [
      fromLonLat([minX, minY]),
      fromLonLat([maxX, minY]),
      fromLonLat([maxX, maxY]),
      fromLonLat([minX, maxY]),
      fromLonLat([minX, minY])
    ]
    source.addFeature(new Feature(new Polygon([ring])))
  }
  if (vectorLayer) map.removeLayer(vectorLayer)
  vectorLayer = new VectorLayer({ source, style })
  map.addLayer(vectorLayer)
  const extent = source.getExtent()
  if (source.getFeatures().length && Number.isFinite(extent[0])) {
    map.getView().fit(extent, { padding: [30, 30, 30, 30], maxZoom: 12, duration: 400 })
  }
}

const init = (el: HTMLElement | null) => {
  if (!el || map) return
  map = new Map({
    target: el,
    layers: [new TileLayer({ source: new OSM() })],
    view: new View({ center: fromLonLat([0, 20]), zoom: 1.5 })
  })
  render()
}

// On a full page load `<ClientOnly>` renders its slot after this component's
// own `onMounted`, so the container appears later: watch the ref instead of
// relying on the mount hook alone (which left the map empty after a reload).
onMounted(() => init(mapEl.value))
watch(mapEl, (el) => init(el))

watch(() => [props.geojson, props.bbox], render, { deep: true })

onBeforeUnmount(() => {
  map?.setTarget(undefined)
  map = null
})
</script>

<style scoped>
.geo-preview {
  width: 100%;
  border: 1px solid #ddd;
  border-radius: 8px;
  overflow: hidden;
}
</style>
