<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { client, ok } from '../api'
import Button from '../components/ui/Button.vue'
import Input from '../components/ui/Input.vue'
import OtpInput from '../components/OtpInput.vue'
import Textarea from '../components/ui/Textarea.vue'
import { fmtDate } from '../genre'
import { useAuth } from '../stores/auth'
import { toast, toastError } from '../toast'

const auth = useAuth(), router = useRouter()
const ROLE = { admin: 'ผู้ดูแลระบบ', writer: 'นักเขียน', user: 'ผู้อ่าน' }
const name = ref(auth.user!.name), bio = ref(auth.user!.bio ?? '')
const current = ref(''), next = ref('')
const busy = ref(false)

// a writer's own OpenRouter key: the server stores it encrypted and only ever tells us "set" + the last 4 characters
const loadKey = () => ok(client.api.me['ai-key'].get())
const aiKey = ref<Awaited<ReturnType<typeof loadKey>> | null>(null), keyText = ref(''), keyBusy = ref(false), changing = ref(false), confirmRemove = ref(false)
onMounted(async () => { if (auth.canWrite) { try { aiKey.value = await loadKey() } catch (e) { toastError(e) } } })
async function saveKey() {
  keyBusy.value = true
  try { aiKey.value = await ok(client.api.me['ai-key'].put({ key: keyText.value })); keyText.value = ''; changing.value = false; toast('บันทึกคีย์แล้ว') }
  catch (e) { toastError(e) } finally { keyBusy.value = false }
}
async function removeKey() {
  keyBusy.value = true
  try { aiKey.value = await ok(client.api.me['ai-key'].delete()); confirmRemove.value = false; toast('ลบคีย์แล้ว') }
  catch (e) { toastError(e) } finally { keyBusy.value = false }
}

// changing the email: a code is mailed to the NEW address and nothing changes until it is entered
const newEmail = ref(''), emailPw = ref(''), emailCode = ref(''), emailStep = ref<'form' | 'code'>('form'), emailBusy = ref(false)
async function sendEmailCode() {
  emailBusy.value = true
  try { await ok(client.api.me.email.post({ email: newEmail.value.trim(), password: emailPw.value })); emailStep.value = 'code'; emailPw.value = ''; toast('ส่งรหัสไปที่อีเมลใหม่แล้ว') }
  catch (e) { toastError(e) } finally { emailBusy.value = false }
}
async function confirmEmail() {
  emailBusy.value = true
  try {
    auth.user = await ok(client.api.me.email.confirm.post({ email: newEmail.value.trim(), code: emailCode.value }))
    newEmail.value = emailCode.value = ''; emailStep.value = 'form'; toast('เปลี่ยนอีเมลแล้ว')
  } catch (e) { toastError(e) } finally { emailBusy.value = false }
}

