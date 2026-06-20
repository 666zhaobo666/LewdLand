<template>
  <div>
    <div v-if="loading" class="py-20 text-center text-neutral-400">加载中...</div>

    <div v-else-if="themes.length === 0" class="py-20 text-center">
      <p class="mb-2 text-neutral-400">还没有任何主题</p>
      <router-link to="/admin" class="text-blue-500 hover:underline">
        前往管理页面添加主题与资源地址 →
      </router-link>
    </div>

    <div v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      <router-link
        v-for="t in themes"
        :key="t.id"
        :to="`/theme/${t.id}`"
        class="group relative aspect-[4/3] overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100 transition hover:shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
      >
        <img
          v-if="t.cover"
          :src="api.thumbUrl(t.cover)"
          :alt="t.name"
          class="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105"
        />
        <div
          v-else
          class="absolute inset-0 flex items-center justify-center text-4xl text-neutral-300 dark:text-neutral-700"
        >
          无封面
        </div>
        <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent"></div>
        <div class="absolute inset-x-0 bottom-0 p-3">
          <div class="clamp-2 font-semibold text-white">{{ t.name }}</div>
          <div class="mt-0.5 text-xs text-white/75">{{ t.message_count }} 条资源</div>
        </div>
      </router-link>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { api } from '../api';

const themes = ref([]);
const loading = ref(true);

onMounted(async () => {
  try {
    themes.value = await api.themes();
  } catch (error) {
    console.error(error);
  } finally {
    loading.value = false;
  }
});
</script>
