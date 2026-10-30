import mongoose from 'mongoose';

const ClassFeeSchema = new mongoose.Schema({
  className: {
    type: String,
    required: [true, 'Class name is required'],
    trim: true
  },
  session: {
    type: String,
    required: true,
    default: '2025-2026'
  },
  annualFee: {
    type: Number,
    required: true,
    default: 0
  },
  monthlyTuitionFee: {
    type: Number,
    required: true,
    default: 0
  },
  examFee: {
    type: Number,
    required: true,
    default: 0
  },
  computerFee: {
    type: Number,
    required: true,
    default: 0
  }
}, {
  timestamps: true
});

ClassFeeSchema.index({ className: 1, session: 1 }, { unique: true });

export default mongoose.model('ClassFee', ClassFeeSchema);
