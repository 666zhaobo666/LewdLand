<template>
  <div>
    <div class="flex items-center gap-3 mb-4">
      <router-link :to="msg ? `/theme/${msg.theme_id}` : '/'" class="text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200">← 返回</router-link>
      <span v-if="msg" class="text-sm text-neutral-400">{{ msg.theme_name }}</span>
    </div>

    <div v-if="loading" class="text-center py-20 text-neutral-400">加载中…</div>

    <div v-else-if="!msg" class="text-center py-20 text-neutral-400">资源不存在</div>

    <div v-else>
      <!-- Main media first -->
      <div class="space-y-4 mb-5">
        <div v-for="m in mainMedia" :key="m.index" class="rounded-2xl overflow-hidden bg-neutral-100 dark:bg-neutral-900">
          <img v-if="m.kind === 'image'" :src="mediaUrl(m.index)" loading="lazy" @click="openPhotoSwipe(m.index)"
            class="w-full max-h-[80vh] object-contain mx-auto cursor-zoom-in" />
          <div v-else class="bg-black">
            <div :ref="el => videoRefs[m.index] = el" class="w-full"></div>
          </div>
        </div>
      </div>

      <!-- Title + description (full) -->
      <div class="mb-6 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
        <div v-if="msg.tags_text" class="flex flex-wrap gap-1.5 mb-2">
          <span v-for="t in msg.tags_text.split(' ')" :key="t" class="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300">{{ t }}</span>
        </div>
        <h1 class="text-lg font-bold">{{ msg.title || '(无标题)' }}</h1>
        <p v-if="msg.description" class="mt-2 text-sm text-neutral-600 dark:text-neutral-300 whitespace-pre-line">{{ msg.description }}</p>
        <div class="mt-2 text-xs text-neutral-400">{{ msg.source_chat }} · {{ msg.publish_date }}</div>
      </div>

      <!-- Comments media (full gallery) -->
      <div v-if="commentMedia.length" class="space-y-6">
        <div v-for="m in commentMedia" :key="m.index" class="rounded-2xl overflow-hidden bg-neutral-100 dark:bg-neutral-900">
          <img v-if="m.kind === 'image'" :src="mediaUrl(m.index)" loading="lazy" @click="openPhotoSwipe(m.index)"
            class="w-full max-h-[80vh] object-contain mx-auto cursor-zoom-in" />
          <div v-else class="bg-black">
            <div :ref="el => videoRefs[m.index] = el" class="w-full"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Floating prev/next for current video -->
    <div v-if="currentVideoIndex !== null" class="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex gap-2">
      <button @click="stepVideo(-1)" :disabled="!hasVideo(-1)" class="px-3 py-2 rounded-full bg-black/70 text-white text-sm disabled:opacity-30">⏮ 上个视频</button>
      <button @click="stepVideo(1)" :disabled="!hasVideo(1)" class="px-3 py-2 rounded-full bg-black/70 text-white text-sm disabled:opacity-30">下个视频 ⏭</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../api';
import PhotoSwipe from 'photoswipe';
import 'photoswipe/dist/photoswipe.css';

const route = useRoute();
const msg = ref(null);
const loading = ref(true);
const videoRefs = ref({});
const players = ref({});
const currentVideoIndex = ref(null);

const allMedia = computed(() => (msg.value ? msg.value.media : []));
const mainMedia = computed(() => allMedia.value.filter((m) => m.slot === 'main'));
const commentMedia = computed(() => allMedia.value.filter((m) => m.slot === 'comment'));
const imageMedia = computed(() => allMedia.value.filter((m) => m.kind === 'image'));
const videoMedia = computed(() => allMedia.value.filter((m) => m.kind === 'video'));

const mediaUrl = (index) => api.mediaUrl(msg.value.id, index);

function imageIndexToGlobal(localIdx) {
  return imageMedia.value[localIdx];
}

