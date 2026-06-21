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
        v-for="theme in themes"
        :key="theme.id"
        :to="`/theme/${theme.id}`"
        class="group relative aspect-[4/3] overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100 transition hover:shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
      >
        <img
          v-if="theme.cover"
          :src="api.thumbUrl(theme.cover)"
          :alt="theme.name"
          class="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105"
        />
        <div v-else-if="theme.cover_video_message_id != null && theme.cover_video_index != null" class="absolute inset-0">
          <img
            v-if="!posterFailedIds.has(theme.id)"
            :src="api.posterUrl(theme.cover_video_message_id, theme.cover_video_index)"
            :alt="theme.name"
            class="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105"
            @error="markPosterFailed(theme.id)"
          />
          <div class="absolute inset-0 flex items-center justify-center">
            <div class="flex h-12 w-12 items-center justify-center rounded-full bg-black/45 text-xl text-white">▶</div>
          </div>
          <div
            v-if="posterFailedIds.has(theme.id)"
            class="absolute inset-x-3 bottom-3 rounded-lg bg-black/60 px-2 py-1 text-center text-xs text-white"
          >
            视频封面生成失败
          </div>
        </div>
        <div
          v-else
          class="absolute inset-0 flex items-center justify-center text-sm text-neutral-400 dark:text-neutral-500"
        >
          无封面
        </div>
        <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent"></div>
        <div class="absolute inset-x-0 bottom-0 p-3">
          <div class="clamp-2 font-semibold text-white">{{ theme.name }}</div>
          <div class="mt-0.5 text-xs text-white/75">{{ theme.message_count }} 条资源</div>
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
const posterFailedIds = ref(new Set());

function markPosterFailed(id) {
  if (posterFailedIds.value.has(id)) return;
  posterFailedIds.value = new Set([...posterFailedIds.value, id]);
}

onMounted(async () => {
  try {
    themes.value = await api.themes();
    posterFailedIds.value = new Set();
  } catch (error) {
    console.error(error);
  } finally {
    loading.value = false;
  }
});
</script>
