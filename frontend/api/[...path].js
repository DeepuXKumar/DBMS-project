const { app, initializeDatabase } = require('../server');

module.exports = async function handler(req, res) {
  try {
    await initializeDatabase();
  } catch (err) {
    console.error('Failed to initialize MongoDB:', err);
    return res.status(503).json({ error: 'Database is unavailable.' });
  }

  return app(req, res);
};
