<template>
  <div>
    <div class="mb-4 flex items-center gap-3">
      <router-link
        :to="msg ? `/theme/${msg.theme_id}` : '/'"
        class="text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
      >
        ← 返回
      </router-link>
      <span v-if="msg" class="text-sm text-neutral-400">{{ msg.theme_name }}</span>
    </div>

    <div v-if="loading" class="py-20 text-center text-neutral-400">加载中...</div>
    <div v-else-if="!msg" class="py-20 text-center text-neutral-400">资源不存在</div>

    <div v-else>
      <div class="mb-5 space-y-4">
        <div
          v-for="m in mainMedia"
          :key="`main-${m.index}`"
          class="overflow-hidden rounded-2xl bg-neutral-100 dark:bg-neutral-900"
        >
          <img
            v-if="m.kind === 'image'"
            :src="mediaUrl(m.index)"
            loading="lazy"
            class="mx-auto max-h-[80vh] w-full cursor-zoom-in object-contain"
            @click="openPreview(m.index)"
          />
          <div
            v-else
            :ref="(el) => setVideoRef(el, m.index)"
            class="w-full overflow-hidden rounded-2xl bg-black"
          ></div>
        </div>
      </div>

      <div class="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div v-if="msg.tags_text" class="mb-2 flex flex-wrap gap-1.5">
          <span
            v-for="tag in msg.tags_text.split(' ')"
            :key="tag"
            class="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600 dark:bg-blue-950 dark:text-blue-300"
          >
            {{ tag }}
          </span>
        </div>
        <h1 class="text-lg font-bold">{{ msg.title || '(无标题)' }}</h1>
        <p
          v-if="msg.description"
          class="mt-2 whitespace-pre-line text-sm text-neutral-600 dark:text-neutral-300"
        >
          {{ msg.description }}
        </p>
        <div class="mt-2 text-xs text-neutral-400">{{ msg.source_chat }} · {{ msg.publish_date }}</div>
      </div>

      <div v-if="commentMedia.length" class="space-y-6">
        <div
          v-for="m in commentMedia"
          :key="`comment-${m.index}`"
          class="overflow-hidden rounded-2xl bg-neutral-100 dark:bg-neutral-900"
        >
          <img
            v-if="m.kind === 'image'"
            :src="mediaUrl(m.index)"
            loading="lazy"
            class="mx-auto max-h-[80vh] w-full cursor-zoom-in object-contain"
            @click="openPreview(m.index)"
          />
          <div
            v-else
            :ref="(el) => setVideoRef(el, m.index)"
            class="w-full overflow-hidden rounded-2xl bg-black"
          ></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import PhotoSwipeLightbox from 'photoswipe/lightbox';
import 'photoswipe/style.css';
import { api } from '../api';

const route = useRoute();

const msg = ref(null);
const loading = ref(true);

let ArtplayerCtor = null;
let lightbox = null;

const videoRefs = new Map();
const players = new Map();

const allMedia = computed(() => (msg.value ? msg.value.media : []));
const mainMedia = computed(() => allMedia.value.filter((item) => item.slot === 'main'));
const commentMedia = computed(() => allMedia.value.filter((item) => item.slot === 'comment'));
const imageMedia = computed(() => allMedia.value.filter((item) => item.kind === 'image'));
const videoMedia = computed(() => allMedia.value.filter((item) => item.kind === 'video'));

function mediaUrl(index) {
  return api.mediaUrl(msg.value.id, index);
}

function setVideoRef(el, index) {
  if (el) videoRefs.set(index, el);
  else videoRefs.delete(index);
}

function imageSize(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 1600, height: image.naturalHeight || 900 });
    image.onerror = () => resolve({ width: 1600, height: 900 });
    image.src = url;
  });
}

async function createLightbox() {
  if (lightbox || !imageMedia.value.length) return;
  const items = await Promise.all(
    imageMedia.value.map(async (item) => {
      const src = mediaUrl(item.index);
      const size = await imageSize(src);
      return {
        src,
        width: size.width,
        height: size.height
      };
    })
  );

  lightbox = new PhotoSwipeLightbox({
    dataSource: items,
    pswpModule: () => import('photoswipe')
  });
  lightbox.init();
}

async function openPreview(index) {
  const imageIndex = imageMedia.value.findIndex((item) => item.index === index);
  if (imageIndex < 0) return;
  await createLightbox();
  if (!lightbox) return;
  lightbox.loadAndOpen(imageIndex);
}

function destroyLightbox() {
  if (lightbox) {
    lightbox.destroy();
    lightbox = null;
  }
}

async function getArtplayer() {
  if (!ArtplayerCtor) {
    ArtplayerCtor = (await import('artplayer')).default;
  }
  return ArtplayerCtor;
}

function detectVideoType(path) {
  if (/\.m3u8$/i.test(path)) return 'm3u8';
  if (/\.flv$/i.test(path)) return 'flv';
  if (/\.webm$/i.test(path)) return 'webm';
  return 'mp4';
}

async function ensurePlayer(item) {
  if (players.has(item.index)) return players.get(item.index);
  const container = videoRefs.get(item.index);
  if (!container) return null;

  container.style.minHeight = '240px';
  container.style.aspectRatio = '16 / 9';

  const Artplayer = await getArtplayer();
  const player = new Artplayer({
    container,
    url: mediaUrl(item.index),
    type: detectVideoType(item.path),
    volume: 0.7,
    autoplay: false,
    setting: true,
    playbackRate: true,
    pip: true,
    fullscreen: true,
    fullscreenWeb: true,
    miniProgressBar: true,
    fastForward: true,
    theme: '#2563eb'
  });

  players.set(item.index, player);
  return player;
}

async function initVideos() {
  await nextTick();
  for (const item of videoMedia.value) {
    try {
      await ensurePlayer(item);
    } catch (error) {
      console.error('video init failed', item, error);
    }
  }
}

function destroyPlayers() {
  for (const player of players.values()) {
    try {
      player.destroy(false);
    } catch (_) {
      // ignore player teardown errors
    }
  }
  players.clear();
  videoRefs.clear();
}

async function load() {
  loading.value = true;
  destroyPlayers();
  destroyLightbox();
  try {
    msg.value = await api.message(Number(route.params.id));
    await nextTick();
    await initVideos();
  } catch (error) {
    console.error(error);
    msg.value = null;
  } finally {
    loading.value = false;
  }
}

watch(() => route.params.id, load);

onMounted(load);
onBeforeUnmount(() => {
  destroyPlayers();
  destroyLightbox();
});
</script>
