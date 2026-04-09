import express from 'express';
import Receipt from '../models/Receipt.js';

const router = express.Router();

// Save receipt
router.post('/save', async (req, res) => {
  try {
    const { receiptId, orderId, orderNumber, displayOrderNumber, receiptData } = req.body;
    
    const receipt = new Receipt({
      receiptId,
      orderId,
      orderNumber,
      displayOrderNumber,
      receiptData
    });
    
    await receipt.save();
    res.json({ success: true, receiptId });
  } catch (error) {
    console.error('Error saving receipt:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get receipt by ID
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
