'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { THUMBS_DIR } = require('../config');
const { isImage, isVideo, sha1 } = require('../util');

let _sharp = null;
async function getSharp() {
  if (_sharp) return _sharp;
  _sharp = (await import('sharp')).default;
  return _sharp;
}

function firstMatch(files, predicate) {
  return Array.isArray(files) ? files.find((file) => predicate(file)) : null;
}

function firstImage(files) {
  return firstMatch(files, isImage);
}

function firstVideo(files) {
  return firstMatch(files, isVideo);
}

async function writeImageThumb(inputBuffer, dest) {
  const sharp = await getSharp();
  await sharp(inputBuffer)
    .rotate()
    .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 })
    .toFile(dest);
}

function generateVideoThumb(localPath, dest) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-ss',
      '00:00:01',
      '-i',
      localPath,
      '-frames:v',
      '1',
      '-vf',
      'scale=640:-2',
      '-q:v',
      '4',
      dest
    ];

    const ffmpeg = spawn('ffmpeg', args, { stdio: 'ignore' });
    ffmpeg.on('error', reject);
    ffmpeg.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });
}

async function ensureThumb(adapter, sourceId, relDir, mainFiles, commentFiles, force) {
  const imageCandidates = [
    ...(Array.isArray(mainFiles) ? mainFiles.filter((file) => isImage(file)) : []),
    ...(Array.isArray(commentFiles) ? commentFiles.filter((file) => isImage(file)) : [])
  ];
  const videoCandidate = firstVideo(mainFiles) || firstVideo(commentFiles);

  if (!imageCandidates.length && !videoCandidate) return null;

  const subDir = String(sourceId);
  const fileName = `${sha1(relDir)}.webp`;
  const relPath = `${subDir}/${fileName}`;
  const dest = path.join(THUMBS_DIR, subDir, fileName);
  if (!force && fs.existsSync(dest)) return relPath;

  fs.mkdirSync(path.join(THUMBS_DIR, subDir), { recursive: true });

  try {
    for (const imageCandidate of imageCandidates) {
      try {
        const fileRel = relDir ? `${relDir}/${imageCandidate}` : imageCandidate;
        const inputBuffer = await adapter.readBuffer(fileRel);
        await writeImageThumb(inputBuffer, dest);
        return relPath;
      } catch (_) {
        // Try the next image candidate.
      }
    }

    if (videoCandidate && typeof adapter.getLocalPath === 'function') {
      const videoRel = relDir ? `${relDir}/${videoCandidate}` : videoCandidate;
      const tempJpeg = path.join(THUMBS_DIR, subDir, `${sha1(`${relDir}:video`)}.jpg`);
      await generateVideoThumb(adapter.getLocalPath(videoRel), tempJpeg);
      const inputBuffer = await fs.promises.readFile(tempJpeg);
      await writeImageThumb(inputBuffer, dest);
      await fs.promises.unlink(tempJpeg).catch(() => {});
      return relPath;
    }
  } catch (_) {
    try { fs.unlinkSync(dest); } catch (_) {}
  }

  return null;
}

module.exports = { ensureThumb, firstImage, firstVideo, getSharp };
