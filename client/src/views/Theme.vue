<template>
  <div>
    <div class="mb-5 flex flex-wrap items-center gap-3">
      <router-link to="/" class="text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200">
        ← 主题
      </router-link>
      <h1 class="text-xl font-bold">{{ themeName || '主题' }}</h1>
      <span class="text-sm text-neutral-400">{{ total }} 条</span>

      <div class="ml-auto flex flex-wrap items-center gap-2">
        <input
          v-model="q"
          @keyup.enter="reload"
          type="text"
          placeholder="搜索 标签 / 简介 / 标题 / 频道"
          class="w-44 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-400 dark:border-neutral-700 dark:bg-neutral-900 sm:w-64"
        />
        <button
          @click="reload"
          class="rounded-lg bg-neutral-800 px-3 py-1.5 text-sm text-white dark:bg-neutral-200 dark:text-black"
        >
          搜索
        </button>
        <select
          v-model.number="limit"
          @change="reload"
          class="rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        >
          <option :value="21">21 / 页</option>
          <option :value="51">51 / 页</option>
          <option :value="102">102 / 页</option>
        </select>
      </div>
    </div>

    <div v-if="loading" class="py-20 text-center text-neutral-400">加载中...</div>

    <div v-else-if="items.length === 0" class="py-20 text-center text-neutral-400">
      没有匹配的资源{{ q ? '，换个关键词试试' : '' }}
    </div>

    <div v-else class="grid grid-cols-2 gap-4 lg:grid-cols-3">
      <router-link
        v-for="m in items"
        :key="m.id"
        :to="`/message/${m.id}`"
        class="group flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white transition hover:shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div class="relative aspect-[4/3] overflow-hidden bg-neutral-100 dark:bg-neutral-800">
          <img
            v-if="m.thumb_path"
            :src="api.thumbUrl(m.thumb_path)"
            :alt="m.title || '资源封面'"
            loading="lazy"
            class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
          <div
            v-else
            class="flex h-full w-full items-center justify-center text-sm text-neutral-400 dark:text-neutral-500"
          >
            无封面
          </div>
          <div
            v-if="m.comment_count"
            class="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white"
          >
            {{ m.main_count + m.comment_count }} 项
          </div>
        </div>

        <div class="flex flex-1 flex-col p-3">
          <div v-if="m.tags_text" class="clamp-1 mb-1 text-[11px] text-blue-500">{{ m.tags_text }}</div>
          <div class="clamp-2 text-sm font-medium">{{ m.title || '(无标题)' }}</div>
          <div class="clamp-1 mt-1 text-[11px] text-neutral-400">{{ m.source_chat }}</div>
        </div>
      </router-link>
    </div>

    <div v-if="totalPages > 1" class="mt-8 flex flex-wrap items-center justify-center gap-2">
      <button
        :disabled="page <= 1"
        @click="go(page - 1)"
        class="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-neutral-700"
      >
        上一页
      </button>
      <span class="text-sm text-neutral-500">第 {{ page }} / {{ totalPages }} 页 · 共 {{ total }} 条</span>
      <button
        :disabled="page >= totalPages"
        @click="go(page + 1)"
        class="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-neutral-700"
      >
        下一页
      </button>
      <span class="ml-2 text-sm text-neutral-500">跳到</span>
      <input
        v-model.number="jumpInput"
        @keyup.enter="jumpPage"
        type="number"
        min="1"
        :max="totalPages"
        class="w-16 rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-center text-sm dark:border-neutral-700 dark:bg-neutral-900"
      />
      <span class="text-sm text-neutral-500">页</span>
      <button
        @click="jumpPage"
        class="rounded-lg bg-neutral-800 px-3 py-1.5 text-sm text-white dark:bg-neutral-200 dark:text-black"
      >
        跳转
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../api';

const route = useRoute();
const themeId = computed(() => Number(route.params.id));

const themeName = ref('');
const items = ref([]);
const total = ref(0);
const loading = ref(true);
const page = ref(1);
const limit = ref(21);
const q = ref('');
const jumpInput = ref(1);

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit.value)));

async function load() {
  loading.value = true;
  try {
    const [themes, data] = await Promise.all([
      api.themes(),
      api.themeMessages(themeId.value, { page: page.value, limit: limit.value, q: q.value })
    ]);
    const currentTheme = themes.find((item) => item.id === themeId.value);
    themeName.value = currentTheme ? currentTheme.name : '';
    items.value = data.items || [];
    total.value = data.total || 0;
    if (page.value > totalPages.value) {
      page.value = totalPages.value;
      jumpInput.value = totalPages.value;
      return load();
    }
    jumpInput.value = page.value;
  } catch (error) {
    console.error(error);
  } finally {
    loading.value = false;
  }
}

function reload() {
  page.value = 1;
  jumpInput.value = 1;
  load();
}

function go(nextPage) {
  page.value = nextPage;
  jumpInput.value = nextPage;
  load();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function jumpPage() {
  let nextPage = Number(jumpInput.value);
  if (!nextPage || nextPage < 1) nextPage = 1;
  if (nextPage > totalPages.value) nextPage = totalPages.value;
  go(nextPage);
}

watch(
  () => route.params.id,
  () => {
    page.value = 1;
    jumpInput.value = 1;
    q.value = '';
    load();
  }
);

onMounted(load);
</script>