// deleting the account: password first (the server mails a code), then the code; the server refuses while the person still owns stories
const delStep = ref<'closed' | 'password' | 'code'>('closed'), delPw = ref(''), delCode = ref(''), delBusy = ref(false)
async function sendDeleteCode() {
  delBusy.value = true
  try { await ok(client.api.me.delete.post({ password: delPw.value })); delStep.value = 'code'; delPw.value = ''; toast('ส่งรหัสไปที่อีเมลของคุณแล้ว') }
  catch (e) { toastError(e) } finally { delBusy.value = false }
}
async function confirmDelete() {
  delBusy.value = true
  try { await ok(client.api.me.delete.confirm.post({ code: delCode.value })); auth.user = null; toast('ลบบัญชีแล้ว'); router.push('/') }
  catch (e) { toastError(e) } finally { delBusy.value = false }
}

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

    <section class="mt-12 border-t border-line pt-8" aria-labelledby="email-h">
      <h2 id="email-h" class="mb-1 font-medium">เปลี่ยนอีเมล</h2>
      <p class="muted mb-4 text-sm">เราจะส่งรหัส 6 หลักไปที่อีเมลใหม่ อีเมลจะเปลี่ยนต่อเมื่อคุณกรอกรหัสนั้นแล้วเท่านั้น</p>
      <form v-if="emailStep === 'form'" @submit.prevent="sendEmailCode">
        <Input v-model="newEmail" label="อีเมลใหม่" type="email" autocomplete="email" required />
        <Input v-model="emailPw" label="รหัสผ่านปัจจุบัน" type="password" autocomplete="current-password" hint="ใส่เพื่อยืนยันว่าเป็นคุณ" required />
        <Button type="submit" :loading="emailBusy">ส่งรหัสไปอีเมลใหม่</Button>
      </form>
      <form v-else @submit.prevent="confirmEmail">
        <p class="mb-4 text-sm">เราส่งรหัสไปที่ <strong class="break-all">{{ newEmail }}</strong> แล้ว</p>
        <OtpInput v-model="emailCode" />
        <div class="flex gap-2">
          <Button type="submit" :loading="emailBusy" :disabled="emailCode.length !== 6">ยืนยันอีเมลใหม่</Button>
          <Button variant="ghost" @click="emailStep = 'form'; emailCode = ''">ยกเลิก</Button>
        </div>
      </form>
    </section>

    <section v-if="auth.user!.role !== 'admin'" class="mt-12 border-t border-line pt-8" aria-labelledby="del-h">
      <h2 id="del-h" class="mb-1 font-medium text-danger">ลบบัญชี</h2>
      <p class="muted mb-4 text-sm">ลบบัญชีนี้ถาวร ความคิดเห็น รีวิว โหวต เรื่องที่ติดตาม และการแจ้งเตือนของคุณจะหายไปด้วย กู้คืนไม่ได้ ถ้าคุณเป็นนักเขียนที่มีเรื่องอยู่ ต้องลบเรื่องเหล่านั้นก่อน</p>
      <Button v-if="delStep === 'closed'" variant="outline" @click="delStep = 'password'">ลบบัญชีของฉัน</Button>
      <form v-else-if="delStep === 'password'" @submit.prevent="sendDeleteCode">
        <Input v-model="delPw" label="รหัสผ่านปัจจุบัน" type="password" autocomplete="current-password" hint="เราจะส่งรหัส 6 หลักไปที่อีเมลของบัญชีเพื่อยืนยันอีกครั้ง" required />
        <div class="flex gap-2">
          <Button type="submit" variant="danger" :loading="delBusy">ส่งรหัสยืนยัน</Button>
          <Button variant="ghost" @click="delStep = 'closed'; delPw = ''">ยกเลิก</Button>
        </div>
      </form>
      <form v-else @submit.prevent="confirmDelete">
        <p class="mb-4 text-sm">เราส่งรหัสไปที่ <strong class="break-all">{{ auth.user!.email }}</strong> แล้ว กรอกรหัสเพื่อลบบัญชีถาวร</p>
        <OtpInput v-model="delCode" />
        <div class="flex gap-2">
          <Button type="submit" variant="danger" :loading="delBusy" :disabled="delCode.length !== 6">ลบบัญชีถาวร</Button>
          <Button variant="ghost" @click="delStep = 'closed'; delCode = ''">ยกเลิก</Button>
        </div>
      </form>
    </section>

    <section v-if="auth.canWrite && aiKey" class="mt-12 border-t border-line pt-8" aria-labelledby="aikey-h">
      <h2 id="aikey-h" class="mb-1 font-medium">คีย์ AI ของฉัน (OpenRouter)</h2>
      <p class="muted mb-4 text-sm">ทุกคนที่ใช้ AI เขียนนิยายใช้คีย์ OpenRouter ของตัวเอง ค่าใช้จ่ายและเครดิตเป็นของคุณ ไม่ผ่านเว็บนี้ ขอคีย์ได้ที่ <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" class="text-primary underline underline-offset-2">openrouter.ai/keys</a> แนะนำให้ตั้งวงเงินที่ตัวคีย์ เว็บเก็บคีย์แบบเข้ารหัสและไม่แสดงให้ดูอีก ใช้เพื่อเรียกโมเดลตามคำสั่งของคุณเท่านั้น และลบได้ทุกเมื่อ</p>
      <p v-if="aiKey.admin" class="muted mb-4 text-sm">เว็บนี้ไม่มีคีย์กลาง ผู้ดูแลระบบก็ต้องใช้คีย์ของตัวเองเหมือนนักเขียน (ยกเว้นโมเดล <code>local:</code> ที่ไม่ต้องใช้คีย์)</p>

      <div v-if="aiKey.hasKey && !changing" class="rounded-xl border border-line bg-surface p-4">
        <p class="text-sm">ตั้งคีย์ไว้แล้ว <span class="font-mono">…{{ aiKey.last4 }}</span><template v-if="aiKey.updatedAt"> · เมื่อ {{ fmtDate(aiKey.updatedAt) }}</template></p>
        <div class="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" @click="changing = true">เปลี่ยนคีย์</Button>
          <Button v-if="!confirmRemove" variant="ghost" size="sm" @click="confirmRemove = true">ลบคีย์</Button>
          <template v-else>
            <Button variant="danger" size="sm" :loading="keyBusy" @click="removeKey">ยืนยันลบคีย์</Button>
            <Button variant="ghost" size="sm" @click="confirmRemove = false">ยกเลิก</Button>
          </template>
        </div>
      </div>
      <form v-else @submit.prevent="saveKey">
        <p v-if="!aiKey.hasKey" class="mb-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm">ยังไม่ได้ตั้งคีย์ จึงยังใช้ปุ่ม AI (เขียนตอน เขียนใหม่ สรุป ตรวจความต่อเนื่อง เสนอตัวละคร) ไม่ได้</p>
        <Input v-model="keyText" label="คีย์ OpenRouter" type="password" autocomplete="off" placeholder="sk-or-…" hint="ระบบจะตรวจกับ OpenRouter ก่อนบันทึก" />
        <div class="flex gap-2">
          <Button type="submit" :loading="keyBusy" :disabled="!keyText.trim()">บันทึกคีย์</Button>
          <Button v-if="changing" variant="ghost" @click="changing = false; keyText = ''">ยกเลิก</Button>
        </div>
      </form>
    </section>
  </div>
</template>
