import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  label: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  startYear: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['Active', 'Closed'],
    default: 'Closed'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Session = mongoose.model('Session', sessionSchema);

export default Session;
