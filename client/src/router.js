import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  { path: '/', name: 'home', component: () => import('./views/Home.vue') },
  { path: '/theme/:id', name: 'theme', component: () => import('./views/Theme.vue') },
  { path: '/message/:id', name: 'message', component: () => import('./views/Message.vue') },
  { path: '/admin', name: 'admin', component: () => import('./views/Admin.vue') },
  { path: '/login', name: 'login', component: () => import('./views/Login.vue') }
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() { return { top: 0 }; }
});
