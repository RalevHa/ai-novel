<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { answer, pending } from '../../confirm'
import Button from './Button.vue'
import Modal from './Modal.vue'

// keep the last question while the dialog fades out, so the text does not blank mid-animation
const last = ref(pending.value)
watch(pending, p => { if (p) last.value = p })
const o = computed(() => pending.value ?? last.value)
</script>

<template>
  <Modal :open="!!pending" :title="o?.title ?? ''" size="sm" @close="answer(false)">
    <p v-if="o?.body" class="muted whitespace-pre-line text-sm">{{ o.body }}</p>
    <template #footer>
      <Button variant="ghost" @click="answer(false)">{{ o?.cancelLabel ?? 'ยกเลิก' }}</Button>
      <Button :variant="o?.danger === false ? 'solid' : 'danger'" @click="answer(true)">{{ o?.confirmLabel ?? 'ยืนยัน' }}</Button>
    </template>
  </Modal>
</template>
