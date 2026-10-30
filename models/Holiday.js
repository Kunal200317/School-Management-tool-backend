import mongoose from 'mongoose';

// Stores school-wide holiday dates set by admin
const HolidaySchema = new mongoose.Schema({
  date: {
    type: String,   // Format: YYYY-MM-DD
    required: true,
    unique: true
  },
  reason: {
    type: String,
    trim: true,
    default: 'Holiday'
  }
}, { timestamps: true });

export default mongoose.model('Holiday', HolidaySchema);
