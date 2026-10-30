import express from 'express';
const router = express.Router();
import { getClassFees, setClassFee, batchSetClassFees } from '../controllers/feeController.js';
import { protect, isAdmin } from '../middleware/auth.js';

// @route   GET /api/fees/class
// @desc    Get default fee structures for all classes
// @access  Public (or logged-in)
router.get('/class', getClassFees);

// @route   POST /api/fees/class
// @desc    Set or update default fee structure for a class
// @access  Private (Admin Only)
router.post('/class', protect, isAdmin, setClassFee);

// @route   POST /api/fees/class/batch
// @desc    Batch set or update default fee structures for multiple classes
// @access  Private (Admin Only)
router.post('/class/batch', protect, isAdmin, batchSetClassFees);

export default router;
