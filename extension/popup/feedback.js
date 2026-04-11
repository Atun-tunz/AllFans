export function createFeedbackController(element) {
  let timer = null;

  function clear() {
    element.hidden = true;
    element.textContent = '';
    element.className = 'feedback';
  }

  function show(message, type = 'error', durationMs = 5000) {
    element.hidden = false;
    element.textContent = message;
    element.className = `feedback is-${type}`;

    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(clear, durationMs);
  }

  return { show, clear };
}
