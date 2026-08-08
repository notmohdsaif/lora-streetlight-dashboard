const express = require('express');
const { rangeToInterval } = require('../rangeToInterval');
const { queryHistory } = require('../db');

function createHistoryRouter() {
  const router = express.Router();

  router.get('/api/history', async (req, res) => {
    const { node, param, range } = req.query;

    if (!param) {
      return res.status(400).json({ error: 'param is required' });
    }

    let interval;
    try {
      interval = rangeToInterval(range || '12h');
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const nodeId = node !== undefined ? Number(node) : null;
    const rows = await queryHistory(nodeId, param, interval);
    res.json(rows);
  });

  return router;
}

module.exports = { createHistoryRouter };
