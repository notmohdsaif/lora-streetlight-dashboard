const express = require('express');
const { queryLogs } = require('../db');

function createLogsRouter() {
  const router = express.Router();

  router.get('/api/logs', async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const rows = await queryLogs(limit);
    res.json(rows);
  });

  return router;
}

module.exports = { createLogsRouter };
