import Setting from '../models/Setting.js';

const DEFAULT_SETTINGS = {
  taxRate: 0,
  serviceCharge: 0,
  kitchenPrint: true,
  autoAcceptOrders: false,
  soundEnabled: true,
  theme: 'dark'
};

export const getSettings = async (req, res) => {
  try {
    let settings = await Setting.findOne({ key: 'general' });
    
    if (!settings) {
      settings = new Setting({ key: 'general', value: DEFAULT_SETTINGS });
      await settings.save();
    }
    
    // Ensure all default values exist
    const settingsValue = { ...DEFAULT_SETTINGS, ...settings.value };
    
    res.json(settingsValue);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updateSettings = async (req, res) => {
  try {
    const updates = req.body;
    
    let settings = await Setting.findOne({ key: 'general' });
    
    if (settings) {
      settings.value = { ...settings.value, ...updates };
      settings.updatedAt = new Date();
      await settings.save();
    } else {
      settings = new Setting({ key: 'general', value: { ...DEFAULT_SETTINGS, ...updates } });
      await settings.save();
    }
    
    console.log('Settings saved:', settings.value);
    res.json(settings.value);
  } catch (error) {
    console.error('Error saving settings:', error);
    res.status(500).json({ error: error.message });
  }
};

export const initializeSettings = async (req, res) => {
  try {
    let settings = await Setting.findOne({ key: 'general' });
    
    if (settings) {
      settings.value = DEFAULT_SETTINGS;
      settings.updatedAt = new Date();
      await settings.save();
    } else {
      settings = new Setting({ key: 'general', value: DEFAULT_SETTINGS });
      await settings.save();
    }
    
    res.json({ message: 'Settings initialized', settings: DEFAULT_SETTINGS });
  } catch (error) {
    console.error('Error initializing settings:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getSettingByKey = async (req, res) => {
  try {
    const settings = await Setting.findOne({ key: 'general' });
    
    if (!settings) {
      if (DEFAULT_SETTINGS[req.params.key] !== undefined) {
        return res.json({ [req.params.key]: DEFAULT_SETTINGS[req.params.key] });
      }
      return res.status(404).json({ error: 'Setting not found' });
    }
    
    const value = settings.value[req.params.key];
    if (value !== undefined) {
      res.json({ [req.params.key]: value });
    } else if (DEFAULT_SETTINGS[req.params.key] !== undefined) {
      res.json({ [req.params.key]: DEFAULT_SETTINGS[req.params.key] });
    } else {
      res.status(404).json({ error: 'Setting not found' });
    }
  } catch (error) {
    console.error('Error fetching setting:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updateSettingByKey = async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    
    let settings = await Setting.findOne({ key: 'general' });
    
    if (!settings) {
      settings = new Setting({ key: 'general', value: DEFAULT_SETTINGS });
    }
    
    settings.value[key] = value;
    settings.updatedAt = new Date();
    await settings.save();
    
    res.json({ [key]: settings.value[key] });
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getValidatedSettings = async (req, res) => {
  try {
    let settings = await Setting.findOne({ key: 'general' });
    
    if (!settings) {
      settings = new Setting({ key: 'general', value: DEFAULT_SETTINGS });
      await settings.save();
    }
    
    const validatedSettings = { ...DEFAULT_SETTINGS, ...settings.value };
    
    // Ensure numeric fields are numbers
    validatedSettings.taxRate = parseFloat(validatedSettings.taxRate) || 0;
    validatedSettings.serviceCharge = parseFloat(validatedSettings.serviceCharge) || 0;
    
    res.json(validatedSettings);
  } catch (error) {
    console.error('Error fetching validated settings:', error);
    res.json(DEFAULT_SETTINGS);
  }
};