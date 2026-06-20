import { createApp } from 'vue';
import { router } from './router';
import App from './App.vue';
import './styles/main.css';

// Init theme before paint to avoid flash.
const saved = localStorage.getItem('lewland-theme');
const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
if (saved === 'dark' || (!saved && prefersDark)) {
  document.documentElement.classList.add('dark');
}

createApp(App).use(router).mount('#app');
