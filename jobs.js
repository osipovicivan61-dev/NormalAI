const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { VIDEO_DIR } = require('./automation/browser');

const jobs = new Map();
let running = false;

const MODES = ['h3', 'kling', 'photo', 'shorts'];

// каждый запрос получает свежий слот = свежий аккаунт ( temp-почта → регистрация )
function nextSlot() {
  const f = path.join(path.dirname(VIDEO_DIR), '.sessions', '.slot-counter');
  let n = 1;
  try { n = Number(fs.readFileSync(f, 'utf8')) || 1; } catch (e) {}
  n += 1;
  try { fs.writeFileSync(f, String(n)); } catch (e) {}
  return n;
}

function createJob(body, file) {
  const id = crypto.randomBytes(6).toString('hex');
  const job = {
    id,
    mode: MODES.includes(body.mode) ? body.mode : 'h3',
    params: {
      prompt: (body.prompt || '').trim(),
      duration: Number(body.duration) || 5,
      aspect: body.aspect || '16:9',
      resolution: body.resolution || '480P',
      photoModel: body.photoModel || 'gpt-image-2',
      visuals: body.visuals || 'animated',
      speaker: body.speaker || 'narrator',
      style: body.style || 'auto',
      photoRef: file ? file.filename : null,
      photoRefName: file ? file.originalname : null,
    },
    status: 'queued',
    logs: [],
    video: null,
    slot: nextSlot(),
    createdAt: Date.now(),
  };
  jobs.set(id, job);
  return job;
}

function log(job, line) {
  const stamped = `[${new Date().toLocaleTimeString('ru-RU')}] ${line}`;
  job.logs.push(stamped);
  console.log(`job ${job.id} · ${stamped}`);
}

async function runJob(job) {
  job.status = 'running';
  const L = (line) => log(job, line);
  log(job, `старт режима ${job.mode}`);
  try {
    let video;
    if (job.mode === 'h3') video = await require('./providers/h3max')(job, L);
    else if (job.mode === 'kling') video = await require('./providers/polyfaced')(job, L, 'video');
    else if (job.mode === 'photo') video = await require('./providers/polyfaced')(job, L, 'photo');
    else if (job.mode === 'shorts') video = await require('./providers/slice')(job, L);

    const out = path.join(VIDEO_DIR, `${job.id}${path.extname(video) || '.mp4'}`);
    fs.copyFileSync(video, out);
    job.video = `/videos/${job.id}${path.extname(video) || '.mp4'}`;
    job.status = 'done';
    L('готово');
  } catch (err) {
    job.status = 'error';
    L('ошибка: ' + (err && err.message ? err.message : String(err)));
    if (process.env.DEBUG) console.error(err);
  }
}

async function pump() {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const next = [...jobs.values()].find((j) => j.status === 'queued');
      if (!next) break;
      await runJob(next);
    }
  } finally {
    running = false;
  }
}

function kick() {
  pump().catch((e) => console.error(e));
}

module.exports = { createJob, getJob: (id) => jobs.get(id), listJobs: () => [...jobs.values()], kick };
