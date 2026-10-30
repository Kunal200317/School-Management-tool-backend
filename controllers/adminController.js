import Student from '../models/Student.js';
import Teacher from '../models/Teacher.js';
import ClassFee from '../models/ClassFee.js';
import Admin from '../models/Admin.js';
import Session from '../models/Session.js';
import { uploadToCloudinary } from '../config/cloudinary.js';

// @desc    Get dashboard metrics & stats
// @route   GET /api/admin/dashboard-stats
// @access  Private (Admin Only)
export const getDashboardStats = async (req, res) => {
  try {
    const activeSession = await Session.findOne({ status: 'Active' });
    const targetSession = req.query.session || (activeSession ? activeSession.label : '2025-2026');

    const totalStudents = await Student.countDocuments({ session: targetSession, status: 'Active' });
    const totalTeachers = await Teacher.countDocuments();

    // Calculate totalPaid and totalDue dynamically in JS to match getStudents fee template sync
    const students = await Student.find({ session: targetSession, status: 'Active' });
    const allClassFees = await ClassFee.find({ session: targetSession });

    let totalPaid = 0;
    let totalDue = 0;

    students.forEach(student => {
      let paidFee = 0;
      let totalFee = 0;

      if (student.paymentHistory && student.paymentHistory.length > 0) {
        paidFee = student.paymentHistory.reduce((sum, p) => sum + (p.amount || 0), 0);
      }

      if (student.hasCustomConcession) {
        totalFee = student.totalFee || 0;
      } else {
        const template = allClassFees.find(cf => cf.className.trim().toLowerCase() === student.class.trim().toLowerCase());
        if (template) {
          const annual = template.annualFee || 0;
          const monthly = (template.monthlyTuitionFee || 0) * 12;
          const exam = (template.examFee || 0) * 4;
          const computer = (template.computerFee || 0) * 2;
          totalFee = annual + monthly + exam + computer;
        } else {
          totalFee = student.totalFee || 0;
        }
      }

      const dueFee = totalFee - paidFee;
      totalPaid += paidFee;
      totalDue += dueFee;
    });

    // Class + Section wise student count for current session (Active only)
    const classWiseCounts = await Student.aggregate([
      { $match: { session: targetSession, status: 'Active' } },
      {
        $group: {
          _id: { class: '$class', section: '$section' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.class': 1, '_id.section': 1 } }
    ]);
    const classSummary = classWiseCounts.map(c => {
      const cls = c._id.class || 'Unknown';
      const sec = c._id.section || '';
      const hasSection = sec && sec.trim() !== '' && sec.trim() !== '-';
      return {
        className: cls,
        section: sec,
        label: hasSection ? `${cls}-${sec}` : cls,
        count: c.count
      };
    });

    // Aggregate payment history to calculate today's, monthly, cash, and online collection (Active only)
    const todayStr = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
    const currentMonthPrefix = todayStr.substring(0, 7); // Format: YYYY-MM

    const allStudents = await Student.find({ session: targetSession, status: 'Active' }, { paymentHistory: 1 });

    let todayCollection = 0;
    let monthlyCollection = 0;
    let cashCollection = 0;
    let onlineCollection = 0;

    allStudents.forEach(student => {
      if (student.paymentHistory && student.paymentHistory.length > 0) {
        student.paymentHistory.forEach(payment => {
          const payAmount = payment.amount || 0;

          // Match today's date
          if (payment.date === todayStr) {
            todayCollection += payAmount;
          }

          // Match current month
          if (payment.date && payment.date.startsWith(currentMonthPrefix)) {
            monthlyCollection += payAmount;
          }

          // Today's cash/online breakdown
          if (payment.date === todayStr) {
            if (payment.mode === 'Cash') {
              cashCollection += payAmount;
            } else if (payment.mode === 'Online') {
              onlineCollection += payAmount;
            }
          }
        });
      }
    });

    // Calculate today's attendance ratio (Present / Total Active Students)
    const presentCount = await Student.countDocuments({
      session: targetSession,
      status: 'Active',
      attendance: {
        $elemMatch: { date: todayStr, status: 'Present' }
      }
    });

    res.json({
      totalStudents,
      totalTeachers,
      todayAttendance: `${presentCount}/${totalStudents}`,
      totalPaid,
      totalDue,
      todayCollection,
      monthlyCollection,
      cashCollection,
      onlineCollection,
      classSummary
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching stats', error: error.message });
  }
};

// @desc    Get all students with filters
// @route   GET /api/admin/students
// @access  Private (Admin Only)
export const getStudents = async (req, res) => {
  try {
    const { className, section, rollNo, search, hasCustomConcession, session: reqSession } = req.query;

    const activeSession = await Session.findOne({ status: 'Active' });
    const targetSession = reqSession || (activeSession ? activeSession.label : '2025-2026');

    let query = { session: targetSession, status: 'Active' };

    if (className && className !== 'All classes') {
      query.class = className;
    }
    if (section && section !== 'All sections') {
      query.section = section;
    }
    if (rollNo) {
      query.rollNo = Number(rollNo);
    }
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    if (hasCustomConcession !== undefined && hasCustomConcession !== '') {
      query.hasCustomConcession = hasCustomConcession === 'true';
    }

    const students = await Student.find(query);

    // Fetch all class fee templates for the target session to dynamically sync
    const allClassFees = await ClassFee.find({ session: targetSession });

    const syncedStudents = students.map(student => {
      const studentObj = student.toObject();
      if (!studentObj.hasCustomConcession) {
        const template = allClassFees.find(cf => cf.className.trim().toLowerCase() === studentObj.class.trim().toLowerCase());
        if (template) {
          studentObj.annualFee = template.annualFee;
          studentObj.monthlyTuitionFee = template.monthlyTuitionFee;
          studentObj.examFee = template.examFee;
          studentObj.computerFee = template.computerFee;

          // Recalculate totals matching standard 2x computer fee logic
          const annual = template.annualFee || 0;
          const monthly = (template.monthlyTuitionFee || 0) * 12;
          const exam = (template.examFee || 0) * 4;
          const computer = (template.computerFee || 0) * 2;

          studentObj.totalFee = annual + monthly + exam + computer;

          const totalPaid = (studentObj.paymentHistory || []).reduce((sum, p) => sum + (p.amount || 0), 0);
          studentObj.paidFee = totalPaid;
          studentObj.dueFee = studentObj.totalFee - studentObj.paidFee;
        }
      }
      return studentObj;
    });

    res.json(syncedStudents);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching students', error: error.message });
  }
};

// @desc    Update student profile details
// @route   PUT /api/admin/students/:id
// @access  Private (Admin Only)
export const updateStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const student = await Student.findById(id);

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const {
      name,
      fatherName,
      motherName,
      admissionId,
      classVal, // frontend sends this as classVal or class
      section,
      rollNo,
      dob,
      mobileNumber,
      address,
      hasCustomConcession,
      annualFee,
      monthlyTuitionFee,
      examFee,
      computerFee
    } = req.body;

    // Validate roll number uniqueness within same class + section (excluding self)
    const newClass = classVal !== undefined ? classVal : student.class;
    const newSection = section !== undefined ? section : student.section;
    const newRollNo = rollNo !== undefined ? Number(rollNo) : student.rollNo;
    if (rollNo !== undefined && Number(rollNo) > 0) {
      const duplicate = await Student.findOne({
        class: newClass,
        section: newSection,
        rollNo: newRollNo,
        _id: { $ne: id }
      });
      if (duplicate) {
        return res.status(400).json({
          message: `Roll number ${newRollNo} is already taken by ${duplicate.name} in Class ${newClass}-${newSection}. Use a different roll number.`
        });
      }
    }

    // Update values
    if (name !== undefined) student.name = name;
    if (fatherName !== undefined) student.fatherName = fatherName;
    if (motherName !== undefined) student.motherName = motherName;
    if (admissionId !== undefined) student.admissionId = admissionId;
    if (classVal !== undefined) student.class = classVal;
    if (section !== undefined) student.section = section;
    if (rollNo !== undefined) student.rollNo = Number(rollNo) || 0;

    // If DOB changes, reset and re-hash password to new DOB YYYY-MM-DD
    if (dob !== undefined && dob !== student.dob) {
      student.dob = dob;
      student.password = dob;
    }

    if (mobileNumber !== undefined) student.mobileNumber = mobileNumber;
    if (address !== undefined) student.address = address;

    if (hasCustomConcession !== undefined) {
      student.hasCustomConcession = hasCustomConcession === 'true' || hasCustomConcession === true;
    }

    if (student.hasCustomConcession) {
      if (annualFee !== undefined) student.annualFee = Number(annualFee) || 0;
      if (monthlyTuitionFee !== undefined) student.monthlyTuitionFee = Number(monthlyTuitionFee) || 0;
      if (examFee !== undefined) student.examFee = Number(examFee) || 0;
      if (computerFee !== undefined) student.computerFee = Number(computerFee) || 0;
    }

    // Handle photo removal or upload
    if (req.body.removePhoto === 'true') {
      student.photo = '';
    } else if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(req.file.buffer);
        student.photo = uploadResult.secure_url;
      } catch (err) {
        console.error('Cloudinary upload error:', err.message);
        return res.status(500).json({
          message: 'Failed to upload photo to Cloudinary. Please check .env credentials.',
          error: err.message
        });
      }
    }

    await student.save();

    const studentObj = student.toObject();
    if (!studentObj.hasCustomConcession) {
      try {
        const template = await ClassFee.findOne({ className: studentObj.class.trim(), session: studentObj.session });
        if (template) {
          studentObj.annualFee = template.annualFee;
          studentObj.monthlyTuitionFee = template.monthlyTuitionFee;
          studentObj.examFee = template.examFee;
          studentObj.computerFee = template.computerFee;

          const annual = template.annualFee || 0;
          const monthly = (template.monthlyTuitionFee || 0) * 12;
          const exam = (template.examFee || 0) * 4;
          const computer = (template.computerFee || 0) * 2;
          studentObj.totalFee = annual + monthly + exam + computer;

          const totalPaid = (studentObj.paymentHistory || []).reduce((sum, p) => sum + (p.amount || 0), 0);
          studentObj.paidFee = totalPaid;
          studentObj.dueFee = studentObj.totalFee - studentObj.paidFee;
        }
      } catch (err) {
        console.error('Error fetching dynamic fees for student update:', err.message);
      }
    }

    res.json({ message: 'Student updated successfully', student: studentObj });
  } catch (error) {
    res.status(500).json({ message: 'Server error updating student profile', error: error.message });
  }
};

// @desc    Get all teachers with optional search filter
// @route   GET /api/admin/teachers
// @access  Private (Admin Only)
export const getTeachers = async (req, res) => {
  try {
    const { search } = req.query;
    let query = {};
    if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { subject: { $regex: search, $options: 'i' } }
        ]
      };
    }
    const teachers = await Teacher.find(query).sort({ name: 1 });
    res.json(teachers);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching teachers', error: error.message });
  }
};

