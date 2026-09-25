export function wirePageSections({
  tabRoot,
  sectionRoot = document,
  tabName,
  sectionName,
  defaultTab,
  onChange,
}) {
  if (!tabRoot) return () => {};
  const tabAttr = `data-${tabName}`;
  const sectionAttr = `data-${sectionName}`;
  let activeTab = defaultTab;

  tabRoot.setAttribute("role", "tablist");

  function getButtons() {
    return Array.from(tabRoot.querySelectorAll(`[${tabAttr}]`));
  }

  function prepareSemantics() {
    getButtons().forEach((button, index) => {
      const tabId = button.getAttribute(tabAttr) || `tab-${index + 1}`;
      const panel = sectionRoot.querySelector(`[${sectionAttr}="${tabId}"]`);
      button.id ||= `${tabName}-${tabId}-tab`;
      button.setAttribute("role", "tab");
      if (panel) {
        panel.id ||= `${sectionName}-${tabId}-panel`;
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", button.id);
        button.setAttribute("aria-controls", panel.id);
      }
    });
  }

  function setTab(tabId) {
    const buttons = getButtons();
    const first = buttons[0]?.getAttribute(tabAttr);
    activeTab = tabId || first;
    buttons.forEach((button) => {
      const selected = button.getAttribute(tabAttr) === activeTab;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    sectionRoot.querySelectorAll(`[${sectionAttr}]`).forEach((section) => {
      const selected = section.getAttribute(sectionAttr) === activeTab;
      section.classList.toggle("is-active", selected);
      section.setAttribute("aria-hidden", String(!selected));
    });
    onChange?.(activeTab);
    return activeTab;
  }

  tabRoot.addEventListener("click", (event) => {
    const button = event.target.closest(`[${tabAttr}]`);
    if (!button) return;
    setTab(button.getAttribute(tabAttr));
  });

  tabRoot.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const buttons = getButtons();
    const current = buttons.indexOf(document.activeElement);
    if (current < 0 || buttons.length < 2) return;
    event.preventDefault();
    const next = event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : (current + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    const nextButton = buttons[next];
    setTab(nextButton.getAttribute(tabAttr));
    nextButton.focus();
  });

  prepareSemantics();
  setTab(defaultTab);
  return setTab;
}
