const express = require('express');
const { validateCmd, canSend, validateNodes, nodesToMask } = require('../controlLogic');

function createControlRouter({ publishControl, insertLog }) {
  const router = express.Router();
  let lastSentAt = null;

  router.post('/api/control', async (req, res) => {
    const { cmd, nodes } = req.body;

    if (!validateCmd(cmd)) {
      return res.status(400).json({ error: 'cmd must be ON or OFF' });
    }
    if (!validateNodes(nodes)) {
      return res.status(400).json({ error: 'nodes must be a non-empty array of unique node IDs 1-9' });
    }

    const now = Date.now();
    if (!canSend(lastSentAt, now)) {
      return res.status(429).json({ error: 'Command sent too recently, please wait' });
    }
    lastSentAt = now;

    const mask = nodesToMask(nodes);
    publishControl(cmd, mask);

    const target = nodes === undefined ? 'broadcast' : `node ${nodes.join(', ')}`;
    try {
      await insertLog(`CMD ${cmd} sent to ${target} (manual)`);
    } catch (err) {
      console.error('DB write failed (control log), continuing:', err.message);
    }

    res.json({ ok: true, cmd, nodes: nodes ?? null });
  });

  return router;
}

module.exports = { createControlRouter };
