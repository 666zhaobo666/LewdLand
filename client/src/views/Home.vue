<template>
  <div>
    <div v-if="loading" class="text-center py-20 text-neutral-400">加载中…</div>
    <div v-else-if="themes.length === 0" class="text-center py-20">
      <p class="text-neutral-400 mb-2">还没有任何主题</p>
      <router-link to="/admin" class="text-blue-500 hover:underline">前往管理页面添加主题与资源地址 →</router-link>
    </div>
    <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      <router-link v-for="t in themes" :key="t.id" :to="`/theme/${t.id}`"
        class="group relative aspect-[4/3] rounded-2xl overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900 hover:shadow-lg transition">
        <div class="absolute inset-0 flex items-center justify-center text-neutral-300 dark:text-neutral-700 text-4xl">🗂️</div>
        <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent"></div>
        <div class="absolute bottom-0 left-0 right-0 p-3">
          <div class="text-white font-semibold clamp-2">{{ t.name }}</div>
          <div class="text-white/70 text-xs mt-0.5">{{ t.message_count }} 条资源</div>
        </div>
      </router-link>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api';

const themes = ref([]);
const loading = ref(true);

onMounted(async () => {
  try { themes.value = await api.themes(); } catch (e) { console.error(e); }
  loading.value = false;
});
</script>
