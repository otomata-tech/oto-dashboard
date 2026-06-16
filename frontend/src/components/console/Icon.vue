<script setup lang="ts">
// Icônes outline 16px (heroicons-style, stroke 1.75, currentColor) — paths du prototype.
const ICON_PATHS: Record<string, string> = {
  home: 'M3 9.5 12 3l9 6.5M5 8.5V21h14V8.5M9.5 21v-6h5v6',
  plug: 'M9 3v5m6-5v5M7 8h10v3a5 5 0 0 1-5 5 5 5 0 0 1-5-5V8Zm5 8v5',
  wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4L14.5 12l-2.5-2.5 2.7-3.2Z',
  doc: 'M7 3h7l4 4v14H7V3Zm7 0v4h4M10 12h5m-5 4h5m-5-8h2',
  db: 'M12 3c-4 0-7 1.1-7 2.5v13C5 19.9 8 21 12 21s7-1.1 7-2.5v-13C19 4.1 16 3 12 3Zm-7 2.5C5 6.9 8 8 12 8s7-1.1 7-2.5M5 12c0 1.4 3 2.5 7 2.5s7-1.1 7-2.5',
  pulse: 'M3 12h4l2.5-7 5 14L17 12h4',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9c0-3 2.7-5 6-5s6 2 6 5M16 4.3A3.5 3.5 0 0 1 16 11m2 4.2c2 .8 3 2.3 3 4.8',
  user: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9c0-3.3 3.1-6 7-6s7 2.7 7 6',
  chart: 'M4 20V10m5.3 10V4m5.4 16v-8m5.3 8V7',
  key: 'M14 10a4 4 0 1 0-4 4l1.5-1.5M10 14l-6 6v1h3l1-1v-2h2l1-1 1-1m2-9a2 2 0 0 1 0 .01',
  building: 'M4 21h16M6 21V5h8v16m4 0V9h-4M9 8h2m-2 4h2m-2 4h2',
  copy: 'M8 8V5h11v11h-3M5 8h11v11H5V8Z',
  check: 'M4.5 12.5 10 18 19.5 6.5',
  ext: 'M14 5h5v5m0-5-8 8M11 5H5v14h14v-6',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M9 7V4h6v3m-9 0 1 14h8l1-14M10 11v6m4-6v6',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Zm9 3-4.4-4.4',
  chev: 'M8 5l8 7-8 7',
  chevd: 'M5 9l7 7 7-7',
  shield: 'M12 3l8 3v6c0 4.5-3.5 7.7-8 9-4.5-1.3-8-4.5-8-9V6l8-3Z',
  pen: 'M4 20l1-4L17 4l3 3L8 19l-4 1ZM14 7l3 3',
  bolt: 'M13 2 4 14h6l-1 8 9-12h-6l1-8Z',
  logout: 'M15 12H4m0 0 3.5-3.5M4 12l3.5 3.5M11 7.5V6a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2v-1.5',
  phone: 'M5 4h3l2 5-2.5 1.5a11 11 0 0 0 5 5L19 14l-1 3v3a17 17 0 0 1-13-13Z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6 6 18',
}

const props = withDefaults(defineProps<{ name: string; size?: number; sw?: number }>(), {
  size: 16,
  sw: 1.75,
})
</script>

<template>
  <svg
    :width="size" :height="size" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" :stroke-width="sw" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="ICON_PATHS[name] || ICON_PATHS.doc" />
  </svg>
</template>
