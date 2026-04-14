import express from 'express';
import Receipt from '../models/Receipt.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Save receipt
router.post('/', authenticate, async (req, res) => {
  try {
    const { receiptId, orderId, orderNumber, receiptData } = req.body;
    
    let receipt = await Receipt.findOne({ receiptId });
    
    if (receipt) {
      receipt.receiptData = receiptData;
      await receipt.save();
    } else {
      receipt = new Receipt({ receiptId, orderId, orderNumber, receiptData });
      await receipt.save();
    }
    
    console.log(`Receipt saved: ${receiptId}`);
    res.json({ success: true, receiptId });
  } catch (error) {
    console.error('Error saving receipt:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get receipt by ID (public)
router.get('/:receiptId', async (req, res) => {
  try {
    const receipt = await Receipt.findOne({ receiptId: req.params.receiptId });
    
    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }
    
    res.json(receipt.receiptData);
  } catch (error) {
    console.error('Error fetching receipt:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