// @desc    Create a new teacher profile
// @route   POST /api/admin/teachers
// @access  Private (Admin Only)
export const createTeacher = async (req, res) => {
  try {
    const { name, email, mobile, subject, classAssigned, sectionAssigned, joinedOn, password } = req.body;

    // Check if email already exists
    const existing = await Teacher.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ message: 'Teacher with this email already exists' });
    }

    let defaultPassword = password;
    if (!defaultPassword || defaultPassword.trim() === '') {
      defaultPassword = 'teacher123';
    }

    const teacher = new Teacher({
      name,
      email,
      mobile,
      subject,
      classAssigned,
      sectionAssigned,
      joinedOn: joinedOn || new Date().toISOString().split('T')[0],
      password: defaultPassword
    });

    if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(req.file.buffer);
        teacher.photo = uploadResult.secure_url;
      } catch (err) {
        console.error('Cloudinary teacher upload error:', err.message);
        return res.status(500).json({
          message: 'Failed to upload photo to Cloudinary. Please check .env credentials.',
          error: err.message
        });
      }
    }

    await teacher.save();
    res.status(201).json({ message: 'Teacher created successfully', teacher });
  } catch (error) {
    res.status(500).json({ message: 'Server error creating teacher', error: error.message });
  }
};

// @desc    Update a teacher's profile details
// @route   PUT /api/admin/teachers/:id
// @access  Private (Admin Only)
export const updateTeacher = async (req, res) => {
  try {
    const { id } = req.params;
    const teacher = await Teacher.findById(id);
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    const { name, email, mobile, subject, classAssigned, sectionAssigned, joinedOn } = req.body;

    if (name !== undefined) teacher.name = name;
    if (email !== undefined) {
      if (email.toLowerCase() !== teacher.email) {
        const existing = await Teacher.findOne({ email: email.toLowerCase() });
        if (existing) {
          return res.status(400).json({ message: 'Email already used by another teacher' });
        }
        teacher.email = email.toLowerCase();
      }
    }
    if (mobile !== undefined) teacher.mobile = mobile;
    if (subject !== undefined) teacher.subject = subject;
    if (classAssigned !== undefined) teacher.classAssigned = classAssigned;
    if (sectionAssigned !== undefined) teacher.sectionAssigned = sectionAssigned;
    if (joinedOn !== undefined) teacher.joinedOn = joinedOn;

    // Handle photo removal or upload
    if (req.body.removePhoto === 'true') {
      teacher.photo = '';
    } else if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(req.file.buffer);
        teacher.photo = uploadResult.secure_url;
      } catch (err) {
        console.error('Cloudinary teacher update upload error:', err.message);
        return res.status(500).json({
          message: 'Failed to upload photo to Cloudinary. Please check .env credentials.',
          error: err.message
        });
      }
    }

    await teacher.save();
    res.json({ message: 'Teacher updated successfully', teacher });
  } catch (error) {
    res.status(500).json({ message: 'Server error updating teacher', error: error.message });
  }
};

