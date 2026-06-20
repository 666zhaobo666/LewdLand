<template>
  <div class="min-h-screen flex flex-col">
    <header class="sticky top-0 z-30 backdrop-blur bg-white/80 dark:bg-neutral-900/80 border-b border-neutral-200 dark:border-neutral-800">
      <div class="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">
        <router-link to="/" class="font-bold text-lg tracking-tight">LewdLand</router-link>
        <nav class="ml-auto flex items-center gap-1">
          <router-link to="/" class="px-3 py-1.5 rounded-lg text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800">首页</router-link>
          <router-link to="/admin" class="px-3 py-1.5 rounded-lg text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800">管理</router-link>
          <button @click="toggleTheme" class="ml-1 w-9 h-9 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center justify-center" :title="isDark ? '切换亮色' : '切换暗色'">
            <span v-if="isDark">☀️</span><span v-else>🌙</span>
          </button>
        </nav>
      </div>
    </header>
    <main class="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
      <router-view v-slot="{ Component, route }">
        <keep-alive include="theme">
          <component :is="Component" v-if="route.name === 'theme'" :key="route.name" />
        </keep-alive>
        <component :is="Component" v-if="route.name !== 'theme'" :key="route.fullPath" />
      </router-view>
    </main>
    <footer class="text-center text-xs text-neutral-400 py-6">LewdLand · 本地媒体库</footer>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const isDark = ref(false);

function apply(v) {
  isDark.value = v;
  document.documentElement.classList.toggle('dark', v);
  localStorage.setItem('lewland-theme', v ? 'dark' : 'light');
}
function toggleTheme() { apply(!isDark.value); }

onMounted(() => {
  isDark.value = document.documentElement.classList.contains('dark');
});
</script>
