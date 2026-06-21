<template>
  <div>
    <div class="mb-4 flex items-center gap-3">
      <button
        type="button"
        @click="goBack"
        class="text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
      >
        ← 返回
      </button>
      <span v-if="msg" class="text-sm text-neutral-400">{{ msg.theme_name }}</span>
    </div>

    <div v-if="loading" class="py-20 text-center text-neutral-400">加载中...</div>
    <div v-else-if="!msg" class="py-20 text-center text-neutral-400">资源不存在</div>

    <div v-else>
      <section class="relative mb-8 overflow-visible rounded-[28px]">
        <div class="overflow-hidden rounded-[28px] bg-neutral-100 dark:bg-neutral-900">
          <div
            v-if="heroImage"
            class="relative mx-auto aspect-[16/9] max-h-[48vh] min-h-[240px] w-full max-w-5xl bg-neutral-200 dark:bg-neutral-800"
          >
            <img
              :src="mediaUrl(heroImage.index)"
              loading="eager"
              class="h-full w-full object-cover opacity-55"
              @click="openPreview(heroImage.index)"
            />
            <div class="absolute inset-0 bg-gradient-to-t from-white via-white/78 to-white/20 dark:from-neutral-950 dark:via-neutral-950/74 dark:to-neutral-950/15"></div>
          </div>
          <div
            v-else
            class="mx-auto flex aspect-[16/9] max-h-[48vh] min-h-[240px] w-full max-w-5xl items-center justify-center bg-neutral-200 text-sm text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
          >
            无封面
          </div>
        </div>

        <div class="relative z-10 mx-auto -mt-24 w-[calc(100%-2rem)] max-w-4xl rounded-[24px] border border-white/70 bg-white/92 p-5 shadow-xl backdrop-blur dark:border-white/10 dark:bg-neutral-950/88">
          <div v-if="msg.tags_text" class="mb-2 flex flex-wrap gap-1.5">
            <span
              v-for="tag in msg.tags_text.split(' ')"
              :key="tag"
              class="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600 dark:bg-blue-950 dark:text-blue-300"
            >
              {{ tag }}
            </span>
          </div>
          <h1 class="text-lg font-bold leading-7">{{ msg.title || '(无标题)' }}</h1>
          <p v-if="msg.description" class="mt-2 whitespace-pre-line text-sm leading-6 text-neutral-600 dark:text-neutral-300">
            {{ msg.description }}
          </p>
          <div class="mt-3 text-xs text-neutral-400">{{ msg.source_chat }} · {{ msg.publish_date }}</div>
        </div>
      </section>

      <div v-if="mainMedia.length" class="mb-6 space-y-5">
        <div
          v-for="m in mainMedia"
          :key="`main-media-${m.index}`"
          class="mx-auto w-full max-w-4xl overflow-hidden rounded-2xl shadow-sm"
          :class="m.kind === 'image' ? 'bg-neutral-100 dark:bg-neutral-900' : 'bg-black'"
        >
          <div v-if="m.kind === 'image'" class="flex max-h-[72vh] min-h-[240px] items-center justify-center">
            <img
              :src="mediaUrl(m.index)"
              loading="lazy"
              class="max-h-[72vh] w-full cursor-zoom-in object-contain"
              @click="openPreview(m.index)"
            />
          </div>
          <div v-else-if="m.kind === 'video'" class="aspect-video w-full">
            <video
              :src="mediaUrl(m.index)"
              controls
              preload="metadata"
              playsinline
              class="h-full w-full object-contain"
            ></video>
          </div>
        </div>
      </div>

      <div v-if="commentMedia.length" class="space-y-5">
        <div
          v-for="m in commentMedia"
          :key="`comment-media-${m.index}`"
          class="mx-auto w-full max-w-4xl overflow-hidden rounded-2xl shadow-sm"
          :class="m.kind === 'image' ? 'bg-neutral-100 dark:bg-neutral-900' : 'bg-black'"
        >
          <div v-if="m.kind === 'image'" class="flex max-h-[72vh] min-h-[240px] items-center justify-center">
            <img
              :src="mediaUrl(m.index)"
              loading="lazy"
              class="max-h-[72vh] w-full cursor-zoom-in object-contain"
              @click="openPreview(m.index)"
            />
          </div>
          <div v-else-if="m.kind === 'video'" class="aspect-video w-full">
            <video
              :src="mediaUrl(m.index)"
              controls
              preload="metadata"
              playsinline
              class="h-full w-full object-contain"
            ></video>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PhotoSwipeLightbox from 'photoswipe/lightbox';
import 'photoswipe/style.css';
import { api } from '../api';

const route = useRoute();
const router = useRouter();

const msg = ref(null);
const loading = ref(true);
let lightbox = null;

const allMedia = computed(() => (msg.value ? msg.value.media : []));
const mainMedia = computed(() => allMedia.value.filter((item) => item.slot === 'main'));
const commentMedia = computed(() => allMedia.value.filter((item) => item.slot === 'comment'));
const imageMedia = computed(() => allMedia.value.filter((item) => item.kind === 'image'));

const heroImage = computed(() => {
  if (!msg.value) return null;
  const mainImage = mainMedia.value.find((item) => item.kind === 'image');
  if (mainImage) return mainImage;
  if (msg.value.cover_index == null) return null;
  return allMedia.value.find((item) => item.index === msg.value.cover_index && item.kind === 'image') || null;
});

const backLink = computed(() => {
  const theme = route.query.theme || (msg.value ? String(msg.value.theme_id) : null);
  if (!theme) return '/';
  return {
    name: 'theme',
    params: { id: theme },
    query: {
      ...(route.query.page ? { page: String(route.query.page) } : {}),
      ...(route.query.limit ? { limit: String(route.query.limit) } : {}),
      ...(route.query.q ? { q: String(route.query.q) } : {})
    }
  };
});

function goBack() {
  if (window.history.length > 1) {
    router.back();
    return;
  }
  router.push(backLink.value);
}

function mediaUrl(index) {
  return api.mediaUrl(msg.value.id, index);
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
      return { src, width: size.width, height: size.height };
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
  if (lightbox) lightbox.loadAndOpen(imageIndex);
}

function destroyLightbox() {
  if (lightbox) {
    lightbox.destroy();
    lightbox = null;
  }
}

async function load() {
  loading.value = true;
  destroyLightbox();
  try {
    msg.value = await api.message(Number(route.params.id));
  } catch (error) {
    console.error(error);
    msg.value = null;
  } finally {
    loading.value = false;
  }
}

watch(() => route.params.id, load);

onMounted(load);
onBeforeUnmount(destroyLightbox);
</script>