// @desc    Delete a teacher
// @route   DELETE /api/admin/teachers/:id
// @access  Private (Admin Only)
export const deleteTeacher = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await Teacher.findByIdAndDelete(id);
    if (!result) {
      return res.status(404).json({ message: 'Teacher not found' });
    }
    res.json({ message: 'Teacher deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error deleting teacher', error: error.message });
  }
};

// @desc    Reset teacher password
// @route   POST /api/admin/teachers/:id/reset-password
// @access  Private (Admin Only)
export const resetTeacherPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    const teacher = await Teacher.findById(id);
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    teacher.password = password || 'teacher123';
    await teacher.save();
    res.json({ message: 'Teacher password reset successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error resetting teacher password', error: error.message });
  }
};

// @desc    Get next dynamic admission ID
// @route   GET /api/admin/students/next-admission-id
// @access  Private (Admin Only)
export const getNextAdmissionId = async (req, res) => {
  try {
    // Find the student with the highest numeric admissionId
    const lastStudent = await Student.findOne(
      { admissionId: { $type: 'number' } },
      { admissionId: 1 }
    ).sort({ admissionId: -1 });

    const nextNum = lastStudent ? (lastStudent.admissionId + 1) : 1;
    res.json({ nextAdmissionId: nextNum });
  } catch (error) {
    res.status(500).json({ message: 'Server error generating admission ID', error: error.message });
  }
};

