import express from 'express';
import BusinessDetail from '../models/BusinessDetail.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Get business details (public - for receipts)
router.get('/', async (req, res) => {
  try {
    let business = await BusinessDetail.findOne({ key: 'business-details' });
    if (!business) {
      business = new BusinessDetail({ key: 'business-details' });
      await business.save();
    }
    res.json(business);
  } catch (error) {
    console.error('Error fetching business details:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save business details (protected)
router.post('/', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    let business = await BusinessDetail.findOne({ key: 'business-details' });
    
    if (business) {
      Object.assign(business, req.body);
      business.updatedAt = new Date();
      await business.save();
    } else {
      business = new BusinessDetail({ key: 'business-details', ...req.body });
      await business.save();
    }
    
    res.json(business);
  } catch (error) {
    console.error('Error saving business details:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
