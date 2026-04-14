import { formatNumber } from './formatters.js';

export function animateValue(element, start, end, duration = 1000) {
  const startTime = performance.now();
  const diff = end - start;

  function easeOutExpo(t) {
    return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
  }

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easeOutExpo(progress);

    const currentValue = Math.floor(start + diff * easedProgress);
    element.textContent = formatDisplayNumber(currentValue);

    if (progress < 1) {
      element._animationFrameId = requestAnimationFrame(update);
    } else {
      element.textContent = formatDisplayNumber(end);
      element.classList.remove('is-animating');
      element._animationFrameId = null;
    }
  }

  element.classList.add('is-animating');

  if (element._animationFrameId) {
    cancelAnimationFrame(element._animationFrameId);
  }

  element._animationFrameId = requestAnimationFrame(update);
}

export function shouldAnimate(oldValue, newValue) {
  if (!oldValue || !newValue || oldValue === 0 || newValue === 0) {
    return false;
  }

  const changePercent = Math.abs(newValue - oldValue) / Math.abs(oldValue);
  return changePercent >= 0.05;
}

export function formatDisplayNumber(num) {
  return formatNumber(num);
}

export function parseDisplayNumber(value) {
  const cleaned = String(value || '').trim().replace(/,/g, '');

  if (!cleaned) {
    return 0;
  }

  if (cleaned.endsWith('万')) {
    return Math.round(parseFloat(cleaned) * 10000) || 0;
  }

  if (/[mM]$/.test(cleaned)) {
    return Math.round(parseFloat(cleaned) * 1000000) || 0;
  }

  if (/[kK]$/.test(cleaned)) {
    return Math.round(parseFloat(cleaned) * 1000) || 0;
  }

  return parseInt(cleaned, 10) || 0;
}
