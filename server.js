const express = require('express');
const multer = require('multer');
const path = require('path');
const { createJob, getJob, listJobs, kick } = require('./jobs');
const { VIDEO_DIR, UPLOAD_DIR } = require('./automation/browser');

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, `${Date.now()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(png|jpe?g|webp)$/.test(file.mimetype)),
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/videos', express.static(VIDEO_DIR, { acceptRanges: true }));

app.post('/api/generate', upload.single('photo'), (req, res) => {
  const body = req.body || {};
  if (!body.prompt || !String(body.prompt).trim()) {
    return res.status(400).json({ error: 'промт пустой' });
  }
  const job = createJob(body, req.file);
  res.json({ id: job.id });
  kick();
});

app.get('/api/jobs', (req, res) => res.json(listJobs()));
app.get('/api/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  job ? res.json(job) : res.status(404).json({ error: 'нет такого' });
});

app.listen(PORT, () => console.log(`video studio → http://localhost:${PORT}`));
