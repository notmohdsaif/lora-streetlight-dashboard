function checkOnlineTransition(prevOnlineMap, node, isOnline) {
  const prev = prevOnlineMap[node];
  const newMap = { ...prevOnlineMap, [node]: isOnline };

  let logMessage = null;
  if (prev !== undefined && prev !== isOnline) {
    logMessage = isOnline
      ? `Node ${node} back online`
      : `Node ${node} offline (timeout)`;
  }

  return { newMap, logMessage };
}

module.exports = { checkOnlineTransition };
