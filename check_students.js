import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Student from './models/Student.js';

dotenv.config();

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/loyola_school';
  console.log('Connecting to', uri);
  await mongoose.connect(uri);
  console.log('Connected.');

  const students = await Student.find({});
  console.log(`Found ${students.length} students:`);
  students.forEach(s => {
    console.log(`Name: ${s.name}, Class: "${s.class}", Status: "${s.status}", Session: "${s.session}", PaidFee: ${s.paidFee}, DueFee: ${s.dueFee}`);
  });

  await mongoose.disconnect();
}

run().catch(console.error);
