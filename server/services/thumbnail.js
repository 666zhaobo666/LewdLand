'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { pipeline } = require('stream/promises');
const { THUMBS_DIR } = require('../config');
const { isImage, isVideo, sha1 } = require('../util');

let _sharp = null;
let _ffmpegStatus = null;
async function getSharp() {
  if (_sharp) return _sharp;
  _sharp = (await import('sharp')).default;
  return _sharp;
}

function getFfmpegStatus() {
  if (_ffmpegStatus) return _ffmpegStatus;
  const result = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  if (result.error) {
    _ffmpegStatus = { ok: false, error: result.error.message };
    return _ffmpegStatus;
  }
  if (result.status !== 0) {
    _ffmpegStatus = {
      ok: false,
      error: (result.stderr || result.stdout || `ffmpeg exited with code ${result.status}`).trim()
    };
    return _ffmpegStatus;
  }
  const firstLine = String(result.stdout || '').split(/\r?\n/).find(Boolean) || 'ffmpeg available';
  _ffmpegStatus = { ok: true, version: firstLine.trim() };
  return _ffmpegStatus;
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

// Pull a single frame out of a video file on disk and write it to dest (JPEG).
function generateVideoThumbFromFile(localPath, dest, seconds) {
  const seek = Number.isFinite(seconds) && seconds >= 0 ? seconds : 1;
  const seekArg = seek.toFixed(3);
  return runFfmpegFrameExtract(['-y', '-ss', seekArg, '-i', localPath, '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '4', dest]);
}

// Pull a single frame out of a video supplied as a Node readable stream and
// write it to dest (JPEG). Streams from WebDAV/remote sources can be passed in
// here without needing a local file.
function generateVideoThumbFromStream(readable, dest, seconds) {
  const seek = Number.isFinite(seconds) && seconds >= 0 ? seconds : 1;
  const seekArg = seek.toFixed(3);
  return runFfmpegFrameExtract(['-y', '-i', 'pipe:0', '-ss', seekArg, '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '4', dest], readable);
}

function runFfmpegFrameExtract(args, stdinStream, opts) {
  opts = opts || {};
  const timeoutMs = opts.timeoutMs || 30000;
  return new Promise((resolve, reject) => {
    const status = getFfmpegStatus();
    if (!status.ok) {
      reject(new Error(`ffmpeg unavailable: ${status.error}`));
      return;
    }
    const ffmpeg = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      try { ffmpeg.stdin.destroy(); } catch (_) {}
      try { ffmpeg.kill(); } catch (_) {}
      if (err) reject(err); else resolve();
    };
    const timeout = setTimeout(() => finish(new Error('ffmpeg timed out')), timeoutMs);
    ffmpeg.stderr.on('data', (chunk) => {
      if (stderr.length < 4000) stderr += String(chunk);
    });
    ffmpeg.on('error', finish);
    ffmpeg.on('close', (code) => {
      if (code === 0) finish();
      else {
        const details = stderr.trim();
        finish(new Error(details ? `ffmpeg exited with code ${code}: ${details}` : 'ffmpeg exited with code ' + code));
      }
    });
    if (stdinStream) {
      stdinStream.on('error', finish);
      stdinStream.pipe(ffmpeg.stdin);
    } else {
      ffmpeg.stdin.end();
    }
  });
}

// Build a stream getter for the first video, regardless of source type.
// Returns { stream, cleanup } or null when no source is available.
function buildVideoStreamGetter(adapter, relDir, videoCandidate) {
  const videoRel = relDir ? `${relDir}/${videoCandidate}` : videoCandidate;
  if (typeof adapter.getLocalPath === 'function') {
    // Local source: no streaming, use the file path.
    return {
      kind: 'file',
      localPath: adapter.getLocalPath(videoRel)
    };
  }
  if (typeof adapter.createReadStream === 'function') {
    // Remote source: stream a bounded prefix of the file. Most containers
    // keep enough header data in the first few MB for ffmpeg to decode the
    // first frame; we cap the read so very large remote videos don't get
    // fully downloaded just to pull a poster.
    const MAX_BYTES = 16 * 1024 * 1024;
    const stream = adapter.createReadStream(videoRel, { start: 0, end: MAX_BYTES - 1 });
    let received = 0;
    stream.on('data', (chunk) => {
      received += chunk.length;
      if (received >= MAX_BYTES) {
        // Tell ffmpeg that 'EOF' so it finalizes the frame and writes output.
        try { stream.destroy(); } catch (_) {}
      }
    });
    return { kind: 'stream', stream };
  }
  return null;
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

  // 1) Try every image candidate first (cheap, exact).
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

  // 2) Fall back to the first video. Works for both local files and remote
  //    streams so WebDAV video resources get a poster frame too.
  if (videoCandidate) {
    const getter = buildVideoStreamGetter(adapter, relDir, videoCandidate);
    if (getter) {
      const tempJpeg = path.join(THUMBS_DIR, subDir, `${sha1(`${relDir}:video`)}.jpg`);
      try {
        if (getter.kind === 'file') {
          await generateVideoThumbFromFile(getter.localPath, tempJpeg, 1);
        } else {
          await generateVideoThumbFromStream(getter.stream, tempJpeg, 1);
        }
        const inputBuffer = await fs.promises.readFile(tempJpeg);
        await writeImageThumb(inputBuffer, dest);
        return relPath;
      } catch (e) {
        // Clean up any partial webp so the next run is forced to retry.
        try { await fs.promises.unlink(dest); } catch (_) {}
        // Surface the underlying error in the caller instead of silently failing.
        throw e;
      } finally {
        await fs.promises.unlink(tempJpeg).catch(() => {});
      }
    }
  }

  return null;
}

module.exports = {
  ensureThumb,
  firstImage,
  firstVideo,
  getSharp,
  getFfmpegStatus,
  generateVideoThumbFromFile,
  generateVideoThumbFromStream
};
