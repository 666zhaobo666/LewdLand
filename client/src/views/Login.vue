<template>
  <div class="max-w-sm mx-auto mt-16">
    <h1 class="text-xl font-bold mb-4 text-center">管理员登录</h1>
    <form @submit.prevent="submit" class="space-y-3">
      <input v-model="password" type="password" placeholder="密码"
        class="w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 outline-none focus:border-blue-400" />
      <button :disabled="loading" class="w-full py-2.5 rounded-lg bg-neutral-800 text-white dark:bg-neutral-200 dark:text-black disabled:opacity-50">
        {{ loading ? '登录中…' : '登录' }}
      </button>
      <p v-if="err" class="text-sm text-red-500 text-center">{{ err }}</p>
    </form>
    <p class="mt-4 text-xs text-neutral-400 text-center">默认密码: admin(可在登录后修改)</p>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';

const password = ref('');
const loading = ref(false);
const err = ref('');
const router = useRouter();

async function submit() {
  loading.value = true; err.value = '';
  try { await api.login(password.value); router.push('/admin'); }
  catch (e) { err.value = e.message || '登录失败'; }
  loading.value = false;
}
</script>
