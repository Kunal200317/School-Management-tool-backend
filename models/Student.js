import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const PaymentSchema = new mongoose.Schema({
  receiptNo: {
    type: String,
    required: true
  },
  date: {
    type: String,
    required: true // Format: YYYY-MM-DD
  },
  amount: {
    type: Number,
    required: true,
    default: 0
  },
  mode: {
    type: String,
    enum: ['Cash', 'Online'],
    required: true
  },
  remarks: {
    type: String,
    trim: true
  }
});

const StudentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  class: {
    type: String,
    trim: true
  },
  section: {
    type: String,
    trim: true
  },
  rollNo: {
    type: Number
  },
  admissionId: {
    type: Number,
    required: [true, 'Admission ID is required'],
    unique: true
  },
  session: {
    type: String,
    required: true,
    default: '2025-2026'
  },
  fatherName: {
    type: String,
    trim: true
  },
  motherName: {
    type: String,
    trim: true
  },
  dob: {
    type: String,
    trim: true // Format: YYYY-MM-DD
  },
  mobileNumber: {
    type: String,
    trim: true
  },
  address: {
    type: String,
    trim: true
  },

  // Custom concession lock flag (Scholarship)
  hasCustomConcession: {
    type: Boolean,
    default: false
  },

  // Fees structure
  annualFee: {
    type: Number,
    default: 0
  },
  monthlyTuitionFee: {
    type: Number,
    default: 0
  },
  examFee: {
    type: Number,
    default: 0
  },
  computerFee: {
    type: Number,
    default: 0
  },
  totalFee: {
    type: Number,
    default: 0
  },
  paidFee: {
    type: Number,
    default: 0
  },
  dueFee: {
    type: Number,
    default: 0
  },

  // Embedded Payment history
  paymentHistory: [PaymentSchema],

  // Login Password (initialized to DOB)
  password: {
    type: String
  },

  // Profile Photo URL (Cloudinary)
  photo: {
    type: String,
    default: ''
  },

  // Daily Attendance Records
  attendance: [
    {
      date: { type: String, required: true }, // Format: YYYY-MM-DD
      status: { type: String, enum: ['Present', 'Absent', 'Leave', 'Holiday'], required: true }
    }
  ],

  // Archive & Status Tracking
  status: {
    type: String,
    enum: ['Active', 'Passed Out', 'Locked / Left'],
    default: 'Active'
  },
  archiveReason: {
    type: String,
    trim: true,
    default: ''
  },
  archivedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Pre-save hook to calculate fees and set/hash password
StudentSchema.pre('save', async function (next) {
  // 1. Fetch default class fees from template on every save if no custom concession
  if (!this.hasCustomConcession && this.class) {
    try {
      const ClassFee = mongoose.model('ClassFee');
      const baseFees = await ClassFee.findOne({ className: this.class.trim() });
      if (baseFees) {
        this.annualFee = baseFees.annualFee;
        this.monthlyTuitionFee = baseFees.monthlyTuitionFee;
        this.examFee = baseFees.examFee;
        this.computerFee = baseFees.computerFee;
      }
    } catch (error) {
      console.error('Error fetching default class fees:', error.message);
    }
  }

  // 2. Calculate fees
  const annual = this.annualFee || 0;
  const monthly = (this.monthlyTuitionFee || 0) * 12;
  const exam = (this.examFee || 0) * 4;
  const computer = (this.computerFee || 0) * 2;

  this.totalFee = annual + monthly + exam + computer;

  const totalPaid = (this.paymentHistory || []).reduce((sum, payment) => sum + (payment.amount || 0), 0);
  this.paidFee = totalPaid;
  this.dueFee = this.totalFee - this.paidFee;

  // 3. Default password to DOB if not present
  if (!this.password && this.dob) {
    this.password = this.dob;
  }

  // 4. Hash password
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Helper method to compare DOB password during login
StudentSchema.methods.comparePassword = async function (enteredDOB) {
  if (!this.password || !enteredDOB) return false;
  return await bcrypt.compare(enteredDOB, this.password);
};

export default mongoose.model('Student', StudentSchema);
