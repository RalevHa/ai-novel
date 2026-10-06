<script setup lang="ts">
defineProps<{ on: boolean }>()
</script>

<template><span :class="['inline-block size-2 rounded-full align-middle', on ? 'bg-success' : 'bg-warning']" aria-hidden="true" /></template>
