<template>
  <div>
    <div v-if="!authed" class="py-20 text-center">
      <p class="mb-3 text-neutral-400">需要管理员登录</p>
      <router-link to="/login" class="text-blue-500 hover:underline">去登录 →</router-link>
    </div>

    <div v-else class="space-y-8">
      <section>
        <div class="mb-3 flex flex-wrap items-center gap-3">
          <h2 class="text-lg font-bold">主题</h2>
          <button @click="openTheme()" class="ml-auto rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white">
            + 新建主题
          </button>
          <button
            @click="exportConfig()"
            title="导出所有主题与数据源配置为 JSON 文件"
            class="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
          >
            导出配置
          </button>
          <label
            class="cursor-pointer rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
            title="从 JSON 文件导入主题与数据源"
          >
            导入配置
            <input type="file" accept="application/json" class="hidden" @change="onImportFile" />
          </label>
          <button
            @click="scanAll(forceRescan)"
            class="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white"
            title="对所有启用的数据源启动一次后台扫描"
          >
            扫描全部
          </button>
          <button
            @click="logout"
            class="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
          >
            退出
          </button>
        </div>

        <div v-if="jobs.length" class="mb-3 rounded-xl border border-neutral-200 p-3 text-xs dark:border-neutral-800">
          <div class="mb-2 flex items-center gap-2">
            <span class="font-semibold">扫描任务</span>
            <span class="text-neutral-400">{{ jobs.length }} 个 / 并发 {{ maxConcurrent }}</span>
            <button @click="clearFinishedJobs" class="ml-auto text-blue-500 hover:underline">刷新</button>
          </div>
          <ul class="space-y-1">
            <li
              v-for="j in jobs" :key="j.id"
              class="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              :class="j.status === 'running' ? 'bg-emerald-50 dark:bg-emerald-950/30' : ''"
            >
              <span
                class="inline-block h-2 w-2 rounded-full"
                :class="j.status === 'queued' ? 'bg-neutral-400' : j.status === 'running' ? 'bg-emerald-500' : j.status === 'done' ? 'bg-blue-500' : 'bg-red-500'"
              ></span>
              <button
                v-if="j.status === 'queued' || j.status === 'running'"
                @click="showJobInModal(j)"
                class="flex-1 truncate text-left hover:underline"
              >{{ j.label || j.id }}</button>
              <span v-else class="flex-1 truncate text-left">{{ j.label || j.id }}</span>
              <span class="shrink-0 text-neutral-400">
                <template v-if="j.status === 'queued'">排队中</template>
                <template v-else-if="j.status === 'running'">{{ j.progress.current }}/{{ j.progress.total }}</template>
                <template v-else-if="j.status === 'done'">完成 ({{ (j.duration_ms / 1000).toFixed(1) }}s)</template>
                <template v-else>错误</template>
              </span>
            </li>
          </ul>
        </div>

        <div v-if="importReport" class="mb-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs dark:border-blue-900 dark:bg-blue-950/30">
          <div class="mb-1 font-semibold">导入预览 (dry-run)</div>
          <div>主题: 复用 {{ importReport.themes.reused.length }}, 将创建 {{ importReport.themes.created.length }}, 跳过 {{ importReport.themes.skipped.length }}</div>
          <div>数据源: 将创建 {{ importReport.sources.created.length }}, 跳过 {{ importReport.sources.skipped.length }}</div>
          <div v-if="importReport.errors.length" class="mt-1 text-red-500">
            错误: {{ importReport.errors.join('; ') }}
          </div>
          <div class="mt-2 flex gap-2">
            <button @click="confirmImport(true)" class="rounded bg-blue-600 px-2 py-1 text-white">确认导入</button>
            <button @click="importReport = null" class="rounded border border-neutral-300 px-2 py-1">取消</button>
          </div>
        </div>

        <div v-if="themes.length === 0" class="text-sm text-neutral-400">还没有主题，点击“新建主题”添加。</div>

        <div v-else class="space-y-2">
          <div
            v-for="t in themes"
            :key="t.id"
            class="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800"
          >
            <div class="flex items-center gap-2">
              <span class="font-medium">{{ t.name }}</span>
              <span class="text-xs text-neutral-400">{{ t.source_count }} 源 · {{ t.message_count }} 资源</span>
              <div class="ml-auto flex gap-1">
                <button @click="openTheme(t)" class="rounded px-2 py-1 text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800">
                  编辑
                </button>
                <button @click="openSources(t)" class="rounded px-2 py-1 text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800">
                  数据源
                </button>
                <button @click="scanTheme(t)" class="rounded bg-green-600 px-2 py-1 text-xs text-white">
                  扫描
                </button>
                <button
                  @click="delTheme(t)"
                  class="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        v-if="activeTheme"
        class="rounded-2xl border border-blue-300 bg-blue-50/50 p-4 dark:border-blue-800 dark:bg-blue-950/30"
      >
        <div class="mb-3 flex items-center gap-2">
          <h3 class="font-bold">{{ activeTheme.name }} · 数据源</h3>
          <button @click="openSource()" class="ml-auto rounded bg-blue-600 px-2.5 py-1 text-xs text-white">
            + 添加数据源
          </button>
        </div>

        <div v-if="sources.length === 0" class="text-sm text-neutral-400">暂无数据源</div>

        <div v-else class="space-y-2">
          <div
            v-for="s in sources"
            :key="s.id"
            class="rounded-lg border border-neutral-200 bg-white p-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div class="flex items-center gap-2">
              <span
                class="rounded px-1.5 py-0.5 text-[10px] uppercase"
                :class="
                  s.type === 'local'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                "
              >
                {{ s.type }}
              </span>
              <span class="text-neutral-500">{{ s.label || (s.type === 'local' ? s.local_path : s.webdav_url) }}</span>
              <span v-if="!s.enabled" class="text-xs text-amber-500">已禁用</span>
              <div class="ml-auto flex gap-1">
                <button @click="testSource(s)" class="rounded px-2 py-1 text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800">
                  测试
                </button>
                <button @click="scanSource(s)" class="rounded bg-green-600 px-2 py-1 text-xs text-white">
                  扫描
                </button>
                <button @click="openSource(s)" class="rounded px-2 py-1 text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800">
                  编辑
                </button>
                <button
                  @click="delSource(s)"
                  class="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                >
                  删除
                </button>
              </div>
            </div>
            <div class="mt-1 break-all text-xs text-neutral-400">
              {{ s.type === 'local' ? s.local_path : s.webdav_url }}
            </div>
            <div v-if="s._test" class="mt-1 text-xs" :class="s._test.ok ? 'text-green-600' : 'text-red-500'">
              {{ s._test.message }}
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 class="mb-3 text-lg font-bold">修改密码</h2>
        <form @submit.prevent="changePwd" class="flex max-w-xl flex-wrap gap-2">
          <input
            v-model="pwd.current"
            type="password"
            placeholder="当前密码"
            class="min-w-[140px] flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <input
            v-model="pwd.next"
            type="password"
            placeholder="新密码"
            class="min-w-[140px] flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button class="rounded-lg bg-neutral-800 px-4 py-2 text-white dark:bg-neutral-200 dark:text-black">
            保存
          </button>
        </form>
        <p v-if="pwdMsg" class="mt-2 text-sm" :class="pwdOk ? 'text-green-600' : 'text-red-500'">{{ pwdMsg }}</p>
      </section>
    </div>

    <div
      v-if="themeModal.open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      @click.self="themeModal.open = false"
    >
      <div class="w-full max-w-md rounded-2xl bg-white p-5 dark:bg-neutral-900">
        <h3 class="mb-3 font-bold">{{ themeModal.id ? '编辑主题' : '新建主题' }}</h3>
        <label class="mb-1 block text-sm text-neutral-500">主题名（不可重复）</label>
        <input
          v-model="themeModal.name"
          class="mb-3 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <label class="mb-1 block text-sm text-neutral-500">排序（数字越小越靠前）</label>
        <input
          v-model.number="themeModal.sort_order"
          type="number"
          class="mb-4 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <div class="flex justify-end gap-2">
          <button
            @click="themeModal.open = false"
            class="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
          >
            取消
          </button>
          <button @click="saveTheme" class="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white">保存</button>
        </div>
      </div>
    </div>

    <div
      v-if="srcModal.open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      @click.self="srcModal.open = false"
    >
      <div class="max-h-[90vh] w-full max-w-md overflow-auto rounded-2xl bg-white p-5 dark:bg-neutral-900">
        <h3 class="mb-3 font-bold">{{ srcModal.id ? '编辑数据源' : '添加数据源' }}</h3>
        <label class="mb-1 block text-sm text-neutral-500">类型</label>
        <select
          v-model="srcModal.type"
          class="mb-3 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        >
          <option value="local">local 本地目录</option>
          <option value="webdav">webdav 远程</option>
        </select>
        <label class="mb-1 block text-sm text-neutral-500">标签（可选）</label>
        <input
          v-model="srcModal.label"
          class="mb-3 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        />

        <template v-if="srcModal.type === 'local'">
          <label class="mb-1 block text-sm text-neutral-500">本地目录绝对路径</label>
          <input
            v-model="srcModal.local_path"
            placeholder="D:\\Media\\Channels"
            class="mb-3 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </template>

        <template v-else>
          <label class="mb-1 block text-sm text-neutral-500">WebDAV URL</label>
          <input
            v-model="srcModal.webdav_url"
            placeholder="https://host/dav/path"
            class="mb-3 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <label class="mb-1 block text-sm text-neutral-500">用户名</label>
          <input
            v-model="srcModal.webdav_username"
            class="mb-3 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <label class="mb-1 block text-sm text-neutral-500">密码</label>
          <input
            v-model="srcModal.webdav_password"
            type="password"
            class="mb-3 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </template>

        <div class="flex justify-end gap-2">
          <button
            @click="srcModal.open = false"
            class="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
          >
            取消
          </button>
          <button
            @click="testSrc"
            class="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
          >
            测试连接
          </button>
          <button @click="saveSource" class="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white">保存</button>
        </div>
        <p v-if="srcModal.testMsg" class="mt-2 text-sm" :class="srcModal.testOk ? 'text-green-600' : 'text-red-500'">
          {{ srcModal.testMsg }}
        </p>
      </div>
    </div>

    <div v-if="scan.active" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div class="w-full max-w-lg rounded-2xl bg-white p-5 dark:bg-neutral-900">
        <h3 class="mb-1 font-bold">{{ scan.title }}</h3>
        <div class="mb-3 break-all text-sm text-neutral-500">{{ scan.phase }}</div>

        <div class="mb-2 h-3 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
          <div class="h-full bg-blue-600 transition-all duration-300" :style="{ width: `${progressPercent}%` }"></div>
        </div>
        <div class="mb-3 text-center text-xs text-neutral-400">
          {{ scan.total > 0 ? `${scan.current} / ${scan.total}` : scan.done ? '完成' : '准备中...' }}
        </div>

        <div
          v-if="scan.logs.length"
          class="mb-3 max-h-28 space-y-0.5 overflow-auto rounded-lg bg-amber-50 p-2 text-xs text-amber-600 dark:bg-amber-950/30 dark:text-amber-400"
        >
          <div v-for="(line, index) in scan.logs.slice(-20)" :key="index">{{ line }}</div>
        </div>

        <div
          v-if="scan.done"
          class="mb-3 whitespace-pre-line rounded-lg bg-neutral-100 p-3 text-sm dark:bg-neutral-800"
        >
          {{ scan.summary }}
        </div>

        <div class="flex justify-end gap-2">
          <button
            v-if="!scan.done"
            disabled
            class="cursor-not-allowed rounded-lg bg-neutral-300 px-4 py-2 text-sm text-neutral-500 dark:bg-neutral-700"
          >
            扫描中...
          </button>
          <button v-else @click="closeScan" class="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { api } from '../api';

