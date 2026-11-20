<template>
  <div
    class="zoo-loading"
    :class="{ 'zoo-loading--visible': visible }"
    :style="{ width: `${progress}%` }"
    role="progressbar"
    :aria-valuenow="Math.round(progress)"
    aria-valuemin="0"
    aria-valuemax="100"
    aria-hidden="true"
  />
</template>

<script setup lang="ts">
const { visible, progress } = useGlobalLoading()
</script>

<style>
.zoo-loading {
  position: fixed;
  top: 0;
  left: 0;
  height: 3px;
  width: 0;
  background: var(--zoo-loading, #f2c037);
  box-shadow: 0 0 10px rgba(242, 192, 55, 0.75), 0 0 2px rgba(242, 192, 55, 0.9);
  z-index: 100000;
  opacity: 0;
  pointer-events: none;
  transition: width 0.2s ease-out, opacity 0.3s ease 0.1s;
}
.zoo-loading--visible {
  opacity: 1;
  transition: width 0.2s ease-out, opacity 0.1s ease;
}
@media (prefers-reduced-motion: reduce) {
  .zoo-loading {
    transition: none;
  }
}
</style>