export const createStudent = async (req, res) => {
  try {
    const {
      name,
      fatherName,
      motherName,
      classVal,
      section,
      rollNo,
      dob,
      mobileNumber,
      address,
      hasCustomConcession,
      annualFee,
      monthlyTuitionFee,
      examFee,
      computerFee
    } = req.body;

    // Generate dynamic admission ID — find largest number in DB + 1
    const lastStudent = await Student.findOne(
      { admissionId: { $type: 'number' } },
      { admissionId: 1 }
    ).sort({ admissionId: -1 });

    const admissionId = lastStudent ? (lastStudent.admissionId + 1) : 1;

    const activeSession = await Session.findOne({ status: 'Active' });
    const targetSession = activeSession ? activeSession.label : '2025-2026';

    const isCustom = hasCustomConcession === 'true';

    // Validate roll number uniqueness within same class + section
    if (rollNo && Number(rollNo) > 0) {
      const duplicate = await Student.findOne({
        class: classVal,
        section: section,
        rollNo: Number(rollNo)
      });
      if (duplicate) {
        return res.status(400).json({
          message: `Roll number ${rollNo} is already taken by ${duplicate.name} in Class ${classVal}-${section}. Use a different roll number.`
        });
      }
    }

    const student = new Student({
      name,
      fatherName,
      motherName,
      admissionId,
      class: classVal,
      section,
      rollNo: Number(rollNo) || 0,
      dob,
      mobileNumber,
      address,
      password: dob, // Default password is DOB YYYY-MM-DD
      hasCustomConcession: isCustom,
      session: targetSession
    });

    if (isCustom) {
      if (annualFee !== undefined) student.annualFee = Number(annualFee) || 0;
      if (monthlyTuitionFee !== undefined) student.monthlyTuitionFee = Number(monthlyTuitionFee) || 0;
      if (examFee !== undefined) student.examFee = Number(examFee) || 0;
      if (computerFee !== undefined) student.computerFee = Number(computerFee) || 0;
    }

    // Handle profile photo upload if present
    if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(req.file.buffer);
        student.photo = uploadResult.secure_url;
      } catch (err) {
        console.error('Cloudinary student admission upload error:', err.message);
        return res.status(500).json({
          message: 'Failed to upload photo to Cloudinary. Please check .env credentials.',
          error: err.message
        });
      }
    }

    await student.save();

    // Map template check on returned student object
    const studentObj = student.toObject();
    if (!studentObj.hasCustomConcession) {
      try {
        const template = await ClassFee.findOne({ className: studentObj.class.trim(), session: studentObj.session });
        if (template) {
          studentObj.annualFee = template.annualFee;
          studentObj.monthlyTuitionFee = template.monthlyTuitionFee;
          studentObj.examFee = template.examFee;
          studentObj.computerFee = template.computerFee;

          const annual = template.annualFee || 0;
          const monthly = (template.monthlyTuitionFee || 0) * 12;
          const exam = (template.examFee || 0) * 4;
          const computer = (template.computerFee || 0) * 2;
          studentObj.totalFee = annual + monthly + exam + computer;

          const totalPaid = (studentObj.paymentHistory || []).reduce((sum, p) => sum + (p.amount || 0), 0);
          studentObj.paidFee = totalPaid;
          studentObj.dueFee = studentObj.totalFee - studentObj.paidFee;
        }
      } catch (err) {
        console.error('Error fetching dynamic fees for student admission:', err.message);
      }
    }

    res.status(201).json({ message: 'Student admitted successfully', student: studentObj });
  } catch (error) {
    res.status(500).json({ message: 'Server error admitting student', error: error.message });
  }
};

