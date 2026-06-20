<template>
  <div>
    <div class="flex flex-wrap items-center gap-3 mb-5">
      <router-link to="/" class="text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200">← 主题</router-link>
      <h1 class="text-xl font-bold">{{ themeName || '主题' }}</h1>
      <span class="text-sm text-neutral-400">{{ total }} 条</span>
      <div class="ml-auto flex items-center gap-2">
        <input v-model="q" @keyup.enter="reload" type="text" placeholder="搜索 标签/简介/频道…"
          class="w-44 sm:w-64 px-3 py-1.5 rounded-lg text-sm border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 outline-none focus:border-blue-400" />
        <button @click="reload" class="px-3 py-1.5 rounded-lg text-sm bg-neutral-800 text-white dark:bg-neutral-200 dark:text-black">搜索</button>
        <select v-model.number="limit" @change="reload" class="px-2 py-1.5 rounded-lg text-sm border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900">
          <option :value="20">20/页</option>
          <option :value="50">50/页</option>
          <option :value="100">100/页</option>
        </select>
      </div>
    </div>

    <div v-if="loading" class="text-center py-20 text-neutral-400">加载中…</div>
    <div v-else-if="items.length === 0" class="text-center py-20 text-neutral-400">
      没有匹配的资源{{ q ? '，换个关键词试试' : '' }}
    </div>

    <div v-else class="grid grid-cols-2 lg:grid-cols-3 gap-4">
      <router-link v-for="m in items" :key="m.id" :to="`/message/${m.id}`"
        class="group rounded-2xl overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:shadow-lg transition flex flex-col">
        <div class="relative aspect-[4/3] bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
          <img v-if="m.thumb_path" :src="api.thumbUrl(m.thumb_path)" loading="lazy"
            class="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
          <div v-else class="w-full h-full flex items-center justify-center text-neutral-300 dark:text-neutral-700 text-4xl">🖼️</div>
          <div v-if="m.comment_count" class="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-[11px]">{{ m.main_count + m.comment_count }} 项</div>
        </div>
        <div class="p-3 flex-1 flex flex-col">
          <div v-if="m.tags_text" class="text-[11px] text-blue-500 mb-1 clamp-1">{{ m.tags_text }}</div>
          <div class="text-sm font-medium clamp-2">{{ m.title || '(无标题)' }}</div>
          <div class="mt-1 text-[11px] text-neutral-400 clamp-1">{{ m.source_chat }}</div>
        </div>
      </router-link>
    </div>

    <div v-if="totalPages > 1" class="flex items-center justify-center gap-2 mt-8">
      <button :disabled="page <= 1" @click="go(page - 1)" class="px-3 py-1.5 rounded-lg text-sm border border-neutral-300 dark:border-neutral-700 disabled:opacity-40">上一页</button>
      <span class="text-sm text-neutral-500">{{ page }} / {{ totalPages }}</span>
      <button :disabled="page >= totalPages" @click="go(page + 1)" class="px-3 py-1.5 rounded-lg text-sm border border-neutral-300 dark:border-neutral-700 disabled:opacity-40">下一页</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';

const route = useRoute();
const router = useRouter();
const themeId = computed(() => Number(route.params.id));

const themeName = ref('');
const items = ref([]);
const total = ref(0);
const loading = ref(true);
const page = ref(1);
const limit = ref(20);
const q = ref('');
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit.value)));

async function load() {
  loading.value = true;
  try {
    const [themes, data] = await Promise.all([api.themes(), api.themeMessages(themeId.value, { page: page.value, limit: limit.value, q: q.value })]);
    const t = themes.find((x) => x.id === themeId.value);
    themeName.value = t ? t.name : '';
    items.value = data.items;
    total.value = data.total;
  } catch (e) { console.error(e); }
  loading.value = false;
}

function reload() { page.value = 1; load(); }
function go(p) { page.value = p; load(); window.scrollTo({ top: 0, behavior: 'smooth' }); }

watch(() => route.params.id, () => { page.value = 1; q.value = ''; load(); });
onMounted(load);
</script>
