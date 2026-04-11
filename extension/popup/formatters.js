export function formatNumber(value) {
  if (value >= 10000) {
    return `${(value / 10000).toFixed(1)}万`;
  }

  return Number(value || 0).toLocaleString('zh-CN');
}

export function formatChange(value) {
  if (value > 0) return `+${value}`;
  if (value < 0) return String(value);
  return '0';
}

export function formatTime(isoString) {
  const date = new Date(isoString);
  const diff = Date.now() - date.getTime();

  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;

  return `${date.toLocaleDateString('zh-CN')} ${date.toLocaleTimeString('zh-CN')}`;
}
