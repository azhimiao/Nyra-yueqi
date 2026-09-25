/** Defer the assistant UI/store chunk until the surface is actually opened. */

export function createLazyStudioAssistMount(root, deps = {}) {
  let instance = null;
  let loadPromise = null;
  let destroyed = false;

  function load() {
    if (instance) return Promise.resolve(instance);
    if (!loadPromise) {
      loadPromise = import("./assist-ui.js").then(({ mountStudioAssist }) => {
        if (destroyed) return null;
        instance = mountStudioAssist(root, deps);
        return instance;
      });
    }
    return loadPromise;
  }

  return {
    open(opts = {}) {
      return load().then((api) => api?.open?.(opts));
    },
    refresh() {
      return load().then((api) => api?.refresh?.());
    },
    destroy() {
      destroyed = true;
      instance?.destroy?.();
      instance = null;
    },
  };
}
