import ClassFee from '../models/ClassFee.js';
import Student from '../models/Student.js';
import Session from '../models/Session.js';

// @desc    Get default fee structures for all classes
// @route   GET /api/fees/class
// @access  Public
export const getClassFees = async (req, res) => {
  try {
    const activeSession = await Session.findOne({ status: 'Active' });
    const targetSession = req.query.session || (activeSession ? activeSession.label : '2025-2026');
    const fees = await ClassFee.find({ session: targetSession }).sort({ className: 1 });
    res.json(fees);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Set or update default fee structure for a class
// @route   POST /api/fees/class
// @access  Private (Admin Only)
export const setClassFee = async (req, res) => {
  const { className, annualFee, monthlyTuitionFee, examFee, computerFee, session: reqSession } = req.body;

  try {
    // Basic validation
    if (!className) {
      return res.status(400).json({ message: 'Class name is required' });
    }

    const activeSession = await Session.findOne({ status: 'Active' });
    const targetSession = reqSession || (activeSession ? activeSession.label : '2025-2026');

    const trimmedClassName = className.trim();
    const annual = Number(annualFee) || 0;
    const monthly = Number(monthlyTuitionFee) || 0;
    const exam = Number(examFee) || 0;
    const computer = Number(computerFee) || 0;

    // 1. Create or update ClassFee template
    const classFee = await ClassFee.findOneAndUpdate(
      { className: trimmedClassName, session: targetSession },
      {
        className: trimmedClassName,
        session: targetSession,
        annualFee: annual,
        monthlyTuitionFee: monthly,
        examFee: exam,
        computerFee: computer
      },
      { upsert: true, new: true }
    );

    // 2. Propagate updates to all students in this class who do not have custom concessions
    // We use a MongoDB update aggregation pipeline to recalculate totalFee and dueFee dynamically
    const updateResult = await Student.updateMany(
      { class: trimmedClassName, session: targetSession, hasCustomConcession: false },
      [
        {
          $set: {
            annualFee: annual,
            monthlyTuitionFee: monthly,
            examFee: exam,
            computerFee: computer,
            totalFee: {
              $add: [
                annual,
                { $multiply: [monthly, 12] },
                { $multiply: [exam, 4] },
                { $multiply: [computer, 2] }
              ]
            }
          }
        },
        {
          $set: {
            dueFee: { $subtract: ["$totalFee", "$paidFee"] }
          }
        }
      ]
    );

    res.status(200).json({
      message: `Fee structure for class '${trimmedClassName}' updated successfully`,
      classFee,
      studentsUpdatedCount: updateResult.modifiedCount
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Batch set or update default fee structures for multiple classes
// @route   POST /api/fees/class/batch
// @access  Private (Admin Only)
export const batchSetClassFees = async (req, res) => {
  const { classes, session: reqSession } = req.body;

  try {
    if (!Array.isArray(classes)) {
      return res.status(400).json({ message: 'Classes must be an array' });
    }

    const activeSession = await Session.findOne({ status: 'Active' });
    const targetSession = reqSession || (activeSession ? activeSession.label : '2025-2026');

    const savedFees = [];
    for (const item of classes) {
      const { className, annualFee, monthlyTuitionFee, examFee, computerFee } = item;
      
      const trimmedClassName = className.trim();
      const annual = Number(annualFee) || 0;
      const monthly = Number(monthlyTuitionFee) || 0;
      const exam = Number(examFee) || 0;
      const computer = Number(computerFee) || 0;

      const classFee = await ClassFee.findOneAndUpdate(
        { className: trimmedClassName, session: targetSession },
        {
          className: trimmedClassName,
          session: targetSession,
          annualFee: annual,
          monthlyTuitionFee: monthly,
          examFee: exam,
          computerFee: computer
        },
        { upsert: true, new: true }
      );

      // Propagate updates to all students in this class who do not have custom concessions
      await Student.updateMany(
        { class: trimmedClassName, session: targetSession, hasCustomConcession: false },
        [
          {
            $set: {
              annualFee: annual,
              monthlyTuitionFee: monthly,
              examFee: exam,
              computerFee: computer,
              totalFee: {
                $add: [
                  annual,
                  { $multiply: [monthly, 12] },
                  { $multiply: [exam, 4] },
                  { $multiply: [computer, 2] }
                ]
              }
            }
          },
          {
            $set: {
              dueFee: { $subtract: ["$totalFee", "$paidFee"] }
            }
          }
        ]
      );
      savedFees.push(classFee);
    }

    res.status(200).json({
      message: 'All class fee structures updated successfully',
      count: savedFees.length
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error saving batch fees', error: error.message });
  }
};
