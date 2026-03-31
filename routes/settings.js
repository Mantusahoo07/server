import express from 'express';
import Setting from '../models/Setting.js';

const router = express.Router();

// Get all settings
router.get('/', async (req, res) => {
  try {
    const settings = await Setting.find({});
    const settingsObj = {};
    settings.forEach(setting => {
      settingsObj[setting.key] = setting.value;
    });
    res.json(settingsObj);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single setting
router.get('/:key', async (req, res) => {
  try {
    const setting = await Setting.findOne({ key: req.params.key });
    if (!setting) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    res.json({ [setting.key]: setting.value });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update or create multiple settings
router.post('/', async (req, res) => {
  try {
    const updates = req.body;
    const results = {};
    
    for (const [key, value] of Object.entries(updates)) {
      const setting = await Setting.findOneAndUpdate(
        { key },
        { key, value, updatedAt: new Date() },
        { upsert: true, new: true }
      );
      results[key] = setting.value;
    }
    
    res.json(results);
  } catch (error) {
    console.error('Error saving settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update single setting
router.patch('/:key', async (req, res) => {
  try {
    const { value } = req.body;
    const setting = await Setting.findOneAndUpdate(
      { key: req.params.key },
      { value, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    res.json({ [setting.key]: setting.value });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Initialize default settings
router.post('/initialize', async (req, res) => {
  try {
    const defaultSettings = {
      taxRate: 10,
      serviceCharge: 0,
      kitchenPrint: true,
      autoAcceptOrders: false,
      soundEnabled: true,
      theme: 'light'
    };
    
    for (const [key, value] of Object.entries(defaultSettings)) {
      await Setting.findOneAndUpdate(
        { key },
        { key, value, description: `Default ${key} setting`, updatedAt: new Date() },
        { upsert: true }
      );
    }
    
    const allSettings = await Setting.find({});
    const settingsObj = {};
    allSettings.forEach(setting => {
      settingsObj[setting.key] = setting.value;
    });
    
    res.json({ message: 'Default settings initialized', settings: settingsObj });
  } catch (error) {
    console.error('Error initializing settings:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
