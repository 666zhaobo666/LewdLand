const fs = require('fs');

const path = 'client/src/views/Message.vue';
let content = fs.readFileSync(path, 'utf8');

const startIdx = content.indexOf('<div v-if="mainImages.length" class="mb-6 space-y-5">');
const endIdx = content.lastIndexOf('</div>\r\n  </div>\r\n</template>');

const replacement = [
  '      <div v-if="mainMedia.length" class="mb-6 space-y-5">',
  '        <div',
  '          v-for="m in mainMedia"',
  '          :key=""',
  '          class="mx-auto w-full max-w-4xl overflow-hidden rounded-2xl shadow-sm"',
  '          :class="m.kind === \'image\' ? \'bg-neutral-100 dark:bg-neutral-900\' : \'bg-black\'"',
  '        >',
  '          <div v-if="m.kind === \'image\'" class="flex max-h-[72vh] min-h-[240px] items-center justify-center">',
  '            <img',
  '              :src="mediaUrl(m.index)"',
  '              loading="lazy"',
  '              class="max-h-[72vh] w-full cursor-zoom-in object-contain"',
  '              @click="openPreview(m.index)"',
  '            />',
  '          </div>',
  '          <div v-else-if="m.kind === \'video\'" class="aspect-video w-full">',
  '            <video',
  '              :src="mediaUrl(m.index)"',
  '              controls',
  '              preload="metadata"',
  '              playsinline',
  '              class="h-full w-full object-contain"',
  '            ></video>',
  '          </div>',
  '        </div>',
  '      </div>',
  '',
  '      <div v-if="commentMedia.length" class="space-y-5">',
  '        <div',
  '          v-for="m in commentMedia"',
  '          :key=""',
  '          class="mx-auto w-full max-w-4xl overflow-hidden rounded-2xl shadow-sm"',
  '          :class="m.kind === \'image\' ? \'bg-neutral-100 dark:bg-neutral-900\' : \'bg-black\'"',
  '        >',
  '          <div v-if="m.kind === \'image\'" class="flex max-h-[72vh] min-h-[240px] items-center justify-center">',
  '            <img',
  '              :src="mediaUrl(m.index)"',
  '              loading="lazy"',
  '              class="max-h-[72vh] w-full cursor-zoom-in object-contain"',
  '              @click="openPreview(m.index)"',
  '            />',
  '          </div>',
  '          <div v-else-if="m.kind === \'video\'" class="aspect-video w-full">',
  '            <video',
  '              :src="mediaUrl(m.index)"',
  '              controls',
  '              preload="metadata"',
  '              playsinline',
  '              class="h-full w-full object-contain"',
  '            ></video>',
  '          </div>',
  '        </div>',
  '      </div>',
  '    </div>'
].join('\n');

content = content.substring(0, startIdx) + replacement + '\r\n  ' + content.substring(endIdx);

content = content.replace(
  /const mainImages = computed[\s\S]*?const commentVideos = computed.*?;/g,
  
);

content = content.replace(
  /if \(mainImages\.value\.length\) return \[mainImages\.value\[0\]\];/g,
  
);

fs.writeFileSync(path, content, 'utf8');
