import express from 'express';
import Setting from '../models/Setting.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

const DEFAULT_SETTINGS = {
  taxRate: 0,
  serviceCharge: 0,
  kitchenPrint: true,
  autoAcceptOrders: false,
  soundEnabled: true,
  theme: 'dark'
};

router.get('/', async (req, res) => {
  try {
    let settings = await Setting.findOne({ key: 'general' });
    if (!settings) {
      settings = new Setting({ key: 'general', value: DEFAULT_SETTINGS });
      await settings.save();
    }
    res.json(settings.value);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    let settings = await Setting.findOne({ key: 'general' });
    if (settings) {
      settings.value = { ...settings.value, ...req.body };
      settings.updatedAt = new Date();
      await settings.save();
    } else {
      settings = new Setting({ key: 'general', value: req.body });
      await settings.save();
    }
    res.json(settings.value);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;