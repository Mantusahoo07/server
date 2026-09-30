import express from 'express';
import PrintJob from '../models/PrintJob.js';
import PrinterHost from '../models/PrinterHost.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// -----------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------
const HOST_TIMEOUT_MS = 30_000;   // host considered offline if no heartbeat
const JOB_TIMEOUT_MS  = 30_000;   // jobs expire if not picked up

async function getPrinterHost() {
  let doc = await PrinterHost.findOne({ key: 'active' });
  if (!doc) {
    doc = new PrinterHost({ key: 'active' });
    await doc.save();
  }
  return doc;
}

function isHostOnline(doc) {
  if (!doc || !doc.deviceId || !doc.lastSeenAt) return false;
  return (Date.now() - new Date(doc.lastSeenAt).getTime()) < HOST_TIMEOUT_MS;
}

/** Sweep expired jobs — call before every fetch so the waiter sees failures fast. */
async function sweepExpired() {
  const cutoff = new Date(Date.now() - JOB_TIMEOUT_MS);
  await PrintJob.updateMany(
    { status: 'pending', createdAt: { $lt: cutoff } },
    { $set: { status: 'expired', error: 'No printer host picked it up in time' } }
  );
}

// -----------------------------------------------------------------
// GET /api/print-jobs/printer-host
// Who is the host and are they online?
// -----------------------------------------------------------------
router.get('/printer-host', authenticate, async (req, res) => {
  try {
    const doc = await getPrinterHost();
    res.json({
      deviceId:      doc.deviceId,
      deviceName:    doc.deviceName,
      enabledByName: doc.enabledByName,
      enabledAt:     doc.enabledAt,
      lastSeenAt:    doc.lastSeenAt,
      jobsPrinted:   doc.jobsPrinted,
      online:        isHostOnline(doc)
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -----------------------------------------------------------------
// POST /api/print-jobs/printer-host
// enable=true  → claim host (kicks whoever was there)
// enable=false → release only if we are the current host
// -----------------------------------------------------------------
router.post('/printer-host', authenticate, async (req, res) => {
  try {
    const { deviceId, deviceName, enable } = req.body;
    if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
    const doc = await getPrinterHost();

    if (enable === true) {
      const previous = doc.deviceId;
      doc.deviceId      = deviceId;
      doc.deviceName    = deviceName || 'Unknown device';
      doc.enabledBy     = req.userId;
      doc.enabledByName = req.body.enabledByName || null;
      doc.enabledAt     = new Date();
      doc.lastSeenAt    = new Date();
      await doc.save();

      const io = req.app.get('io');
      if (io) io.emit('printer-host-changed', { deviceId: doc.deviceId, previousDeviceId: previous });
      return res.json({ ok: true, host: doc });
    }

    if (enable === false) {
      if (doc.deviceId !== deviceId) {
        return res.status(409).json({ error: 'Another device is the printer host.' });
      }
      doc.deviceId = null; doc.deviceName = null;
      doc.enabledBy = null; doc.enabledByName = null;
      doc.enabledAt = null; doc.lastSeenAt = null;
      await doc.save();

      const io = req.app.get('io');
      if (io) io.emit('printer-host-changed', { deviceId: null });
      return res.json({ ok: true, host: doc });
    }

    res.status(400).json({ error: 'enable must be true or false' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -----------------------------------------------------------------
// POST /api/print-jobs/printer-host/heartbeat
// -----------------------------------------------------------------
router.post('/printer-host/heartbeat', authenticate, async (req, res) => {
  try {
    const { deviceId } = req.body;
    const doc = await getPrinterHost();
    if (doc.deviceId && doc.deviceId === deviceId) {
      doc.lastSeenAt = new Date();
      await doc.save();
      return res.json({ ok: true, online: true });
    }
    res.json({ ok: true, online: false });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -----------------------------------------------------------------
// POST /api/print-jobs — enqueue
// Assigns targetHostId = current host. Fails fast if no host online.
// -----------------------------------------------------------------
router.post('/', authenticate, async (req, res) => {
  try {
    const { receiptData, paperWidth, requestedByName } = req.body;
    if (!receiptData || typeof receiptData !== 'object') {
      return res.status(400).json({ error: 'receiptData is required' });
    }

    const host = await getPrinterHost();
    if (!host.deviceId || !isHostOnline(host)) {
      return res.status(503).json({
        error: 'No printer host is online. Turn on the printer host device.'
      });
    }

    const job = new PrintJob({
      receiptData,
      paperWidth: paperWidth || 58,
      requestedBy: req.userId,
      requestedByName: requestedByName || null,
      targetHostId: host.deviceId
    });
    await job.save();

    console.log(`🖨️  Print job queued: ${job._id} → host ${host.deviceId}`);

    const io = req.app.get('io');
    if (io) io.emit('print-job-queued', { jobId: job._id.toString(), targetHostId: host.deviceId });

    res.status(201).json(job);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -----------------------------------------------------------------
// GET /api/print-jobs/pending?deviceId=XXX
// Only the current host fetches; only jobs targeted at it are returned.
// -----------------------------------------------------------------
router.get('/pending', authenticate, async (req, res) => {
  try {
    await sweepExpired();
    const { deviceId } = req.query;
    const host = await getPrinterHost();
    if (host.deviceId !== deviceId) {
      return res.status(403).json({ error: 'This device is not the printer host' });
    }
    host.lastSeenAt = new Date();
    await host.save();

    const jobs = await PrintJob.find({
      status: 'pending',
      targetHostId: deviceId
    }).sort({ createdAt: 1 }).limit(10);

    res.json(jobs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -----------------------------------------------------------------
// PATCH /api/print-jobs/:id/status
// -----------------------------------------------------------------
router.patch('/:id/status', authenticate, async (req, res) => {
  try {
    const { status, deviceId, error } = req.body;
    if (!['printing', 'done', 'failed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const host = await getPrinterHost();
    if (host.deviceId !== deviceId) {
      return res.status(403).json({ error: 'Not the printer host' });
    }

    const update = { status };
    if (deviceId) update.printedBy = deviceId;
    if (status === 'done' || status === 'failed') update.printedAt = new Date();
    if (error) update.error = error;

    const job = await PrintJob.findByIdAndUpdate(
      req.params.id,
      { $set: update, $inc: { printAttempts: 1 } },
      { new: true }
    );
    if (!job) return res.status(404).json({ error: 'Job not found' });

    if (status === 'done') {
      host.jobsPrinted = (host.jobsPrinted || 0) + 1;
      host.lastSeenAt = new Date();
      await host.save();
    }

    console.log(`🖨️  Job ${job._id} → ${status}`);

    const io = req.app.get('io');
    if (io) io.emit('print-job-updated', { jobId: job._id.toString(), status });

    res.json(job);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -----------------------------------------------------------------
// GET /api/print-jobs/recent
// -----------------------------------------------------------------
router.get('/recent', authenticate, async (req, res) => {
  try {
    await sweepExpired();
    const jobs = await PrintJob.find({}).sort({ createdAt: -1 }).limit(20);
    res.json(jobs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -----------------------------------------------------------------
// GET /api/print-jobs/my-last?deviceId=XXX
// Poll to check the fate of the last job — used by non-host devices
// to show "printed!" or "printer offline" after tapping PRINT.
// -----------------------------------------------------------------
router.get('/my-last', authenticate, async (req, res) => {
  try {
    await sweepExpired();
    const job = await PrintJob.findOne({ requestedBy: req.userId })
      .sort({ createdAt: -1 });
    if (!job) return res.json(null);
    res.json({
      id: job._id,
      status: job.status,
      error: job.error,
      createdAt: job.createdAt
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -----------------------------------------------------------------
// DELETE /api/print-jobs/clear — clean old jobs
// -----------------------------------------------------------------
router.delete('/clear', authenticate, async (req, res) => {
  try {
    const result = await PrintJob.deleteMany({
      status: { $in: ['done', 'failed', 'expired'] }
    });
    res.json({ deleted: result.deletedCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