// Admin CRUD controllers
// @desc    Get all admins
// @route   GET /api/admin/admins
// @access  Private (Admin Only)
export const getAdmins = async (req, res) => {
  try {
    const admins = await Admin.find({}, '-password').sort({ createdAt: 1 });
    res.json(admins);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching admins', error: error.message });
  }
};

// @desc    Create new admin
// @route   POST /api/admin/admins
// @access  Private (Admin Only)
export const createNewAdmin = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const adminExists = await Admin.findOne({ email: email.toLowerCase() });
    if (adminExists) {
      return res.status(400).json({ message: 'Admin email already registered' });
    }

    const admin = new Admin({
      name: name || 'Principal',
      email: email.toLowerCase(),
      password
    });

    await admin.save();

    const adminObj = admin.toObject();
    delete adminObj.password;

    res.status(201).json({ message: 'Admin created successfully', admin: adminObj });
  } catch (error) {
    res.status(500).json({ message: 'Server error creating admin', error: error.message });
  }
};

// @desc    Update admin info (name and optionally email)
// @route   PUT /api/admin/admins/:id
// @access  Private (Admin Only)
export const updateAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email } = req.body;

    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    if (name !== undefined) admin.name = name;
    if (email !== undefined && email.toLowerCase() !== admin.email) {
      const emailExists = await Admin.findOne({ email: email.toLowerCase() });
      if (emailExists) {
        return res.status(400).json({ message: 'Email is already in use by another admin' });
      }
      admin.email = email.toLowerCase();
    }

    await admin.save();

    const adminObj = admin.toObject();
    delete adminObj.password;

    res.json({ message: 'Admin updated successfully', admin: adminObj });
  } catch (error) {
    res.status(500).json({ message: 'Server error updating admin', error: error.message });
  }
};

