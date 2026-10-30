import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Admin from '../models/Admin.js';
import Teacher from '../models/Teacher.js';
import Student from '../models/Student.js';
import ClassFee from '../models/ClassFee.js';

// Helper to generate JWT
const generateToken = (id, role) => {
  return jwt.sign(
    { id, role },
    process.env.JWT_SECRET || 'loyola_ems_super_secret_key_2026',
    { expiresIn: '7d' }
  );
};

// Helper to send HTTP-Only secure cookie
const sendTokenCookie = (res, token) => {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('token', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
};

// @desc    Admin login & get token
// @route   POST /api/auth/login/admin
// @access  Public
export const loginAdmin = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Basic validation
    if (!email || !password) {
      return res.status(400).json({ message: 'Please enter all fields' });
    }

    // Check for admin
    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check password
    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate token
    const token = generateToken(admin._id, 'admin');
    sendTokenCookie(res, token);

    res.json({
      token,
      user: {
        id: admin._id,
        name: admin.name || 'Principal',
        email: admin.email,
        role: 'admin'
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Teacher login & get token
// @route   POST /api/auth/login/teacher
// @access  Public
export const loginTeacher = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Basic validation
    if (!email || !password) {
      return res.status(400).json({ message: 'Please enter all fields' });
    }

    // Check for teacher
    const teacher = await Teacher.findOne({ email: email.toLowerCase() });
    if (!teacher) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check password
    const isMatch = await teacher.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate token
    const token = generateToken(teacher._id, 'teacher');
    sendTokenCookie(res, token);

    res.json({
      token,
      user: {
        id: teacher._id,
        name: teacher.name,
        email: teacher.email,
        mobile: teacher.mobile,
        subject: teacher.subject,
        classAssigned: teacher.classAssigned,
        sectionAssigned: teacher.sectionAssigned,
        joinedOn: teacher.joinedOn,
        role: 'teacher'
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Student login using mobile number & DOB (password)
// @route   POST /api/auth/login/student
// @access  Public
export const loginStudent = async (req, res) => {
  const { mobileNumber, dob } = req.body;

  try {
    // Basic validation
    if (!mobileNumber || !dob) {
      return res.status(400).json({ message: 'Please enter mobile number and date of birth' });
    }

    // Find all students with this mobile number (handles sibling cases)
    const students = await Student.find({ mobileNumber: mobileNumber.trim() });
    if (students.length === 0) {
      return res.status(401).json({ message: 'Invalid mobile number or date of birth' });
    }

    // Find the student whose dob matches plain-text dob, plain-text password or hashed password
    let matchingStudent = null;
    const enteredDobClean = dob.trim();

    for (const student of students) {
      // 1. Direct plain-text check against dob field
      if (student.dob && student.dob.trim() === enteredDobClean) {
        matchingStudent = student;
        break;
      }

      // 2. Direct plain-text check against password field (if stored as plain text dob)
      if (student.password && student.password.trim() === enteredDobClean) {
        matchingStudent = student;
        break;
      }

      // 3. Fallback: check if it's a bcrypt hash in password field
      if (student.password) {
        try {
          const isMatch = await bcrypt.compare(enteredDobClean, student.password);
          if (isMatch) {
            matchingStudent = student;
            break;
          }
        } catch (e) {
          // bcrypt fails if not a hash, ignore
        }
      }
    }

    if (!matchingStudent) {
      return res.status(401).json({ message: 'Invalid mobile number or date of birth' });
    }

    // Generate token
    const token = generateToken(matchingStudent._id, 'student');
    sendTokenCookie(res, token);

    const userObj = matchingStudent.toObject();
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
        console.error('Error fetching dynamic fees for student login:', err.message);
      }
    }

    res.json({
      token,
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

// @desc    Register a new Admin (Admin only)
// @route   POST /api/auth/create-admin
// @access  Private (Admin Only)
export const createAdmin = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Basic validation
    if (!email || !password) {
      return res.status(400).json({ message: 'Please enter all fields' });
    }

    // Check if admin already exists
    const adminExists = await Admin.findOne({ email: email.toLowerCase() });
    if (adminExists) {
      return res.status(400).json({ message: 'Admin email already registered' });
    }

    // Create new admin
    const newAdmin = new Admin({
      email: email.toLowerCase(),
      password
    });

    await newAdmin.save();

    res.status(201).json({
      message: 'New Admin created successfully',
      user: {
        id: newAdmin._id,
        email: newAdmin.email,
        role: 'admin'
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Logout user & clear cookie
// @route   POST /api/auth/logout
// @access  Public
export const logoutUser = async (req, res) => {
  try {
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('token', '', {
      httpOnly: true,
      expires: new Date(0),
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax'
    });
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

