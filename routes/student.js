import express from 'express';
const router = express.Router();
import { 
  getStudentProfile, 
  getStudentAttendance,
  addStudentPayment,
  getRazorpayKey,
  createRazorpayOrder,
  verifyRazorpayPayment
} from '../controllers/studentController.js';
import { protect } from '../middleware/auth.js';

// @route   GET /api/student/profile
router.get('/profile', protect, getStudentProfile);

// @route   GET /api/student/attendance
// @desc    Get real attendance records for logged-in student
// @access  Private (Student Only)
router.get('/attendance', protect, getStudentAttendance);

// @route   POST /api/student/payments
// @desc    Add fee payment for the logged in student (Legacy/Admin)
// @access  Private (Student Only)
router.post('/payments', protect, addStudentPayment);

// @route   GET /api/student/payments/razorpay-key
// @desc    Get public Razorpay Key ID
// @access  Private (Student Only)
router.get('/payments/razorpay-key', protect, getRazorpayKey);

// @route   POST /api/student/payments/order
// @desc    Create a new payment checkout order in Razorpay
// @access  Private (Student Only)
router.post('/payments/order', protect, createRazorpayOrder);

// @route   POST /api/student/payments/verify
// @desc    Verify signature and finalize payment log
// @access  Private (Student Only)
router.post('/payments/verify', protect, verifyRazorpayPayment);

export default router;
