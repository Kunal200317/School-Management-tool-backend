import Student from '../models/Student.js';
import ClassFee from '../models/ClassFee.js';
import Razorpay from 'razorpay';
import crypto from 'crypto';

// @desc    Get current student profile details
// @route   GET /api/student/profile
// @access  Private (Student Only)
export const getStudentProfile = async (req, res) => {
  try {
    const student = await Student.findById(req.user.id);
    if (!student) {
      return res.status(404).json({ message: 'Student profile not found' });
    }

    const userObj = student.toObject();
    if (!userObj.hasCustomConcession) {
      try {
        const template = await ClassFee.findOne({ className: userObj.class.trim(), session: userObj.session });
        if (template) {
          userObj.annualFee = template.annualFee;
          userObj.monthlyTuitionFee = template.monthlyTuitionFee;
          userObj.examFee = template.examFee;
          userObj.computerFee = template.computerFee;

          const annual = template.annualFee || 0;
          const monthly = (template.monthlyTuitionFee || 0) * 12;
          const exam = (template.examFee || 0) * 4;
          const computer = (template.computerFee || 0) * 2;
          userObj.totalFee = annual + monthly + exam + computer;

          const totalPaid = (userObj.paymentHistory || []).reduce((sum, p) => sum + (p.amount || 0), 0);
          userObj.paidFee = totalPaid;
          userObj.dueFee = userObj.totalFee - userObj.paidFee;
        }
      } catch (err) {
        console.error('Error fetching dynamic fees for student profile:', err.message);
      }
    } else {
      // Calculate custom concession totals
      const annual = userObj.annualFee || 0;
      const monthly = (userObj.monthlyTuitionFee || 0) * 12;
      const exam = (userObj.examFee || 0) * 4;
      const computer = (userObj.computerFee || 0) * 2;
      userObj.totalFee = annual + monthly + exam + computer;

      const totalPaid = (userObj.paymentHistory || []).reduce((sum, p) => sum + (p.amount || 0), 0);
      userObj.paidFee = totalPaid;
      userObj.dueFee = userObj.totalFee - userObj.paidFee;
    }

    res.json({
      user: {
        id: userObj._id,
        name: userObj.name,
        class: userObj.class,
        section: userObj.section,
        rollNo: userObj.rollNo,
        admissionId: userObj.admissionId,
        fatherName: userObj.fatherName,
        motherName: userObj.motherName,
        dob: userObj.dob,
        mobileNumber: userObj.mobileNumber,
        address: userObj.address,
        annualFee: userObj.annualFee,
        monthlyTuitionFee: userObj.monthlyTuitionFee,
        examFee: userObj.examFee,
        computerFee: userObj.computerFee,
        totalFee: userObj.totalFee,
        paidFee: userObj.paidFee,
        dueFee: userObj.dueFee,
        paymentHistory: userObj.paymentHistory,
        role: 'student'
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get attendance records for the logged-in student
// @route   GET /api/student/attendance
// @access  Private (Student Only)
export const getStudentAttendance = async (req, res) => {
  try {
    const student = await Student.findById(req.user.id, 'attendance name class section');
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    res.json({ attendance: student.attendance || [] });
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching attendance', error: error.message });
  }
};

// @desc    Add fee payment for the logged in student
// @route   POST /api/student/payments
// @access  Private (Student Only)
export const addStudentPayment = async (req, res) => {
  try {
    const { amount, date, remarks } = req.body;

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Valid payment amount is required' });
    }
    if (!date) {
      return res.status(400).json({ message: 'Payment date is required' });
    }

    const student = await Student.findById(req.user.id);
    if (!student) {
      return res.status(404).json({ message: 'Student profile not found' });
    }

    // Generate unique receipt number
    const receiptNo = `REC-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // Push new payment to paymentHistory (students always pay Online via gateway)
    student.paymentHistory.push({
      receiptNo,
      date,
      amount: Number(amount),
      mode: 'Online',
      remarks: remarks || ''
    });

    // Save student (pre-save hook will auto recalculate totalFee, paidFee, dueFee)
    await student.save();

     res.json({
      message: 'Payment processed successfully',
      student
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error processing payment', error: error.message });
  }
};

// Razorpay SDK instance builder
const getRazorpayInstance = () => {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || '',
    key_secret: process.env.RAZORPAY_KEY_SECRET || ''
  });
};

// @desc    Get public Razorpay Key ID
// @route   GET /api/student/payments/razorpay-key
// @access  Private (Student Only)
export const getRazorpayKey = async (req, res) => {
  try {
    res.json({ key: process.env.RAZORPAY_KEY_ID || '' });
  } catch (error) {
    res.status(500).json({ message: 'Server error retrieving key', error: error.message });
  }
};

// @desc    Create Razorpay checkout transaction order
// @route   POST /api/student/payments/order
// @access  Private (Student Only)
export const createRazorpayOrder = async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Valid payment amount is required' });
    }

    const instance = getRazorpayInstance();
    const options = {
      amount: Math.round(Number(amount) * 100), // amount in paisa
      currency: 'INR',
      receipt: `rcpt_order_${Date.now()}`
    };

    const order = await instance.orders.create(options);
    if (!order) {
      return res.status(500).json({ message: 'Failed to create order with Razorpay' });
    }

    res.json({
      success: true,
      order
    });
  } catch (error) {
    console.error('Razorpay Order Creation Error:', error);
    res.status(500).json({ message: 'Server error creating Razorpay order', error: error.message });
  }
};

// @desc    Verify transaction signature and update balance
// @route   POST /api/student/payments/verify
// @access  Private (Student Only)
export const verifyRazorpayPayment = async (req, res) => {
  try {
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature, 
      amount, 
      remarks 
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: 'Payment verification parameters are missing' });
    }

    // 1. Verify Signature
    const signBody = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
      .update(signBody.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ message: 'Transaction verification failed: invalid signature' });
    }

    // 2. Fetch and Update Student
    const student = await Student.findById(req.user.id);
    if (!student) {
      return res.status(404).json({ message: 'Student profile not found' });
    }

    // Add verified payment to history
    student.paymentHistory.push({
      receiptNo: razorpay_payment_id,
      date: new Date().toISOString().split('T')[0],
      amount: Number(amount),
      mode: 'Online',
      remarks: remarks || 'Razorpay Online Payment'
    });

    await student.save();

    res.json({
      message: 'Payment verified and processed successfully',
      student
    });
  } catch (error) {
    console.error('Razorpay Signature Verification Error:', error);
    res.status(500).json({ message: 'Server error verifying Razorpay payment', error: error.message });
  }
};