// ---------- PhotoSwipe gallery ----------
function openPhotoSwipe(globalIndex) {
  const img = allMedia.value.find((m) => m.index === globalIndex);
  if (!img || img.kind !== 'image') return;
  const localIdx = imageMedia.value.findIndex((m) => m.index === globalIndex);
  const sources = imageMedia.value.map((m) => ({ src: mediaUrl(m.index), w: 0, h: 0 }));
  const pswp = new PhotoSwipe({
    index: localIdx,
    dataSource: sources,
    bgOpacity: 0.92,
    showHideAnimationType: 'fade',
    initialZoomLevel: 'fit',
    secondaryZoomLevel: 2,
    maxZoomLevel: 4
  });
  // Load dimensions lazily; PhotoSwipe needs w/h, fetch from the loaded image.
  pswp.on('gettingData', (e) => {
    const item = e.item;
    if (item.w === 0 || item.h === 0) {
      e.preventDefault();
      const im = new Image();
      im.onload = () => { item.w = im.naturalWidth; item.h = im.naturalHeight; pswp.refreshSlideContent(e.index); };
      im.src = item.src;
    }
  });
  pswp.init();
}

// ---------- ArtPlayer ----------
async function ensurePlayer(index) {
  if (players.value[index]) return players.value[index];
  const el = videoRefs.value[index];
  if (!el) return null;
  const Artplayer = (await import('artplayer')).default;
  const player = new Artplayer({
    container: el,
    url: mediaUrl(index),
    type: detectType(index),
    volume: 0.7,
    isLive: false,
    muted: false,
    autoplay: false,
    pip: true,
    setting: true,
    playbackRate: true,
    fullscreen: true,
    fullscreenWeb: true,
    miniProgressBar: true,
    lock: true,           // mobile: tap once shows controls instead of toggling play
    fastForward: true,    // mobile: long-press to fast forward
    theme: '#2563eb',
    lang: navigator.language.toLowerCase().startsWith('zh') ? 'zh-cn' : 'en'
  });
  player.on('video:loadedmetadata', () => adjustVideoSize(player, index));
  players.value[index] = player;
  return player;
}

function detectType(index) {
  const m = allMedia.value.find((x) => x.index === index);
  const name = (m && m.path) || '';
  if (/\.m3u8$/i.test(name)) return 'm3u8';
  if (/\.(mp4|m4v)$/i.test(name)) return 'video/mp4';
  if (/\.webm$/i.test(name)) return 'video/webm';
  if (/\.mkv$/i.test(name)) return 'video/x-matroska';
  return 'video/mp4';
}

function adjustVideoSize(player, index) {
  const v = player.video;
  if (!v) return;
  const landscape = v.videoWidth >= v.videoHeight;
  // Tag the element so fullscreen can pick orientation on mobile.
  const wrap = player.template?.$container || player.container;
  if (wrap) wrap.dataset.orientation = landscape ? 'landscape' : 'portrait';
  player.orientation = landscape ? 'landscape' : 'portrait';
}

// Mobile: lock orientation on fullscreen based on video aspect ratio.
function onFullscreenChange() {
  const el = document.fullscreenElement;
  if (el && el.dataset && el.dataset.orientation === 'portrait') {
    try { screen.orientation && screen.orientation.lock && screen.orientation.lock('portrait'); } catch (_) {}
  } else if (el && el.dataset && el.dataset.orientation === 'landscape') {
    try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'); } catch (_) {}
  }
}

// ---------- prev/next video (works across main & comments) ----------
function videoIndexOf(index) { return videoMedia.value.findIndex((m) => m.index === index); }
function hasVideo(dir) {
  if (currentVideoIndex.value === null) return false;
  const i = videoIndexOf(currentVideoIndex.value);
  return i + dir >= 0 && i + dir < videoMedia.value.length;
}
function stepVideo(dir) {
  if (currentVideoIndex.value === null) return;
  const i = videoIndexOf(currentVideoIndex.value) + dir;
  if (i < 0 || i >= videoMedia.value.length) return;
  const target = videoMedia.value[i];
  currentVideoIndex.value = target.index;
  const el = videoRefs.value[target.index];
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  ensurePlayer(target.index).then((p) => p && p.play());
}

async function initVideos() {
  await nextTick();
  for (const m of videoMedia.value) {
    await ensurePlayer(m.index);
  }
}

async function load() {
  loading.value = true;
  currentVideoIndex.value = null;
  Object.values(players.value).forEach((p) => { try { p && p.destroy(false); } catch (_) {} });
  players.value = {};
  videoRefs.value = {};
  try {
    msg.value = await api.message(Number(route.params.id));
    await nextTick();
    await initVideos();
  } catch (e) { console.error(e); }
  loading.value = false;
}

watch(() => route.params.id, load);
onMounted(() => {
  document.addEventListener('fullscreenchange', onFullscreenChange);
  load();
});
onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange);
  Object.values(players.value).forEach((p) => { try { p && p.destroy(false); } catch (_) {} });
});
</script>
