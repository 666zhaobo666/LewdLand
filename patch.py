import re

with open('client/src/views/Message.vue', 'r', encoding='utf-8') as f:
    content = f.read()

pattern_media = re.compile(r'      <div v-if="mainImages\.length".*?    </div>', re.DOTALL)

replacement_media = r'''      <div v-if="mainMedia.length" class="mb-6 space-y-5">
        <div
          v-for="m in mainMedia"
          :key=""
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
          :key=""
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
    </div>'''

content = pattern_media.sub(replacement_media, content, count=1)

pattern_computed = re.compile(r'const mainImages = computed[^\n]+?\nconst mainVideos = computed[^\n]+?\nconst commentImages = computed[^\n]+?\nconst commentVideos = computed[^\n]+?\n')
replacement_computed = r'''const mainMedia = computed(() => allMedia.value.filter((item) => item.slot === 'main'));
const commentMedia = computed(() => allMedia.value.filter((item) => item.slot === 'comment'));
'''
content = pattern_computed.sub(replacement_computed, content, count=1)

content = content.replace('if (mainImages.value.length) return [mainImages.value[0]];', 
r'''const mainImage = mainMedia.value.find((item) => item.kind === 'image');
  if (mainImage) return [mainImage];''')

with open('client/src/views/Message.vue', 'w', encoding='utf-8') as f:
    f.write(content)
