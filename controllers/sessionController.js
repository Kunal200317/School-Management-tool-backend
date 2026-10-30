import Session from '../models/Session.js';

// @desc    Create new academic session
// @route   POST /api/sessions
// @access  Private (Admin Only)
export const createSession = async (req, res) => {
  try {
    const { label, startYear } = req.body;

    if (!label || !startYear) {
      return res.status(400).json({ message: 'Label and start year are required' });
    }

    const trimmedLabel = label.trim();

    // Check if session already exists
    const existing = await Session.findOne({ label: trimmedLabel });
    if (existing) {
      return res.status(400).json({ message: 'Session with this label already exists' });
    }

    const session = new Session({
      label: trimmedLabel,
      startYear: Number(startYear),
      status: 'Closed'
    });

    await session.save();
    res.status(201).json(session);
  } catch (error) {
    res.status(500).json({ message: 'Server error creating session', error: error.message });
  }
};

// @desc    Get all academic sessions
// @route   GET /api/sessions
// @access  Private (Admin Only)
export const getSessions = async (req, res) => {
  try {
    const sessions = await Session.find().sort({ startYear: -1 });
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching sessions', error: error.message });
  }
};

// @desc    Set academic session as Active
// @route   PATCH /api/sessions/:id/active
// @access  Private (Admin Only)
export const setActiveSession = async (req, res) => {
  try {
    const { id } = req.params;

    const session = await Session.findById(id);
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    // Set all sessions status to Closed
    await Session.updateMany({}, { status: 'Closed' });

    // Set target session to Active
    session.status = 'Active';
    await session.save();

    res.json({ message: 'Session activated successfully', session });
  } catch (error) {
    res.status(500).json({ message: 'Server error activating session', error: error.message });
  }
};

// @desc    Close academic session
// @route   PATCH /api/sessions/:id/close
// @access  Private (Admin Only)
export const closeSession = async (req, res) => {
  try {
    const { id } = req.params;

    const session = await Session.findById(id);
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    session.status = 'Closed';
    await session.save();

    res.json({ message: 'Session closed successfully', session });
  } catch (error) {
    res.status(500).json({ message: 'Server error closing session', error: error.message });
  }
};
