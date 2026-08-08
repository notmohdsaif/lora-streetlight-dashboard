const express = require('express');
const { validateCmd, canSend } = require('../controlLogic');

function createControlRouter({ publishControl, insertLog }) {
  const router = express.Router();
  let lastSentAt = null;

  router.post('/api/control', async (req, res) => {
    const { cmd } = req.body;

    if (!validateCmd(cmd)) {
      return res.status(400).json({ error: 'cmd must be ON or OFF' });
    }

    const now = Date.now();
    if (!canSend(lastSentAt, now)) {
      return res.status(429).json({ error: 'Command sent too recently, please wait' });
    }
    lastSentAt = now;

    publishControl(cmd);

    try {
      await insertLog(`CMD ${cmd} broadcast (manual)`);
    } catch (err) {
      console.error('DB write failed (control log), continuing:', err.message);
    }

    res.json({ ok: true, cmd });
  });

  return router;
}

module.exports = { createControlRouter };