const authed = ref(false);
const themes = ref([]);
const sources = ref([]);
const activeTheme = ref(null);

const scan = ref({
  active: false,
  jobId: null,
  title: '',
  phase: '',
  current: 0,
  total: 0,
  logs: [],
  done: false,
  summary: ''
});

const importReport = ref(null);
const importPayload = ref(null);
const forceRescan = ref(false);
let stopScanStream = null;

const progressPercent = computed(() => {
  if (scan.value.done) return 100;
  if (!scan.value.total) return scan.value.active ? 8 : 0;
  return Math.min(99, Math.round((scan.value.current / scan.value.total) * 100));
});

const themeModal = ref({ open: false, id: null, name: '', sort_order: 0 });
const srcModal = ref({
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

async function refreshAuth() {
  authed.value = (await api.me().catch(() => ({ authed: false }))).authed;
}

async function loadThemes() {
  themes.value = await api.adminThemes().catch(() => []);
}

async function logout() {
  await api.logout();
  authed.value = false;
}

function openTheme(theme) {
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

async function delTheme(theme) {
  if (!confirm(`删除主题“${theme.name}”及其所有数据源和已扫描资源？`)) return;
  await api.deleteTheme(theme.id);
  if (activeTheme.value && activeTheme.value.id === theme.id) {
    activeTheme.value = null;
    sources.value = [];
  }
  await loadThemes();
}

async function openSources(theme) {
  activeTheme.value = theme;
  sources.value = await api.sources(theme.id).catch(() => []);
}

function openSource(source) {
  srcModal.value = {
    open: true,
    id: source ? source.id : null,
    theme_id: source ? source.theme_id : activeTheme.value?.id || null,
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
  const current = srcModal.value;
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
    if (activeTheme.value) {
      sources.value = await api.sources(activeTheme.value.id);
    }
  } catch (error) {
    alert(error.message);
  }
}

async function testSrc() {
  const current = srcModal.value;
  current.testMsg = '测试中...';
  current.testOk = false;
  try {
    const result = await api.testSource({
      type: current.type,
      local_path: current.local_path,
      webdav_url: current.webdav_url,
      webdav_username: current.webdav_username,
      webdav_password: current.webdav_password
    });
    current.testOk = result.ok;
    current.testMsg = result.message;
  } catch (error) {
    current.testOk = false;
    current.testMsg = error.message;
  }
}

async function testSource(source) {
  source._test = { ok: false, message: '测试中...' };
  try {
    source._test = await api.testSource({
      type: source.type,
      local_path: source.local_path,
      webdav_url: source.webdav_url,
      webdav_username: source.webdav_username,
      webdav_password: source.webdav_password
    });
  } catch (error) {
    source._test = { ok: false, message: error.message };
  }
}

async function delSource(source) {
  if (!confirm('删除此数据源？已扫描的资源也会一并删除。')) return;
  await api.deleteSource(source.id);
  if (activeTheme.value) {
    sources.value = await api.sources(activeTheme.value.id);
  }
}

function startScan(scope, id, title, force = false, afterDone) {
  if (scan.value.active) return;

  scan.value = {
    active: true,
    title,
    phase: '正在扫描目录...',
    current: 0,
    total: 0,
    logs: [],
    done: false,
    summary: ''
  };

  stopScanStream = api.scanStream(scope, id, force, async (event) => {
    if (event.type === 'start') {
      const sourceType = event.source_type || 'local';
      scan.value.phase = `开始扫描（源 #${event.source_id} / ${sourceType}）`;
    } else if (event.type === 'scan_done') {
      scan.value.total = event.total || 0;
      scan.value.phase = `发现 ${event.total || 0} 条资源，开始处理...`;
    } else if (event.type === 'progress') {
      scan.value.current = event.current || 0;
      scan.value.total = event.total || 0;
      scan.value.phase = `处理中: ${event.dir}`;
    } else if (event.type === 'process_done') {
      scan.value.phase = '处理完成，正在清理旧数据...';
    } else if (event.type === 'warn') {
      scan.value.logs.push(event.message);
    } else if (event.type === 'done') {
      scan.value.done = true;
      scan.value.current = scan.value.total || scan.value.current;
      scan.value.phase = '扫描完成';
      scan.value.summary = (event.results || [])
        .map((item) =>
          item.error
            ? `源 #${item.source_id}: 错误 ${item.error}`
            : `源 #${item.source_id}: 新增 ${item.inserted}，更新 ${item.updated}，失败 ${item.failed}，清理 ${item.pruned}`
        )
        .join('\n');
      if (afterDone) await afterDone();
    } else if (event.type === 'error') {
      scan.value.done = true;
      scan.value.phase = '扫描出错';
      scan.value.summary = `错误: ${event.message}`;
    }
  });
}

function scanTheme(theme) {
  startScan('theme', theme.id, `主题“${theme.name}”`, false, loadThemes);
}

function scanSource(source) {
  startScan('source', source.id, `数据源“${source.label || source.id}”`, false, async () => {
    if (activeTheme.value) {
      sources.value = await api.sources(activeTheme.value.id);
    }
    await loadThemes();
  });
}

function closeScan() {
  if (stopScanStream) {
    stopScanStream();
    stopScanStream = null;
  }
  scan.value.active = false;
}

async function changePwd() {
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

onMounted(async () => {
  await refreshAuth();
  if (authed.value) {
    startJobsListStream();
    jobs.value = (await api.listScanJobs().catch(() => ({ jobs: [] }))).jobs;
    await loadThemes();
  }
});
onBeforeUnmount(() => {
  stopJobsListStream();
  for (const stop of jobStreams.values()) { try { stop(); } catch (_) {} }
  jobStreams.clear();
});

// ---------- Config export / import ----------

async function exportConfig(includeSecrets = false) {
  try {
    const blob = await api.exportConfig(includeSecrets);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    a.download = `lewdland-config-${ts}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    alert('导出失败: ' + (e && e.message ? e.message : e));
  }
}

async function onImportFile(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = ''; // allow re-selecting the same file
  if (!file) return;
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    if (!payload || typeof payload !== 'object') throw new Error('不是有效的 JSON');
    importPayload.value = payload;
    const report = await api.importConfig(payload, { dryRun: true, createMissing: true });
    importReport.value = report;
  } catch (e) {
    alert('导入失败: ' + (e && e.message ? e.message : e));
  }
}

async function confirmImport() {
  if (!importPayload.value) return;
  try {
    const report = await api.importConfig(importPayload.value, { dryRun: false, createMissing: true });
    importReport.value = report;
    importPayload.value = null;
    await loadThemes();
  } catch (e) {
    alert('导入失败: ' + (e && e.message ? e.message : e));
  }
}
</script>