// @desc    Reset admin password
// @route   POST /api/admin/admins/:id/reset-password
// @access  Private (Admin Only)
export const resetAdminPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    admin.password = password;
    await admin.save();

    res.json({ message: 'Admin password reset successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error resetting password', error: error.message });
  }
};

// @desc    Delete admin
// @route   DELETE /api/admin/admins/:id
// @access  Private (Admin Only)
export const deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent deleting yourself (the currently logged in admin)
    if (req.user.id === id) {
      return res.status(400).json({ message: 'Cannot delete currently logged in admin account' });
    }

    // Prevent deleting the primary/creator admin (earliest created)
    const firstAdmin = await Admin.findOne().sort({ createdAt: 1 });
    if (firstAdmin && id === firstAdmin._id.toString()) {
      return res.status(400).json({ message: 'Cannot delete the primary/creator admin account' });
    }

    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    await admin.deleteOne();

    res.json({ message: 'Admin removed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error removing admin', error: error.message });
  }
};

// @desc    Add fee payment for a student
// @route   POST /api/admin/students/:id/payments
// @access  Private (Admin Only)
export const addPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, mode, date, remarks } = req.body;

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Valid payment amount is required' });
    }
    if (!mode || !['Cash', 'Online'].includes(mode)) {
      return res.status(400).json({ message: 'Valid payment mode (Cash or Online) is required' });
    }
    if (!date) {
      return res.status(400).json({ message: 'Payment date is required' });
    }

    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Generate unique receipt number
    const receiptNo = `REC-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // Push new payment to paymentHistory
    student.paymentHistory.push({
      receiptNo,
      date,
      amount: Number(amount),
      mode,
      remarks: remarks || ''
    });

    // Save student (pre-save hook will auto recalculate totalFee, paidFee, dueFee)
    await student.save();

    res.json({
      message: 'Payment added successfully',
      student
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error adding payment', error: error.message });
  }
};

// @desc    Bulk promote students to next class and session
// @route   POST /api/admin/students/promote
// @access  Private (Admin Only)
export const promoteStudents = async (req, res) => {
  try {
    const { studentIds, fromSession, toSession, targetSection, autoRollNumbers } = req.body;

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ message: 'No students selected for promotion' });
    }

    if (!fromSession || !toSession || !targetSection) {
      return res.status(400).json({ message: 'Missing required promotion parameters' });
    }

    // Helper to calculate next class level
    const getNextClass = (currentClass) => {
      const cls = currentClass.trim().toUpperCase();
      if (cls === 'NURSERY') return 'LKG';
      if (cls === 'LKG') return 'UKG';
      if (cls === 'UKG') return '1';
      
      const num = parseInt(cls, 10);
      if (!isNaN(num)) {
        if (num >= 10) return 'Passed Out';
        return String(num + 1);
      }
      return 'Passed Out';
    };

    let targetClass = '';

    for (const studentId of studentIds) {
      const student = await Student.findById(studentId);
      if (!student) continue;

      const nextClass = getNextClass(student.class);
      targetClass = nextClass; // All selected students will have the same target class

      if (nextClass === 'Passed Out') {
        student.class = 'Passed Out';
        student.status = 'Passed Out';
        student.archiveReason = 'Graduated from Class 10';
        student.archivedAt = new Date();
        student.annualFee = 0;
        student.monthlyTuitionFee = 0;
        student.examFee = 0;
        student.computerFee = 0;
        student.totalFee = 0;
        student.paidFee = 0;
        student.dueFee = 0;
        student.paymentHistory = [];
        student.session = toSession;
      } else {
        // Fetch fee structure template for next class in target session
        const template = await ClassFee.findOne({ className: nextClass, session: toSession });
        const annual = template ? template.annualFee : 0;
        const monthly = template ? template.monthlyTuitionFee : 0;
        const exam = template ? template.examFee : 0;
        const computer = template ? template.computerFee : 0;

        student.class = nextClass;
        student.section = targetSection;
        student.session = toSession;

        // Reset fee details for new session
        student.annualFee = annual;
        student.monthlyTuitionFee = monthly;
        student.examFee = exam;
        student.computerFee = computer;
        student.totalFee = annual + (monthly * 12) + (exam * 4) + (computer * 2);
        student.paidFee = 0;
        student.dueFee = student.totalFee;
        student.paymentHistory = [];
      }

      await student.save();
    }

    // Auto assign sequential roll numbers alphabetically if requested
    if (autoRollNumbers && targetClass && targetClass !== 'Passed Out') {
      const promotedList = await Student.find({
        class: targetClass,
        section: targetSection,
        session: toSession
      }).sort({ name: 1 });

      for (let i = 0; i < promotedList.length; i++) {
        promotedList[i].rollNo = i + 1;
        await promotedList[i].save();
      }
    }

    res.json({ message: `${studentIds.length} students promoted successfully!` });
  } catch (error) {
    res.status(500).json({ message: 'Server error during promotion', error: error.message });
  }
};

// @desc    Get all archived students
// @route   GET /api/admin/archived-students
// @access  Private (Admin Only)
export const getArchivedStudents = async (req, res) => {
  try {
    const { search, status } = req.query;
    let query = { status: { $ne: 'Active' } };

    if (status && status !== 'All') {
      query.status = status;
    }
    if (search) {
      const searchNum = Number(search);
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { class: { $regex: search, $options: 'i' } },
        { archiveReason: { $regex: search, $options: 'i' } }
      ];
      if (!isNaN(searchNum)) {
        query.$or.push({ admissionId: searchNum });
      }
    }

    const students = await Student.find(query).sort({ archivedAt: -1 });
    res.json(students);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching archived students', error: error.message });
  }
};

// @desc    Archive a student (Passed Out or Locked / Left)
// @route   POST /api/admin/students/:id/archive
// @access  Private (Admin Only)
export const archiveStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    if (!['Passed Out', 'Locked / Left'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status type for archiving' });
    }

    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    student.status = status;
    student.archiveReason = reason || '';
    student.archivedAt = new Date();

    // Reset fee status for next session if passed out to keep things clean
    if (status === 'Passed Out') {
      student.class = 'Passed Out';
      student.annualFee = 0;
      student.monthlyTuitionFee = 0;
      student.examFee = 0;
      student.computerFee = 0;
      student.totalFee = 0;
      student.paidFee = 0;
      student.dueFee = 0;
    }

    await student.save();

    res.json({ message: `Student archived successfully as ${status}`, student });
  } catch (error) {
    res.status(500).json({ message: 'Server error archiving student', error: error.message });
  }
};

// @desc    Restore / Unarchive a student
// @route   POST /api/admin/students/:id/unarchive
// @access  Private (Admin Only)
export const unarchiveStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const { targetClass, targetSection, targetSession } = req.body;

    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    student.status = 'Active';
    student.archiveReason = '';
    student.archivedAt = undefined;

    // If restoring, optionally put them in a target class/section
    if (targetClass && targetSection && targetSession) {
      student.class = targetClass;
      student.section = targetSection;
      student.session = targetSession;

      // Sync fee template
      const template = await ClassFee.findOne({ className: targetClass, session: targetSession });
      if (template) {
        student.annualFee = template.annualFee;
        student.monthlyTuitionFee = template.monthlyTuitionFee;
        student.examFee = template.examFee;
        student.computerFee = template.computerFee;
      }
    }

    await student.save();

    res.json({ message: 'Student restored successfully to active list', student });
  } catch (error) {
    res.status(500).json({ message: 'Server error restoring student', error: error.message });
  }
};
