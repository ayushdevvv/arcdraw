// A tiny toast store that works from anywhere: React components, services,
// and plain functions. The <Toaster /> component renders whatever is in here.

const MAX_VISIBLE = 4;

let toasts = [];
let counter = 0;
const listeners = new Set();

function emit() {
  toasts = toasts.slice();
  listeners.forEach(function (listener) { listener(); });
}

export function subscribe(listener) {
  listeners.add(listener);
  return function () { listeners.delete(listener); };
}

export function getToasts() {
  return toasts;
}

function defaultDuration(type, hasAction) {
  if (type === "loading") return null;
  if (type === "error") return hasAction ? 10000 : 7000;
  if (type === "warning") return hasAction ? 10000 : 6000;
  if (type === "info") return hasAction ? 8000 : 4500;
  return hasAction ? 6000 : 3200;
}

function push(type, message, options) {
  const opts = options || {};
  const text = String(message || "").trim();
  if (!text) return null;
  const key = opts.id || type + ":" + text;
  const duration = opts.duration !== undefined ? opts.duration : defaultDuration(type, Boolean(opts.action));
  const existing = toasts.find(function (item) { return item.key === key; });

  if (existing) {
    // The same message again refreshes the timer and shows a count.
    toasts = toasts.map(function (item) {
      if (item.key !== key) return item;
      return Object.assign({}, item, {
        type: type,
        message: text,
        description: opts.description || "",
        action: opts.action || null,
        duration: duration,
        count: opts.id ? item.count : item.count + 1,
        stamp: item.stamp + 1
      });
    });
    emit();
    return key;
  }

  counter += 1;
  const next = {
    key: key,
    serial: counter,
    type: type,
    message: text,
    description: opts.description || "",
    action: opts.action || null,
    duration: duration,
    count: 1,
    stamp: 0
  };
  toasts = toasts.concat(next);
  while (toasts.length > MAX_VISIBLE) {
    const dropIndex = toasts.findIndex(function (item) { return item.type !== "loading"; });
    toasts.splice(dropIndex === -1 ? 0 : dropIndex, 1);
  }
  emit();
  return key;
}

export function dismissToast(key) {
  const before = toasts.length;
  toasts = toasts.filter(function (item) { return item.key !== key; });
  if (toasts.length !== before) emit();
}

function update(key, type, message, options) {
  const opts = options || {};
  const existing = toasts.find(function (item) { return item.key === key; });
  if (!existing) return push(type, message, Object.assign({}, opts, { id: key }));
  const duration = opts.duration !== undefined ? opts.duration : defaultDuration(type, Boolean(opts.action));
  toasts = toasts.map(function (item) {
    if (item.key !== key) return item;
    return Object.assign({}, item, {
      type: type,
      message: String(message || item.message),
      description: opts.description || "",
      action: opts.action || null,
      duration: duration,
      stamp: item.stamp + 1
    });
  });
  emit();
  return key;
}

export const toast = {
  success: function (message, options) { return push("success", message, options); },
  error: function (message, options) { return push("error", message, options); },
  warning: function (message, options) { return push("warning", message, options); },
  info: function (message, options) { return push("info", message, options); },
  loading: function (message, options) { return push("loading", message, options); },
  update: update,
  dismiss: dismissToast,
  clear: function () { toasts = []; emit(); },
  // Show a loading toast, then turn it into a success or error toast.
  promise: function (promise, messages) {
    const key = push("loading", messages.loading, { id: "promise:" + Date.now() + ":" + Math.random() });
    return promise.then(function (value) {
      const text = typeof messages.success === "function" ? messages.success(value) : messages.success;
      update(key, "success", text);
      return value;
    }).catch(function (error) {
      const text = typeof messages.error === "function" ? messages.error(error) : messages.error;
      update(key, "error", text);
      throw error;
    });
  }
};
