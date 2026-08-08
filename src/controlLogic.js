function validateCmd(cmd) {
  return cmd === 'ON' || cmd === 'OFF';
}

function canSend(lastSentAt, now, minGapMs = 2000) {
  if (lastSentAt === null) return true;
  return (now - lastSentAt) >= minGapMs;
}

module.exports = { validateCmd, canSend };
