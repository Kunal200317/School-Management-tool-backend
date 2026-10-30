import mongoose from 'mongoose';
import Admin from '../models/Admin.js';
import Student from '../models/Student.js';

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/loyola_school');
    console.log(`MongoDB Connected: ${conn.connection.host}`);

    // Auto-seed first admin if none exists
    const adminCount = await Admin.countDocuments();
    if (adminCount === 0) {
      const defaultAdmin = new Admin({
        email: 'admin@loyola.school',
        password: 'loyola@2026'
      });
      await defaultAdmin.save();
      console.log('✓ Auto-seeded first default admin: admin@loyola.school');
    }

    // Sync status field for legacy students
    await Student.updateMany(
      { class: { $in: ['Passed Out', 'PASSED OUT', 'passed out'] }, status: { $exists: false } },
      { $set: { status: 'Passed Out', archivedAt: new Date() } }
    );
    await Student.updateMany(
      { status: { $exists: false } },
      { $set: { status: 'Active' } }
    );
    console.log('✓ Student status fields migrated successfully.');
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;
