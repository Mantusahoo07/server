import express from 'express';
import Receipt from '../models/Receipt.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

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
    
    res.json({ success: true, receiptId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:receiptId', async (req, res) => {
  try {
    const receipt = await Receipt.findOne({ receiptId: req.params.receiptId });
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });
    res.json(receipt.receiptData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;