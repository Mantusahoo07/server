import express from 'express';
import PrintJob from '../models/PrintJob.js';
import PrinterHost from '../models/PrinterHost.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// ----------------------------------------------------------------
// Helper: fetch the singleton printer host doc, creating if missing
// ----------------------------------------------------------------
async function getPrinterHost() {
  let doc = await PrinterHost.findOne({ key: 'active' });
  if (!doc) {
    doc = new PrinterHost({ key: 'active' });
    await doc.save();
  }
  return doc;
}

// ----------------------------------------------------------------
// GET /api/print-jobs/printer-host
// Who currently owns the printer?
// ----------------------------------------------------------------
router.get('/printer-host', authenticate, async (req, res) => {
  try {
    const doc = await getPrinterHost();
    res.json({
      deviceId:      doc.deviceId,
      deviceName:    doc.deviceName,
      enabledByName: doc.enabledByName,
      enabledAt:     doc.enabledAt,
      lastSeenAt:    doc.lastSeenAt,
      jobsPrinted:   doc.jobsPrinted
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------------------
// POST /api/print-jobs/printer-host
// Body: { deviceId, deviceName, enable: true|false }
//
// enable=true  → claims ownership (takes over from anyone else)
// enable=false → releases ownership ONLY if the caller IS the current host
// ----------------------------------------------------------------
router.post('/printer-host', authenticate, async (req, res) => {
  try {
    const { deviceId, deviceName, enable } = req.body;
    if (!deviceId) return res.status(400).json({ error: 'deviceId required' });

    const doc = await getPrinterHost();

    if (enable === true) {
      // Claim host. Auto-kick whoever was there before.
      const previous = doc.deviceId;
      doc.deviceId      = deviceId;
      doc.deviceName    = deviceName || 'Unknown device';
      doc.enabledBy     = req.userId;
      doc.enabledByName = req.body.enabledByName || null;
      doc.enabledAt     = new Date();
      doc.lastSeenAt    = new Date();
      await doc.save();

      const io = req.app.get('io');
      if (io) {
        io.emit('printer-host-changed', {
          deviceId: doc.deviceId,
          deviceName: doc.deviceName,
          previousDeviceId: previous
        });
      }
      return res.json({ ok: true, host: doc });
    }

    if (enable === false) {
      // Release only if we are the current host
      if (doc.deviceId !== deviceId) {
        return res.status(409).json({
          error: 'Another device is the printer host. Turn it off there first.',
          currentHost: {
            deviceId: doc.deviceId,
            deviceName: doc.deviceName,
            enabledByName: doc.enabledByName
          }
        });
      }
      doc.deviceId      = null;
      doc.deviceName    = null;
      doc.enabledBy     = null;
      doc.enabledByName = null;
      doc.enabledAt     = null;
      doc.lastSeenAt    = null;
      await doc.save();

      const io = req.app.get('io');
      if (io) io.emit('printer-host-changed', { deviceId: null });
      return res.json({ ok: true, host: doc });
    }

    return res.status(400).json({ error: 'enable must be true or false' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------------------
// POST /api/print-jobs/printer-host/heartbeat
// Host calls this every few seconds so we know it's alive.
// ----------------------------------------------------------------
router.post('/printer-host/heartbeat', authenticate, async (req, res) => {
  try {
    const { deviceId } = req.body;
    const doc = await getPrinterHost();
    if (doc.deviceId && doc.deviceId === deviceId) {
      doc.lastSeenAt = new Date();
      await doc.save();
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------------------
// POST /api/print-jobs
// Any device enqueues a print. The current host will pick it up.
// ----------------------------------------------------------------
router.post('/', authenticate, async (req, res) => {
  try {
    const { receiptData, paperWidth, requestedByName } = req.body;
    if (!receiptData || typeof receiptData !== 'object') {
      return res.status(400).json({ error: 'receiptData is required' });
    }

    const job = new PrintJob({
      receiptData,
      paperWidth: paperWidth || 58,
      requestedBy: req.userId,
      requestedByName: requestedByName || null
    });
    await job.save();

    console.log(`🖨️  Print job queued: ${job._id}`);

    const io = req.app.get('io');
    if (io) io.emit('print-job-queued', { jobId: job._id.toString() });

    res.status(201).json(job);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------------------
// GET /api/print-jobs/pending?deviceId=XXX
// Only the current host is allowed to fetch pending jobs.
// ----------------------------------------------------------------
router.get('/pending', authenticate, async (req, res) => {
  try {
    const { deviceId } = req.query;
    const host = await getPrinterHost();
    if (host.deviceId !== deviceId) {
      return res.status(403).json({ error: 'This device is not the printer host' });
    }

    // Refresh heartbeat since the host just polled
    host.lastSeenAt = new Date();
    await host.save();

    const jobs = await PrintJob
      .find({ status: 'pending' })
      .sort({ createdAt: 1 })
      .limit(10);

    res.json(jobs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------------------
// PATCH /api/print-jobs/:id/status
// Host reports printing / done / failed
// ----------------------------------------------------------------
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

    console.log(`🖨️  Print job ${job._id} → ${status}`);

    const io = req.app.get('io');
    if (io) io.emit('print-job-updated', { jobId: job._id.toString(), status });

    res.json(job);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------------------
// GET /api/print-jobs/recent
// ----------------------------------------------------------------
router.get('/recent', authenticate, async (req, res) => {
  try {
    const jobs = await PrintJob.find({}).sort({ createdAt: -1 }).limit(20);
    res.json(jobs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------------------
// DELETE /api/print-jobs/clear
// ----------------------------------------------------------------
router.delete('/clear', authenticate, async (req, res) => {
  try {
    const result = await PrintJob.deleteMany({ status: { $in: ['done', 'failed'] } });
    res.json({ deleted: result.deletedCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
