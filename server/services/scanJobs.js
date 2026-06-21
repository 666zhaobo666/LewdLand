'use strict';

// Background scan job manager.
//
// Each `enqueue*` call returns a jobId immediately. The actual scan runs in
// the background. Multiple jobs can run concurrently; the cap is configurable
// via the `maxConcurrent` option to `createScanManager`.
//
// Events emitted per job (delivered via SSE on the stream route):
//   { type: 'queued',   job_id, scope, target_id, queued_at }
//   { type: 'start',    source_id, source_type, label, job_id }
//   { type: 'scan_done',total, job_id }
//   { type: 'progress', current, total, dir, job_id }
//   { type: 'process_done', inserted, updated, failed, job_id }
//   { type: 'warn',     message, job_id }
//   { type: 'done',     results, job_id, started_at, finished_at, duration_ms }
//   { type: 'error',    message, job_id }

const { EventEmitter } = require('events');
const crypto = require('crypto');
const { scanTheme, scanSource } = require('./scanner');
const { db } = require('../db');

function newId() {
  return crypto.randomBytes(8).toString('hex');
}

function createScanManager({ maxConcurrent = 2, getJobTimeoutMs = 60_000 } = {}) {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);
  const jobs = new Map();        // jobId -> job record
  const queue = [];              // pending jobIds
  const running = new Set();     // active jobIds
  const clients = new Map();     // jobId -> Set<res> (SSE writers)
  let lastBroadcastAt = 0;

  function now() { return new Date().toISOString(); }

  function snapshot() {
    const list = [];
    for (const job of jobs.values()) {
      list.push(publicView(job));
    }
    list.sort((a, b) => (a.queued_at < b.queued_at ? -1 : 1));
    return list;
  }

  function publicView(job) {
    return {
      id: job.id,
      scope: job.scope,
      target_id: job.target_id,
      label: job.label,
      status: job.status,             // queued | running | done | error
      force: !!job.force,
      queued_at: job.queued_at,
      started_at: job.started_at,
      finished_at: job.finished_at,
      duration_ms: job.finished_at && job.started_at
        ? new Date(job.finished_at) - new Date(job.started_at)
        : null,
      progress: {
        current: job.current,
        total: job.total
      },
      phase: job.phase || null,
      summary: job.summary,
      error: job.error
    };
  }

  function emitToJob(jobId, event) {
    const set = clients.get(jobId);
    if (!set) return;
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of set) {
      try { res.write(payload); } catch (_) { /* connection closed */ }
    }
  }

  function broadcastList() {
    // Push the current queue/running list so the UI can render the manager.
    const list = snapshot();
    const payload = `data: ${JSON.stringify({ type: 'list', jobs: list })}\n\n`;
    for (const set of clients.values()) {
      for (const res of set) {
        try { res.write(payload); } catch (_) { /* closed */ }
      }
    }
  }

  function broadcastListThrottled(force = false) {
    const nowMs = Date.now();
    if (force || nowMs - lastBroadcastAt >= 200) {
      lastBroadcastAt = nowMs;
      broadcastList();
    }
  }

  function pump() {
    while (running.size < maxConcurrent && queue.length) {
      const jobId = queue.shift();
      const job = jobs.get(jobId);
      if (!job || job.status !== 'queued') continue;
      startJob(job);
    }
  }

  function startJob(job) {
    job.status = 'running';
    job.started_at = now();
    job.phase = 'starting';
    running.add(job.id);
    broadcastListThrottled(true);

    emitToJob(job.id, { type: 'queued', job_id: job.id });
    emitToJob(job.id, {
      type: 'start',
      job_id: job.id,
      source_id: job.source_id,
      source_type: job.source_type,
      label: job.label
    });

    const onProgress = (type, payload) => {
      let event;
      if (typeof payload === 'object' && payload) {
        event = { type, ...payload };
      } else {
        event = { type, message: String(payload) };
      }
      event.job_id = job.id;
      // Track current/total for snapshot.
      if (type === 'start') job.phase = event.label ? `扫描 ${event.label}` : '扫描中';
      if (type === 'scan_done') job.total = event.total || job.total;
      if (type === 'progress') {
        job.current = event.current || job.current;
        job.total = event.total || job.total;
        job.lastDir = event.dir;
        job.phase = event.dir ? `处理 ${event.dir}` : '处理中';
      }
      if (type === 'process_done') {
        job.summary = `inserted=${event.inserted} updated=${event.updated} failed=${event.failed}`;
        job.phase = '收尾中';
      }
      if (type === 'warn') job.phase = event.message || job.phase;
      emitToJob(job.id, event);
      broadcastListThrottled();
    };

    let work;
    if (job.scope === 'theme') {
      work = scanTheme(job.target_id, { forceThumb: !!job.force, onProgress });
    } else if (job.scope === 'source') {
      const src = db.prepare('SELECT * FROM data_sources WHERE id=?').get(job.target_id);
      if (!src) {
        finishJob(job, null, 'source not found');
        return;
      }
      job.source_id = src.id;
      job.source_type = src.type;
      job.label = src.label || `source #${src.id}`;
      work = scanSource(src, { forceThumb: !!job.force, onProgress }).then((r) => [r]);
    } else {
      finishJob(job, null, 'unknown scope');
      return;
    }

    work
      .then((results) => finishJob(job, results, null))
      .catch((e) => finishJob(job, null, e.message || String(e)));
  }

  function finishJob(job, results, errorMessage) {
    job.finished_at = now();
    job.status = errorMessage ? 'error' : 'done';
    job.phase = errorMessage ? errorMessage : 'done';
    if (errorMessage) job.error = errorMessage;
    if (results) job.summary = JSON.stringify(results, null, 2);
    running.delete(job.id);
    emitToJob(job.id, errorMessage
      ? { type: 'error', message: errorMessage, job_id: job.id }
      : { type: 'done', results, job_id: job.id, started_at: job.started_at, finished_at: job.finished_at });
    // Replay the final snapshot to all subscribers and close their streams
    // shortly after so the client receives the 'done' event before EOF.
    setTimeout(() => {
      const set = clients.get(job.id);
      if (set) {
        for (const res of set) {
          try { res.end(); } catch (_) { /* closed */ }
        }
        clients.delete(job.id);
      }
    }, 50);
    broadcastListThrottled(true);
    pump();
  }

  function enqueue({ scope, targetId, force, label }) {
    const id = newId();
    const job = {
      id,
      scope,
      target_id: Number(targetId),
      force: !!force,
      label: label || null,
      status: 'queued',
      queued_at: now(),
      started_at: null,
      finished_at: null,
      current: 0,
      total: 0,
      phase: null,
      summary: null,
      error: null,
      source_id: null,
      source_type: null
    };
    jobs.set(id, job);
    queue.push(id);
    broadcastList();
    pump();
    return publicView(job);
  }

  function getJob(id) {
    const job = jobs.get(id);
    return job ? publicView(job) : null;
  }

  function listJobs() {
    return snapshot();
  }

  function clearFinished() {
    let removed = 0;
    for (const [id, job] of jobs.entries()) {
      if (job.status === 'done' || job.status === 'error') {
        jobs.delete(id);
        removed++;
      }
    }
    broadcastList();
    return removed;
  }

  function removeJob(id) {
    const job = jobs.get(id);
    if (!job || job.status === 'running') return false;
    jobs.delete(id);
    const idx = queue.indexOf(id);
    if (idx >= 0) queue.splice(idx, 1);
    const set = clients.get(id);
    if (set) {
      for (const res of set) {
        try { res.end(); } catch (_) {}
      }
      clients.delete(id);
    }
    broadcastList();
    return true;
  }

  function attach(id, res) {
    let job = jobs.get(id);
    if (!job) {
      // Allow attaching while we're still creating; create a placeholder so
      // the SSE stream can establish before enqueue() finishes.
      job = {
        id,
        scope: 'unknown',
        target_id: null,
        status: 'queued',
        queued_at: now(),
        started_at: null,
        finished_at: null,
        current: 0,
        total: 0,
        phase: null,
        summary: null,
        error: null,
        source_id: null,
        source_type: null
      };
      jobs.set(id, job);
    }
    if (!clients.has(id)) clients.set(id, new Set());
    clients.get(id).add(res);

    // Replay the full job snapshot on attach so the new client gets current state.
    try {
      res.write(`data: ${JSON.stringify({ type: 'replay', job: publicView(job) })}\n\n`);
    } catch (_) { /* closed */ }

    res.on('close', () => {
      const set = clients.get(id);
      if (set) {
        set.delete(res);
        if (!set.size) clients.delete(id);
      }
    });
  }

  // GC old finished jobs after 10 minutes so the in-memory map doesn't grow
  // unbounded.
  setInterval(() => {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [id, job] of jobs.entries()) {
      if ((job.status === 'done' || job.status === 'error') && job.finished_at) {
        if (new Date(job.finished_at).getTime() < cutoff) jobs.delete(id);
      }
    }
  }, 60_000).unref();

  return {
    enqueue,
    getJob,
    listJobs,
    clearFinished,
    removeJob,
    attach,
    setMaxConcurrent(n) { maxConcurrent = Math.max(1, Number(n) || 1); broadcastList(); pump(); },
    getMaxConcurrent() { return maxConcurrent; }
  };
}

module.exports = { createScanManager };
