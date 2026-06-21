<template>
  <div class="space-y-8">
    <section v-if="!authed" class="mx-auto max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <h1 class="text-2xl font-bold">管理登录</h1>
      <p class="mt-2 text-sm text-neutral-500">请输入管理员密码继续。</p>

      <form class="mt-6 space-y-3" @submit.prevent="submitLogin">
        <input
          v-model="authPassword"
          type="password"
          autocomplete="current-password"
          placeholder="管理员密码"
          class="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 outline-none focus:border-blue-400 dark:border-neutral-700 dark:bg-neutral-950"
        />
        <button
          :disabled="authLoading"
          class="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-100 dark:text-black"
        >
          {{ authLoading ? '登录中...' : '登录' }}
        </button>
        <p v-if="authError" class="text-sm text-red-500">{{ authError }}</p>
      </form>
    </section>

    <div v-else class="space-y-8">
      <section class="flex flex-wrap items-center gap-3">
        <div>
          <h1 class="text-2xl font-bold">管理面板</h1>
          <p class="text-sm text-neutral-500">扫描、导入和编辑都在页面内进行，后台运行不会阻塞其他操作。</p>
        </div>
        <div class="ml-auto flex flex-wrap gap-2">
          <button @click="refreshAll" class="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">刷新全部扫描</button>
          <button @click="reloadData" class="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">刷新页面数据</button>
          <button @click="logout" class="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">退出</button>
        </div>
      </section>

      <section v-if="scanJobs.length" class="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
        <div class="mb-3 flex items-center gap-3">
          <h2 class="text-lg font-bold">扫描状态</h2>
          <span class="text-sm text-neutral-500">{{ scanJobs.length }} 个任务，最多并发 {{ maxConcurrent }}</span>
          <button @click="clearFinishedJobs" class="ml-auto text-sm text-blue-600 hover:underline">清理已完成</button>
        </div>

        <div class="space-y-3">
          <div
            v-for="job in activeJobs"
            :key="job.id"
            class="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950"
          >
            <div class="flex items-center gap-3">
              <div class="min-w-0">
                <div class="truncate font-medium">{{ job.label || job.id }}</div>
                <div class="text-xs text-neutral-500">
                  {{ job.scope === 'theme' ? '主题扫描' : '数据源扫描' }}
                  <span v-if="job.phase"> · {{ job.phase }}</span>
                </div>
              </div>
              <div class="ml-auto text-right text-xs text-neutral-500">
                <div v-if="job.status === 'queued'">排队中</div>
                <div v-else-if="job.status === 'running'">{{ job.progress.current }}/{{ job.progress.total || '?' }}</div>
                <div v-else-if="job.status === 'done'">已完成</div>
                <div v-else>错误</div>
              </div>
            </div>

            <div class="mt-3 h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
              <div
                class="h-full bg-blue-600 transition-all duration-300"
                :style="{ width: `${jobPercent(job)}%` }"
              ></div>
            </div>

            <div v-if="job.summary || job.error" class="mt-2 text-xs whitespace-pre-line" :class="job.error ? 'text-red-500' : 'text-neutral-500'">
              {{ job.error || job.summary }}
            </div>
          </div>
        </div>
      </section>

      <section class="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
        <div class="mb-3 flex items-center gap-3">
          <h2 class="text-lg font-bold">主题</h2>
          <button @click="openThemeModal()" class="ml-auto rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white">+ 新建主题</button>
          <button @click="exportConfig(false)" class="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">导出配置</button>
          <label class="cursor-pointer rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">
            导入配置
            <input type="file" accept="application/json" class="hidden" @change="onImportFile" />
          </label>
        </div>

        <div v-if="themes.length === 0" class="text-sm text-neutral-500">暂无主题。</div>
        <div v-else class="space-y-2">
          <div
            v-for="theme in themes"
            :key="theme.id"
            class="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950"
          >
            <div class="flex flex-wrap items-center gap-2">
              <button class="text-left font-medium" @click="selectTheme(theme)">{{ theme.name }}</button>
              <span class="text-xs text-neutral-500">{{ theme.source_count }} 个数据源 · {{ theme.message_count }} 条资源</span>
              <div class="ml-auto flex flex-wrap gap-2">
                <button @click="openThemeModal(theme)" class="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs dark:border-neutral-700">编辑</button>
                <button @click="scanTheme(theme)" class="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs text-white">单独扫描</button>
                <button @click="deleteTheme(theme)" class="rounded-lg border border-red-300 px-2.5 py-1 text-xs text-red-600 dark:border-red-900">删除</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section v-if="selectedTheme" class="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
        <div class="mb-3 flex items-center gap-3">
          <div>
            <h2 class="text-lg font-bold">{{ selectedTheme.name }} 的数据源</h2>
            <p class="text-sm text-neutral-500">这里可以编辑、测试和扫描单个数据源。</p>
          </div>
          <button @click="openSourceModal()" class="ml-auto rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white">+ 添加数据源</button>
        </div>

        <div v-if="sources.length === 0" class="text-sm text-neutral-500">这个主题下还没有数据源。</div>
        <div v-else class="space-y-2">
          <div
            v-for="source in sources"
            :key="source.id"
            class="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950"
          >
            <div class="flex flex-wrap items-center gap-2">
              <span class="rounded px-2 py-0.5 text-xs uppercase" :class="source.type === 'local' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'">{{ source.type }}</span>
              <span class="font-medium">{{ source.label || (source.type === 'local' ? source.local_path : source.webdav_url) }}</span>
              <span v-if="!source.enabled" class="text-xs text-amber-500">已禁用</span>
              <div class="ml-auto flex flex-wrap gap-2">
                <button @click="testSource(source)" class="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs dark:border-neutral-700">测试</button>
                <button @click="scanSource(source)" class="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs text-white">扫描</button>
                <button @click="openSourceModal(source)" class="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs dark:border-neutral-700">编辑</button>
                <button @click="deleteSource(source)" class="rounded-lg border border-red-300 px-2.5 py-1 text-xs text-red-600 dark:border-red-900">删除</button>
              </div>
            </div>
            <div class="mt-2 break-all text-xs text-neutral-500">{{ source.type === 'local' ? source.local_path : source.webdav_url }}</div>
            <div v-if="source._test" class="mt-2 text-xs" :class="source._test.ok ? 'text-green-600' : 'text-red-500'">{{ source._test.message }}</div>
          </div>
        </div>
      </section>

      <section class="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 class="text-lg font-bold">修改密码</h2>
        <form class="mt-3 flex max-w-2xl flex-wrap gap-2" @submit.prevent="changePassword">
          <input v-model="pwd.current" type="password" placeholder="当前密码" class="min-w-[180px] flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950" />
          <input v-model="pwd.next" type="password" placeholder="新密码" class="min-w-[180px] flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950" />
          <button class="rounded-lg bg-neutral-900 px-4 py-2 text-white dark:bg-neutral-100 dark:text-black">保存</button>
        </form>
        <p v-if="pwdMsg" class="mt-2 text-sm" :class="pwdOk ? 'text-green-600' : 'text-red-500'">{{ pwdMsg }}</p>
      </section>
    </div>

    <div v-if="themeModal.open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @click.self="themeModal.open = false">
      <div class="w-full max-w-md rounded-2xl bg-white p-5 dark:bg-neutral-900">
        <h3 class="mb-3 text-lg font-bold">{{ themeModal.id ? '编辑主题' : '新建主题' }}</h3>
        <label class="mb-1 block text-sm text-neutral-500">主题名</label>
        <input v-model="themeModal.name" class="mb-3 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950" />
        <label class="mb-1 block text-sm text-neutral-500">排序</label>
        <input v-model.number="themeModal.sort_order" type="number" class="mb-4 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950" />
        <div class="flex justify-end gap-2">
          <button @click="themeModal.open = false" class="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700">取消</button>
          <button @click="saveTheme" class="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white">保存</button>
        </div>
      </div>
    </div>

    <div v-if="sourceModal.open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @click.self="sourceModal.open = false">
      <div class="max-h-[90vh] w-full max-w-md overflow-auto rounded-2xl bg-white p-5 dark:bg-neutral-900">
        <h3 class="mb-3 text-lg font-bold">{{ sourceModal.id ? '编辑数据源' : '添加数据源' }}</h3>
        <label class="mb-1 block text-sm text-neutral-500">类型</label>
        <select v-model="sourceModal.type" class="mb-3 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950">
          <option value="local">local 本地目录</option>
          <option value="webdav">webdav 远程</option>
        </select>
        <label class="mb-1 block text-sm text-neutral-500">标签</label>
        <input v-model="sourceModal.label" class="mb-3 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950" />

        <template v-if="sourceModal.type === 'local'">
          <label class="mb-1 block text-sm text-neutral-500">本地目录绝对路径</label>
          <input v-model="sourceModal.local_path" placeholder="D:\\Media\\Channels" class="mb-3 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950" />
        </template>
        <template v-else>
          <label class="mb-1 block text-sm text-neutral-500">WebDAV URL</label>
          <input v-model="sourceModal.webdav_url" placeholder="https://host/dav/path" class="mb-3 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950" />
          <label class="mb-1 block text-sm text-neutral-500">用户名</label>
          <input v-model="sourceModal.webdav_username" class="mb-3 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950" />
          <label class="mb-1 block text-sm text-neutral-500">密码</label>
          <input v-model="sourceModal.webdav_password" type="password" class="mb-3 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950" />
        </template>

        <div class="flex justify-end gap-2">
          <button @click="sourceModal.open = false" class="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700">取消</button>
          <button @click="testSourceFromModal" class="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700">测试连接</button>
          <button @click="saveSource" class="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white">保存</button>
        </div>
        <p v-if="sourceModal.testMsg" class="mt-2 text-sm" :class="sourceModal.testOk ? 'text-green-600' : 'text-red-500'">{{ sourceModal.testMsg }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { api } from '../api';

const authed = ref(false);
const authLoading = ref(false);
const authPassword = ref('');
const authError = ref('');

const themes = ref([]);
const selectedTheme = ref(null);
const sources = ref([]);

const scanJobs = ref([]);
const maxConcurrent = ref(2);
const activeJobId = ref(null);
let stopJobsStream = null;
const jobStreams = new Map();

const themeModal = ref({ open: false, id: null, name: '', sort_order: 0 });
const sourceModal = ref({
  open: false,
  id: null,
  theme_id: null,
  type: 'local',
  label: '',
  local_path: '',
  webdav_url: '',
  webdav_username: '',
  webdav_password: '',
  testMsg: '',
  testOk: false
});

const pwd = ref({ current: '', next: '' });
const pwdMsg = ref('');
const pwdOk = ref(false);

const activeJobs = computed(() => scanJobs.value.filter((job) => job.status === 'queued' || job.status === 'running' || job.status === 'done' || job.status === 'error'));

function jobPercent(job) {
  if (job.status === 'done') return 100;
  if (job.status === 'error') return 100;
  const total = job.progress && job.progress.total ? job.progress.total : 0;
  const current = job.progress && job.progress.current ? job.progress.current : 0;
  if (!total) return job.status === 'queued' ? 5 : 10;
  return Math.min(99, Math.max(1, Math.round((current / total) * 100)));
}

function mergeJob(job) {
  const idx = scanJobs.value.findIndex((j) => j.id === job.id);
  if (idx >= 0) {
    scanJobs.value[idx] = { ...scanJobs.value[idx], ...job };
  } else {
    scanJobs.value = [...scanJobs.value, job];
  }
  scanJobs.value.sort((a, b) => (a.queued_at < b.queued_at ? -1 : 1));
}

function scheduleJobRemoval(jobId, delayMs = 2500) {
  window.setTimeout(() => {
    scanJobs.value = scanJobs.value.filter((job) => job.id !== jobId);
    const stop = jobStreams.get(jobId);
    if (stop) {
      try { stop(); } catch (_) {}
      jobStreams.delete(jobId);
    }
  }, delayMs);
}

function stopAllJobStreams() {
  if (stopJobsStream) {
    stopJobsStream();
    stopJobsStream = null;
  }
  for (const stop of jobStreams.values()) {
    try { stop(); } catch (_) {}
  }
  jobStreams.clear();
}

function openJobStream(jobId) {
  if (jobStreams.has(jobId)) return;
  const stop = api.scanJobStream(jobId, (event) => {
    if (event.type === 'replay' && event.job) {
      mergeJob(event.job);
      return;
    }
    if (event.type === 'list' && Array.isArray(event.jobs)) {
      scanJobs.value = event.jobs;
      return;
    }
    const existing = scanJobs.value.find((job) => job.id === jobId) || { id: jobId };
    if (event.type === 'done' || event.type === 'error') {
      mergeJob({
        ...existing,
        status: event.type === 'done' ? 'done' : 'error',
        error: event.message || existing.error,
        finished_at: event.finished_at || existing.finished_at,
        summary: existing.summary,
        phase: event.type === 'done' ? '完成' : '错误'
      });
      if (activeJobId.value === jobId) activeJobId.value = null;
      scheduleJobRemoval(jobId);
      return;
    }
    const patch = { ...existing };
    if (event.type === 'queued') patch.status = 'queued';
    if (event.type === 'start') patch.status = 'running';
    if (event.type === 'scan_done') patch.progress = { ...(patch.progress || {}), total: event.total || 0 };
    if (event.type === 'progress') patch.progress = { current: event.current || 0, total: event.total || 0 };
    if (event.type === 'process_done') patch.summary = `新增 ${event.inserted}，更新 ${event.updated}，失败 ${event.failed}`;
    if (event.type === 'warn') patch.summary = event.message;
    if (event.phase) patch.phase = event.phase;
    mergeJob({ ...patch });
  });
  jobStreams.set(jobId, stop);
}

function syncJobStreams() {
  const activeIds = new Set(scanJobs.value.map((job) => job.id));
  for (const id of activeIds) openJobStream(id);
  for (const [id, stop] of jobStreams.entries()) {
    if (!activeIds.has(id)) {
      try { stop(); } catch (_) {}
      jobStreams.delete(id);
    }
  }
}

async function refreshJobs() {
  const data = await api.listScanJobs().catch(() => ({ jobs: [], max_concurrent: 2 }));
  scanJobs.value = data.jobs || [];
  maxConcurrent.value = data.max_concurrent || 2;
  syncJobStreams();
}

function startJobsListStream() {
  if (stopJobsStream) return;
  stopJobsStream = api.scanJobsStream((event) => {
    if (event.type === 'list' && Array.isArray(event.jobs)) {
      scanJobs.value = event.jobs;
      syncJobStreams();
    }
  });
}

async function refreshAuth() {
  const me = await api.me().catch(() => ({ authed: false }));
  authed.value = !!me.authed;
}

async function loadThemes() {
  themes.value = await api.adminThemes().catch(() => []);
}

async function reloadData() {
  await refreshAuth();
  if (!authed.value) return;
  await loadThemes();
  if (selectedTheme.value) {
    await selectTheme(selectedTheme.value);
  }
  await refreshJobs();
}

async function submitLogin() {
  authLoading.value = true;
  authError.value = '';
  try {
    await api.login(authPassword.value);
    authPassword.value = '';
    await refreshAll();
  } catch (error) {
    authError.value = error.message || '登录失败';
  } finally {
    authLoading.value = false;
  }
}

async function logout() {
  await api.logout().catch(() => {});
  stopAllJobStreams();
  authed.value = false;
  selectedTheme.value = null;
  sources.value = [];
  scanJobs.value = [];
}

async function refreshAll() {
  const result = await api.enqueueAllScan(false);
  if (result && Array.isArray(result.jobs)) {
    for (const job of result.jobs) {
      mergeJob(job);
      openJobStream(job.id);
    }
  }
  await refreshJobs();
}

function openThemeModal(theme = null) {
  themeModal.value = {
    open: true,
    id: theme ? theme.id : null,
    name: theme ? theme.name : '',
    sort_order: theme ? theme.sort_order : 0
  };
}

async function saveTheme() {
  const current = themeModal.value;
  if (!current.name.trim()) {
    alert('主题名不能为空');
    return;
  }
  try {
    if (current.id) {
      await api.updateTheme(current.id, { name: current.name.trim(), sort_order: current.sort_order });
    } else {
      await api.createTheme(current.name.trim(), current.sort_order);
    }
    current.open = false;
    await loadThemes();
  } catch (error) {
    alert(error.message);
  }
}

async function deleteTheme(theme) {
  if (!confirm(`删除主题“${theme.name}”及其数据源？`)) return;
  await api.deleteTheme(theme.id);
  if (selectedTheme.value && selectedTheme.value.id === theme.id) {
    selectedTheme.value = null;
    sources.value = [];
  }
  await loadThemes();
}

async function selectTheme(theme) {
  selectedTheme.value = theme;
  sources.value = await api.sources(theme.id).catch(() => []);
}

function openSourceModal(source = null) {
  sourceModal.value = {
    open: true,
    id: source ? source.id : null,
    theme_id: source ? source.theme_id : selectedTheme.value?.id || null,
    type: source ? source.type : 'local',
    label: source ? source.label : '',
    local_path: source ? source.local_path : '',
    webdav_url: source ? source.webdav_url : '',
    webdav_username: source ? source.webdav_username : '',
    webdav_password: source ? source.webdav_password : '',
    testMsg: '',
    testOk: false
  };
}

async function saveSource() {
  const current = sourceModal.value;
  const payload = {
    type: current.type,
    label: current.label,
    local_path: current.local_path || null,
    webdav_url: current.webdav_url || null,
    webdav_username: current.webdav_username || null,
    webdav_password: current.webdav_password || null
  };

  try {
    if (current.id) {
      await api.updateSource(current.id, payload);
    } else {
      await api.addSource(current.theme_id, payload);
    }
    current.open = false;
    if (selectedTheme.value) {
      sources.value = await api.sources(selectedTheme.value.id).catch(() => []);
    }
    await loadThemes();
  } catch (error) {
    alert(error.message);
  }
}

async function deleteSource(source) {
  if (!confirm('删除此数据源？已扫描的内容不会自动恢复。')) return;
  await api.deleteSource(source.id);
  if (selectedTheme.value) {
    sources.value = await api.sources(selectedTheme.value.id).catch(() => []);
  }
  await loadThemes();
}

async function testSource(payload) {
  try {
    return await api.testSource(payload);
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

async function testSourceFromModal() {
  const current = sourceModal.value;
  current.testMsg = '测试中...';
  current.testOk = false;
  const result = await testSource({
    type: current.type,
    local_path: current.local_path,
    webdav_url: current.webdav_url,
    webdav_username: current.webdav_username,
    webdav_password: current.webdav_password
  });
  current.testOk = !!result.ok;
  current.testMsg = result.message;
}

async function testSourceList(source) {
  source._test = await testSource({
    type: source.type,
    local_path: source.local_path,
    webdav_url: source.webdav_url,
    webdav_username: source.webdav_username,
    webdav_password: source.webdav_password
  });
}

async function scanTheme(theme) {
  const job = await api.enqueueScan('theme', theme.id, false);
  mergeJob(job);
  openJobStream(job.id);
  await refreshJobs();
}

async function scanSource(source) {
  const job = await api.enqueueScan('source', source.id, false);
  mergeJob(job);
  openJobStream(job.id);
  await refreshJobs();
}

async function changePassword() {
  pwdMsg.value = '';
  pwdOk.value = false;
  try {
    await api.changePassword(pwd.value.current, pwd.value.next);
    pwdOk.value = true;
    pwdMsg.value = '密码已更新';
    pwd.value = { current: '', next: '' };
  } catch (error) {
    pwdMsg.value = error.message;
  }
}

async function exportConfig(includeSecrets = false) {
  try {
    const blob = await api.exportConfig(includeSecrets);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lewdland-config-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    alert(`导出失败: ${error.message}`);
  }
}

async function onImportFile(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    await api.importConfig(payload, { dryRun: false, createMissing: true });
    await refreshAll();
  } catch (error) {
    alert(`导入失败: ${error.message}`);
  }
}

async function clearFinishedJobs() {
  scanJobs.value = scanJobs.value.filter((job) => job.status === 'queued' || job.status === 'running');
}

onMounted(async () => {
  await refreshAuth();
  if (!authed.value) return;
  await loadThemes();
  await refreshJobs();
  startJobsListStream();
});

onBeforeUnmount(() => {
  stopAllJobStreams();
});
</script>
