const RANGE_MAP = {
  '1h': '1 hour',
  '12h': '12 hours',
  '24h': '24 hours',
};

function rangeToInterval(range) {
  const interval = RANGE_MAP[range];
  if (!interval) {
    throw new Error(`Invalid range: ${range}`);
  }
  return interval;
}

module.exports = { rangeToInterval };
