<template>
  <div>
    <div v-if="!authed" class="text-center py-20">
      <p class="text-neutral-400 mb-3">需要管理员登录</p>
      <router-link to="/login" class="text-blue-500 hover:underline">去登录 →</router-link>
    </div>

    <div v-else class="space-y-8">
      <!-- Themes -->
      <section>
        <div class="flex items-center gap-3 mb-3">
          <h2 class="text-lg font-bold">主题</h2>
          <button @click="openTheme()" class="ml-auto px-3 py-1.5 rounded-lg text-sm bg-blue-600 text-white">+ 新建主题</button>
          <button @click="logout" class="px-3 py-1.5 rounded-lg text-sm border border-neutral-300 dark:border-neutral-700">退出</button>
        </div>
        <div v-if="themes.length === 0" class="text-sm text-neutral-400">还没有主题，点击「新建主题」添加。</div>
        <div v-else class="space-y-2">
          <div v-for="t in themes" :key="t.id" class="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3">
            <div class="flex items-center gap-2">
              <span class="font-medium">{{ t.name }}</span>
              <span class="text-xs text-neutral-400">{{ t.source_count }} 源 · {{ t.message_count }} 资源</span>
              <div class="ml-auto flex gap-1">
                <button @click="openTheme(t)" class="px-2 py-1 rounded text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800">编辑</button>
                <button @click="openSources(t)" class="px-2 py-1 rounded text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800">数据源</button>
                <button @click="scanTheme(t)" class="px-2 py-1 rounded text-xs bg-green-600 text-white">扫描</button>
                <button @click="delTheme(t)" class="px-2 py-1 rounded text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950">删除</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Sources panel -->
      <section v-if="activeTheme" class="rounded-2xl border border-blue-300 dark:border-blue-800 p-4 bg-blue-50/50 dark:bg-blue-950/30">
        <div class="flex items-center gap-2 mb-3">
          <h3 class="font-bold">{{ activeTheme.name }} · 数据源</h3>
          <button @click="openSource()" class="ml-auto px-2.5 py-1 rounded text-xs bg-blue-600 text-white">+ 添加数据源</button>
        </div>
        <div v-if="sources.length === 0" class="text-sm text-neutral-400">无数据源</div>
        <div v-else class="space-y-2">
          <div v-for="s in sources" :key="s.id" class="rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-2.5 text-sm">
            <div class="flex items-center gap-2">
              <span class="px-1.5 py-0.5 rounded text-[10px] uppercase" :class="s.type==='local'?'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300':'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'">{{ s.type }}</span>
              <span class="text-neutral-500">{{ s.label || (s.type==='local'? s.local_path : s.webdav_url) }}</span>
              <span v-if="!s.enabled" class="text-xs text-amber-500">已禁用</span>
              <div class="ml-auto flex gap-1">
                <button @click="testSource(s)" class="px-2 py-1 rounded text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800">测试</button>
                <button @click="scanSource(s)" class="px-2 py-1 rounded text-xs bg-green-600 text-white">扫描</button>
                <button @click="openSource(s)" class="px-2 py-1 rounded text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800">编辑</button>
                <button @click="delSource(s)" class="px-2 py-1 rounded text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950">删除</button>
              </div>
            </div>
            <div class="mt-1 text-xs text-neutral-400 break-all">{{ s.type==='local'? s.local_path : s.webdav_url }}</div>
            <div v-if="s._test" class="mt-1 text-xs" :class="s._test.ok ? 'text-green-600' : 'text-red-500'">{{ s._test.message }}</div>
          </div>
        </div>
      </section>

      <!-- Password -->
      <section>
        <h2 class="text-lg font-bold mb-3">修改密码</h2>
        <form @submit.prevent="changePwd" class="flex flex-wrap gap-2 max-w-xl">
          <input v-model="pwd.current" type="password" placeholder="当前密码" class="flex-1 min-w-[140px] px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900" />
          <input v-model="pwd.next" type="password" placeholder="新密码" class="flex-1 min-w-[140px] px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900" />
          <button class="px-4 py-2 rounded-lg bg-neutral-800 text-white dark:bg-neutral-200 dark:text-black">保存</button>
        </form>
        <p v-if="pwdMsg" class="mt-2 text-sm" :class="pwdOk ? 'text-green-600' : 'text-red-500'">{{ pwdMsg }}</p>
      </section>
    </div>

    <!-- Theme modal -->
    <div v-if="themeModal.open" class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" @click.self="themeModal.open=false">
      <div class="bg-white dark:bg-neutral-900 rounded-2xl p-5 w-full max-w-md">
        <h3 class="font-bold mb-3">{{ themeModal.id ? '编辑主题' : '新建主题' }}</h3>
        <label class="block text-sm text-neutral-500 mb-1">主题名(不可重复)</label>
        <input v-model="themeModal.name" class="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 mb-3" />
        <label class="block text-sm text-neutral-500 mb-1">排序(数字越小越靠前)</label>
        <input v-model.number="themeModal.sort_order" type="number" class="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 mb-4" />
        <div class="flex gap-2 justify-end">
          <button @click="themeModal.open=false" class="px-3 py-2 rounded-lg text-sm border border-neutral-300 dark:border-neutral-700">取消</button>
          <button @click="saveTheme" class="px-3 py-2 rounded-lg text-sm bg-blue-600 text-white">保存</button>
        </div>
      </div>
    </div>

    <!-- Source modal -->
    <div v-if="srcModal.open" class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" @click.self="srcModal.open=false">
      <div class="bg-white dark:bg-neutral-900 rounded-2xl p-5 w-full max-w-md max-h-[90vh] overflow-auto">
        <h3 class="font-bold mb-3">{{ srcModal.id ? '编辑数据源' : '添加数据源' }}</h3>
        <label class="block text-sm text-neutral-500 mb-1">类型</label>
        <select v-model="srcModal.type" class="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 mb-3">
          <option value="local">local 本地目录</option>
          <option value="webdav">webdav 远程</option>
        </select>
        <label class="block text-sm text-neutral-500 mb-1">标签(可选)</label>
        <input v-model="srcModal.label" class="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 mb-3" />
        <template v-if="srcModal.type==='local'">
          <label class="block text-sm text-neutral-500 mb-1">本地目录绝对路径</label>
          <input v-model="srcModal.local_path" placeholder="D:\Media\Channels 或 /mnt/d/Media/Channels" class="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 mb-3" />
        </template>
        <template v-else>
          <label class="block text-sm text-neutral-500 mb-1">WebDAV URL</label>
          <input v-model="srcModal.webdav_url" placeholder="https://host/dav/path" class="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 mb-3" />
          <label class="block text-sm text-neutral-500 mb-1">用户名</label>
          <input v-model="srcModal.webdav_username" class="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 mb-3" />
          <label class="block text-sm text-neutral-500 mb-1">密码</label>
          <input v-model="srcModal.webdav_password" type="password" class="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 mb-3" />
        </template>
        <div class="flex gap-2 justify-end">
          <button @click="srcModal.open=false" class="px-3 py-2 rounded-lg text-sm border border-neutral-300 dark:border-neutral-700">取消</button>
          <button @click="testSrc" class="px-3 py-2 rounded-lg text-sm border border-neutral-300 dark:border-neutral-700">测试连接</button>
          <button @click="saveSource" class="px-3 py-2 rounded-lg text-sm bg-blue-600 text-white">保存</button>
        </div>
        <p v-if="srcModal.testMsg" class="mt-2 text-sm" :class="srcModal.testOk ? 'text-green-600' : 'text-red-500'">{{ srcModal.testMsg }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api';

const authed = ref(false);
const themes = ref([]);
const sources = ref([]);
const activeTheme = ref(null);
const busy = ref(false);

const themeModal = ref({ open: false, id: null, name: '', sort_order: 0 });
const srcModal = ref({ open: false, id: null, theme_id: null, type: 'local', label: '', local_path: '', webdav_url: '', webdav_username: '', webdav_password: '', testMsg: '', testOk: false });

const pwd = ref({ current: '', next: '' });
const pwdMsg = ref(''); const pwdOk = ref(false);

async function refreshAuth() { authed.value = (await api.me().catch(() => ({ authed: false }))).authed; }
async function loadThemes() { themes.value = await api.adminThemes().catch(() => []); }

async function logout() { await api.logout(); authed.value = false; }

function openTheme(t) {
  themeModal.value = { open: true, id: t ? t.id : null, name: t ? t.name : '', sort_order: t ? t.sort_order : 0 };
}
async function saveTheme() {
  const m = themeModal.value;
  if (!m.name.trim()) return alert('主题名不能为空');
  try {
    if (m.id) await api.updateTheme(m.id, { name: m.name.trim(), sort_order: m.sort_order });
    else await api.createTheme(m.name.trim(), m.sort_order);
    m.open = false; await loadThemes();
  } catch (e) { alert(e.message); }
}
async function delTheme(t) {
  if (!confirm(`删除主题「${t.name}」及其所有数据源和已扫描资源?`)) return;
  await api.deleteTheme(t.id);
  if (activeTheme.value && activeTheme.value.id === t.id) { activeTheme.value = null; sources.value = []; }
  await loadThemes();
}

async function openSources(t) {
  activeTheme.value = t;
  sources.value = await api.sources(t.id).catch(() => []);
}
function openSource(s) {
  srcModal.value = {
    open: true, id: s ? s.id : null, theme_id: s ? s.theme_id : (activeTheme.value ? activeTheme.value.id : null),
    type: s ? s.type : 'local', label: s ? s.label : '',
    local_path: s ? s.local_path : '', webdav_url: s ? s.webdav_url : '',
    webdav_username: s ? s.webdav_username : '', webdav_password: s ? s.webdav_password : '',
    testMsg: '', testOk: false
  };
}
async function saveSource() {
  const m = srcModal.value;
  const body = { type: m.type, label: m.label, local_path: m.local_path || null, webdav_url: m.webdav_url || null, webdav_username: m.webdav_username || null, webdav_password: m.webdav_password || null };
  try {
    if (m.id) await api.updateSource(m.id, body);
    else await api.addSource(m.theme_id, body);
    m.open = false;
    if (activeTheme.value) sources.value = await api.sources(activeTheme.value.id);
  } catch (e) { alert(e.message); }
}
async function testSrc() {
  const m = srcModal.value;
  m.testMsg = '测试中…'; m.testOk = false;
  try {
    const r = await api.testSource({ type: m.type, local_path: m.local_path, webdav_url: m.webdav_url, webdav_username: m.webdav_username, webdav_password: m.webdav_password });
    m.testOk = r.ok; m.testMsg = r.message;
  } catch (e) { m.testOk = false; m.testMsg = e.message; }
}
async function testSource(s) {
  s._test = { ok: false, message: '测试中…' };
  try {
    const r = await api.testSource({ type: s.type, local_path: s.local_path, webdav_url: s.webdav_url, webdav_username: s.webdav_username, webdav_password: s.webdav_password });
    s._test = r;
  } catch (e) { s._test = { ok: false, message: e.message }; }
}
async function delSource(s) {
  if (!confirm('删除此数据源?已扫描的资源也会一并删除。')) return;
  await api.deleteSource(s.id);
  if (activeTheme.value) sources.value = await api.sources(activeTheme.value.id);
}

async function scanTheme(t) {
  if (busy.value) return; busy.value = true;
  alert(`开始扫描主题「${t.name}」…完成前请勿关闭页面。`);
  try {
    const r = await api.scanTheme(t.id);
    let sum = ''; r.results.forEach((x) => { if (x.error) sum += `源#${x.source_id}: 错误 ${x.error}\n`; else sum += `源#${x.source_id}: 新增${x.inserted} 更新${x.updated} 失败${x.failed} 清理${x.pruned}\n`; });
    alert('扫描完成:\n' + sum);
    await loadThemes();
  } catch (e) { alert('扫描出错: ' + e.message); }
  busy.value = false;
}
async function scanSource(s) {
  if (busy.value) return; busy.value = true;
  try {
    const r = await api.scanSource(s.id);
    const x = r.results[0];
    alert(x.error ? `错误: ${x.error}` : `新增${x.inserted} 更新${x.updated} 失败${x.failed} 清理${x.pruned}`);
    if (activeTheme.value) sources.value = await api.sources(activeTheme.value.id);
    await loadThemes();
  } catch (e) { alert('扫描出错: ' + e.message); }
  busy.value = false;
}

async function changePwd() {
  pwdMsg.value = ''; pwdOk.value = false;
  try { await api.changePassword(pwd.value.current, pwd.value.next); pwdOk.value = true; pwdMsg.value = '密码已更新'; pwd.value = { current: '', next: '' }; }
  catch (e) { pwdMsg.value = e.message; }
}

onMounted(async () => { await refreshAuth(); if (authed.value) await loadThemes(); });
</script>
