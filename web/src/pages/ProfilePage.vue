<script setup lang="ts">
import { ref } from 'vue'
import { aiKeyLast4, clearAiKey, hasAiKey, setAiKey } from '../aiKey'
import { client, ok } from '../api'
import Button from '../components/ui/Button.vue'
import Input from '../components/ui/Input.vue'
import Textarea from '../components/ui/Textarea.vue'
import { useAuth } from '../stores/auth'
import { toast, toastError } from '../toast'

const auth = useAuth()
const ROLE = { admin: 'ผู้ดูแลระบบ', writer: 'นักเขียน', user: 'ผู้อ่าน' }
const name = ref(auth.user!.name), bio = ref(auth.user!.bio ?? '')
const current = ref(''), next = ref('')
const busy = ref(false)

// a writer's own OpenRouter key: kept in this browser only (see aiKey.ts); the server just checks that it works
const keyText = ref(''), keyBusy = ref(false), changing = ref(false), confirmRemove = ref(false)
async function saveKey() {
  keyBusy.value = true
  try {
    await ok(client.api.me['ai-key'].check.post({ key: keyText.value }))
    setAiKey(keyText.value); keyText.value = ''; changing.value = false
    toast('บันทึกคีย์ในเบราว์เซอร์นี้แล้ว')
  } catch (e) { toastError(e) } finally { keyBusy.value = false }
}
function removeKey() { clearAiKey(); confirmRemove.value = false; toast('ลบคีย์ออกจากเบราว์เซอร์นี้แล้ว') }

async function save() {
  busy.value = true
  try {
    auth.user = await ok(client.api.me.profile.patch({ name: name.value, bio: bio.value, ...(next.value && { currentPassword: current.value, newPassword: next.value }) }))
    current.value = next.value = ''
    toast('บันทึกแล้ว')
  } catch (e) { toastError(e) } finally { busy.value = false }
}
</script>

<template>
  <div class="mx-auto max-w-[560px]">
    <h1 class="mb-1 font-serif text-[26px] font-bold">โปรไฟล์ของฉัน</h1>
    <p class="muted mb-6 text-sm">{{ auth.user!.email }} · {{ ROLE[auth.user!.role] }}<template v-if="auth.canWrite"> · <router-link :to="`/author/${auth.user!.id}`" class="text-primary underline underline-offset-2">ดูหน้าผู้แต่งของฉัน</router-link></template></p>
    <form @submit.prevent="save">
      <Input v-model="name" label="ชื่อที่แสดง" required />
      <Textarea v-model="bio" label="แนะนำตัว (แสดงในหน้าผู้แต่ง ไม่เกิน 500 ตัวอักษร)" :rows="5" />
      <h2 class="mb-3 mt-8 font-medium">เปลี่ยนรหัสผ่าน</h2>
      <Input v-model="current" label="รหัสผ่านปัจจุบัน" type="password" autocomplete="current-password" />
      <Input v-model="next" label="รหัสผ่านใหม่" type="password" autocomplete="new-password" :minlength="8" hint="อย่างน้อย 8 ตัวอักษร เว้นว่างไว้ถ้าไม่เปลี่ยน" />
      <Button type="submit" size="lg" class="w-full" :loading="busy">บันทึก</Button>
    </form>

    <section v-if="auth.canWrite" class="mt-12 border-t border-line pt-8" aria-labelledby="aikey-h">
      <h2 id="aikey-h" class="mb-1 font-medium">คีย์ AI ของฉัน (OpenRouter)</h2>
      <p class="muted mb-4 text-sm">นักเขียนใช้ AI เขียนนิยายด้วยคีย์ OpenRouter ของตัวเอง ค่าใช้จ่ายและเครดิตเป็นของคุณ ไม่ผ่านเว็บนี้ ขอคีย์ได้ที่ <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" class="text-primary underline underline-offset-2">openrouter.ai/keys</a> แนะนำให้ตั้งวงเงินที่ตัวคีย์</p>
      <p class="muted mb-4 text-sm">คีย์<b class="font-medium text-fg">เก็บในเบราว์เซอร์นี้เท่านั้น ไม่ถูกบันทึกบนเซิร์ฟเวอร์</b> แต่จะถูกส่งมากับคำสั่ง AI ทุกครั้ง เซิร์ฟเวอร์จึงเห็นคีย์ชั่วคราวระหว่างทำคำสั่งนั้น (ไม่บันทึกลงฐานข้อมูลหรือล็อก) คีย์จะถูกล้างเมื่อคุณออกจากระบบ ถ้าเปลี่ยนเครื่องหรือล้างข้อมูลเบราว์เซอร์ ต้องกรอกใหม่ ผู้ให้บริการกู้คืนให้ไม่ได้ และอย่ากรอกบนเครื่องสาธารณะ</p>
      <p v-if="auth.isAdmin" class="muted mb-4 text-sm">ผู้ดูแลระบบใช้คีย์ของเว็บได้เมื่อไม่ได้ตั้งคีย์ของตัวเอง ถ้าตั้งไว้ที่นี่ ระบบจะใช้คีย์ของคุณก่อน</p>

      <div v-if="hasAiKey && !changing" class="rounded-xl border border-line bg-surface p-4">
        <p class="text-sm">ตั้งคีย์ไว้ในเบราว์เซอร์นี้แล้ว <span class="font-mono">…{{ aiKeyLast4 }}</span></p>
        <div class="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" @click="changing = true">เปลี่ยนคีย์</Button>
          <Button v-if="!confirmRemove" variant="ghost" size="sm" @click="confirmRemove = true">ลบคีย์</Button>
          <template v-else>
            <Button variant="danger" size="sm" @click="removeKey">ยืนยันลบคีย์</Button>
            <Button variant="ghost" size="sm" @click="confirmRemove = false">ยกเลิก</Button>
          </template>
        </div>
      </div>
      <form v-else @submit.prevent="saveKey">
        <p v-if="!hasAiKey && !auth.isAdmin" class="mb-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm">ยังไม่ได้ตั้งคีย์ในเบราว์เซอร์นี้ จึงยังใช้ปุ่ม AI (เขียนตอน เขียนใหม่ สรุป ตรวจความต่อเนื่อง เสนอตัวละคร) ไม่ได้</p>
        <Input v-model="keyText" label="คีย์ OpenRouter" type="password" autocomplete="off" placeholder="sk-or-…" hint="ระบบจะตรวจกับ OpenRouter ก่อนเก็บ" />
        <div class="flex gap-2">
          <Button type="submit" :loading="keyBusy" :disabled="!keyText.trim()">ตรวจและเก็บคีย์</Button>
          <Button v-if="changing" variant="ghost" @click="changing = false; keyText = ''">ยกเลิก</Button>
        </div>
      </form>
    </section>
  </div>
</template>
