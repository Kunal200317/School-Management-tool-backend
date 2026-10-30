import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const TeacherSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true
  },
  mobile: {
    type: String,
    trim: true
  },
  subject: {
    type: String,
    trim: true
  },
  classAssigned: {
    type: String,
    trim: true
  },
  sectionAssigned: {
    type: String,
    trim: true
  },
  joinedOn: {
    type: String,
    trim: true
  },
  password: {
    type: String,
    required: [true, 'Password is required']
  },
  photo: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Pre-save hook to hash password
TeacherSchema.pre('save', async function (next) {
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

// Helper method to compare password
TeacherSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

export default mongoose.model('Teacher', TeacherSchema);
