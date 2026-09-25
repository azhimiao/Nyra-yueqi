/**
 * Nav / chrome: main tabs + feature drawer.
 */
export function wireNavPanel(deps) {
  const {
    tabs,
    drawer,
    setPanel,
    refreshIcons,
    onExplore,
    canCloseDrawer,
  } = deps;

  function closeDrawer() {
    if (typeof canCloseDrawer === "function" && canCloseDrawer() === false) return;
    drawer?.classList.remove("is-open");
    drawer?.setAttribute("aria-hidden", "true");
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("[data-contact-menu]").forEach((button) => {
        button.classList.remove("is-active");
        button.setAttribute("aria-current", "false");
      });
      setPanel(tab.dataset.tab);
      if (tab.hasAttribute("data-nav-diary")) {
        document.querySelector('[data-companion-tab="memory"]')?.click();
      }
      setNavHubOpen(false);
      closeDrawer();
    });
    if (!tab.getAttribute("aria-label")) {
      const label = tab.querySelector("[data-i18n], span:last-child")?.textContent?.trim();
      if (label) tab.setAttribute("aria-label", label);
    }
  });

  const navHub = document.querySelector("[data-nav-hub]");
  const navHubToggle = document.querySelector("[data-nav-hub-toggle]");

  const setNavHubOpen = (open) => {
    if (!navHub || !navHubToggle) return;
    navHub.hidden = !open;
    navHub.setAttribute("aria-hidden", String(!open));
    navHubToggle.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("is-nav-hub-open", open);
    if (open) refreshIcons();
  };

  navHubToggle?.addEventListener("click", () => {
    setNavHubOpen(navHubToggle.getAttribute("aria-expanded") !== "true");
  });

  navHub?.querySelectorAll("[data-nav-hub-close]").forEach((button) => {
    button.addEventListener("click", () => setNavHubOpen(false));
  });

  document.querySelectorAll("[data-contact-menu]").forEach((button) => {
    button.addEventListener("click", () => {
      setNavHubOpen(false);
      closeDrawer();
      document.dispatchEvent(new CustomEvent("yueqi:open-settings-route", {
        detail: { route: "community" },
      }));
      tabs.forEach((tab) => {
        tab.classList.remove("is-active");
        tab.setAttribute("aria-current", "false");
      });
      document.querySelectorAll("[data-contact-menu]").forEach((item) => {
        const selected = item === button;
        item.classList.toggle("is-active", selected);
        item.setAttribute("aria-current", selected ? "page" : "false");
      });
    });
  });

  navHub?.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => setNavHubOpen(false));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && navHubToggle?.getAttribute("aria-expanded") === "true") {
      setNavHubOpen(false);
      navHubToggle.focus();
    }
  });

  document.querySelectorAll("[data-global-character-entry]").forEach((button) => {
    button.addEventListener("click", () => {
      setNavHubOpen(false);
      setPanel("companion");
      document.querySelector('[data-companion-tab="character"]')?.click();
    });
  });

  setPanel("chat");

  document.querySelectorAll("[data-drawer-open]").forEach((button) => {
    button.addEventListener("click", () => {
      drawer.classList.add("is-open");
      drawer.setAttribute("aria-hidden", "false");
      refreshIcons();
    });
  });

  document.querySelectorAll("[data-drawer-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      const panel = button.dataset.drawerNav;
      closeDrawer();
      if (panel === "explore" && typeof onExplore === "function") {
        onExplore();
      } else if (panel) {
        setPanel(panel);
        if (button.hasAttribute("data-nav-diary")) {
          document.querySelector('[data-companion-tab="memory"]')?.click();
        }
      }
      refreshIcons();
    });
  });

  document.querySelectorAll("[data-ui-mode-switch]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.uiModeSwitch === "phone" ? "phone" : "app";
      closeDrawer();
      setNavHubOpen(false);
      window.dispatchEvent(new CustomEvent("yueqi.ui.switch-mode", { detail: { mode } }));
    });
  });

  document.querySelectorAll("[data-drawer-close], .drawer-backdrop").forEach((button) => {
    button.addEventListener("click", () => {
      closeDrawer();
    });
  });
}
