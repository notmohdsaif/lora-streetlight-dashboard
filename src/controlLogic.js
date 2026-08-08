function validateCmd(cmd) {
  return cmd === 'ON' || cmd === 'OFF';
}

function canSend(lastSentAt, now, minGapMs = 2000) {
  if (lastSentAt === null) return true;
  return (now - lastSentAt) >= minGapMs;
}

// nodes is optional — undefined means "broadcast to every node" and is
// always valid. When present it must be a non-empty array of unique
// integers in 1-9 (matches firmware NUM_NODES / the 9-bit nodeMask).
function validateNodes(nodes) {
  if (nodes === undefined) return true;
  if (!Array.isArray(nodes) || nodes.length === 0) return false;
  const allValid = nodes.every((n) => Number.isInteger(n) && n >= 1 && n <= 9);
  return allValid && new Set(nodes).size === nodes.length;
}

// Mirrors the firmware's nodeMaskContains() bit convention: bit (n-1) for
// node n. Call only after validateNodes() has confirmed the input is safe.
function nodesToMask(nodes) {
  if (nodes === undefined) return 0x01FF;
  return nodes.reduce((mask, n) => mask | (1 << (n - 1)), 0);
}

module.exports = { validateCmd, canSend, validateNodes, nodesToMask };
