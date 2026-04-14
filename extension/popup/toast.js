class ToastManager {
  constructor(container) {
    this.container = container || document.body;
    this.activeToasts = [];
    this.maxVisible = 3;
  }

  show(message, type = 'info', duration = null) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${this.getIcon(type)}</span>
      <span class="toast-message">${message}</span>
    `;

    this.container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('toast-visible');
    });

    const timeout = duration || (type === 'error' ? 5000 : 3000);
    const timer = setTimeout(() => this.dismiss(toast), timeout);

    this.activeToasts.push({ toast, timer });

    if (this.activeToasts.length > this.maxVisible) {
      const oldest = this.activeToasts.shift();
      clearTimeout(oldest.timer);
      this.dismiss(oldest.toast);
    }

    return toast;
  }

  dismiss(toast) {
    if (!toast || !toast.parentNode) return;

    toast.classList.remove('toast-visible');
    toast.classList.add('toast-hiding');

    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
      this.activeToasts = this.activeToasts.filter(t => t.toast !== toast);
    }, 200);
  }

  getIcon(type) {
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    return icons[type] || icons.info;
  }

  clearAll() {
    this.activeToasts.forEach(({ toast, timer }) => {
      clearTimeout(timer);
      this.dismiss(toast);
    });
    this.activeToasts = [];
  }
}

export default ToastManager;
