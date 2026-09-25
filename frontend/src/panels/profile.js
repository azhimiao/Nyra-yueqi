/**
 * Profile / settings panel: identity, provider, voice, worldbook, RAG, palace browse, MCP.
 */
export function wireProfilePanel(deps) {
  const {
    sleepAtInput,
    wakeAtInput,
    locationInput,
    weatherModeSelect,
    manualWeatherInput,
    statusInjectionToggle,
    providerKind,
    providerBaseUrl,
    providerApiKey,
    providerModel,
    providerNodes,
    dndStartInput,
    dndEndInput,
    ragTopKInput,
    ragScopeSelect,
    ragDiaryStyleSelect,
    anniversaryDateInput,
    syncStrategySelect,
    promptSystemInput,
    promptDeveloperInput,
    promptBudgetSelect,
    promptOrderSelect,
    memorySearchInput,
    palaceRecallMode,
    palaceEnabledToggle,
    syncMemoryMasterToggle,
    palaceBrowseBack,
    palaceMap,
    palaceBrowseRef,
    tokenAddButton,
    tokenInput,
    tokenList,
    worldEntryList,
    addWorldEntryButton,
    resetProfileButton,
    compilePromptButton,
    promptPreview,
    testApiButton,
    apiResult,
    testVoiceButton,
    testVoiceRecordButton,
    testVoiceSttButton,
    voiceTestSample,
    voiceNodes,
    lastVoiceTestBlobRef,
    devSearchButton,
    devQueryInput,
    searchResult,
    syncMcpButton,
    persistProfileState,
    persistCharacterIdentityDraft,
    saveCharacterEditor,
    discardCharacterEditor,
    setCharacterEditorMode,
    syncRoleNameChrome,
    collectCharacterProfile,
    toggleManualWeatherField,
    refreshDailyStatus,
    persistProviderConfig,
    applyProviderPreset,
    persistLibraryState,
    rescheduleProactiveScheduler,
    saveRagSettings,
    applyRagSettingsToUi,
    renderMemoryState,
    saveSyncPreferences,
    applySyncSettingsToUi,
    renderEcosystemState,
    savePromptSettings,
    applyPromptSettingsToUi,
    savePalaceSettings,
    renderPalacePanel,
    resetPalaceBrowse,
    setMemorySearchQuery,
    addToken,
    persistWorldbookEntries,
    createWorldEntry,
    setWorldEntryOpen,
    refreshIcons,
    resetProfile,
    compilePrompt,
    formatCompiledPreview,
    renderProviderStatus,
    collectProviderConfig,
    callModel,
    persistVoiceConfig,
    renderVoiceStatus,
    synthesizeSpeech,
    collectVoiceConfig,
    playSpeech,
    runVoiceRecordTest,
    transcribeAudio,
    readGrantsFromDom,
    applyGrantsToDom,
    refreshPermissionUi,
    scheduleCapabilityRefresh,
    wirePermissionUi,
    buildPermissionRequestHandlers,
    releaseChannel,
    getEcosystemState,
    collectExternalGrants,
    safeFetch,
    searchPalace,
    memorySourceLabel,
    formatMemoryDate,
    removeEditableItem,
  } = deps;

  document.querySelectorAll("[data-range-value]").forEach((range) => {
    const output = range.parentElement.querySelector("em");
    range.addEventListener("input", () => {
      output.textContent = range.max === "200" ? (Number(range.value) / 100).toFixed(2) : range.value;
      persistProfileState();
    });
  });

  [sleepAtInput, wakeAtInput, locationInput, weatherModeSelect, manualWeatherInput, statusInjectionToggle].forEach((control) => {
    control?.addEventListener("change", () => {
      persistProfileState();
      if (control === weatherModeSelect) toggleManualWeatherField(weatherModeSelect.value);
      refreshDailyStatus(true);
    });
    control?.addEventListener("input", () => {
      if (control.type === "text") {
        persistProfileState();
        refreshDailyStatus(true);
      }
    });
  });

  [providerKind, providerBaseUrl, providerApiKey, providerModel].forEach((control) => {
    control?.addEventListener("input", persistProviderConfig);
    control?.addEventListener("change", persistProviderConfig);
  });

  providerKind?.addEventListener("change", () => {
    applyProviderPreset(providerKind.value, providerNodes);
    persistProviderConfig();
  });

  [dndStartInput, dndEndInput].forEach((field) => {
    field?.addEventListener("change", () => {
      persistLibraryState();
      rescheduleProactiveScheduler();
    });
  });

  ragTopKInput?.addEventListener("change", () => {
    saveRagSettings({ topK: Number(ragTopKInput.value) || 4 });
    renderMemoryState();
  });

  ragScopeSelect?.addEventListener("change", () => {
    saveRagSettings({ scope: ragScopeSelect.value });
    applyRagSettingsToUi();
    renderMemoryState();
  });

  ragDiaryStyleSelect?.addEventListener("change", () => {
    saveRagSettings({ diaryStyle: ragDiaryStyleSelect.value });
    renderMemoryState();
  });

  anniversaryDateInput?.addEventListener("change", () => {
    persistProfileState();
    renderMemoryState();
    rescheduleProactiveScheduler();
  });

  syncStrategySelect?.addEventListener("change", () => {
    saveSyncPreferences({ strategy: syncStrategySelect.value });
    applySyncSettingsToUi();
    renderEcosystemState();
  });

  [promptSystemInput, promptDeveloperInput].forEach((node) => {
    node?.addEventListener("input", () => {
      persistCharacterIdentityDraft?.();
    });
  });
  promptBudgetSelect?.addEventListener("change", () => {
    savePromptSettings({ budget: Number(promptBudgetSelect.value) || 1800 });
    applyPromptSettingsToUi();
  });
  promptOrderSelect?.addEventListener("change", () => {
    savePromptSettings({ order: promptOrderSelect.value.split(",").map((item) => item.trim()).filter(Boolean) });
    applyPromptSettingsToUi();
  });

  memorySearchInput?.addEventListener("input", () => {
    setMemorySearchQuery(memorySearchInput.value);
    renderMemoryState();
  });

  palaceRecallMode?.addEventListener("change", () => {
    savePalaceSettings({ recallMode: palaceRecallMode.value });
    renderMemoryState();
  });

  palaceEnabledToggle?.addEventListener("change", () => {
    savePalaceSettings({ enabled: palaceEnabledToggle.checked });
    syncMemoryMasterToggle?.();
  });

  palaceBrowseBack?.addEventListener("click", () => {
    if (palaceBrowseRef.room) {
      palaceBrowseRef.room = "";
    } else {
      resetPalaceBrowse();
    }
    renderPalacePanel();
  });

  palaceMap?.addEventListener("click", (event) => {
    const wingButton = event.target.closest("[data-palace-wing]");
    const roomButton = event.target.closest("[data-palace-room]");
    if (wingButton) {
      palaceBrowseRef.wing = wingButton.dataset.palaceWing;
      palaceBrowseRef.room = "";
      renderPalacePanel();
      return;
    }
    if (roomButton && palaceBrowseRef.wing) {
      palaceBrowseRef.room = roomButton.dataset.palaceRoom;
      renderPalacePanel();
    }
  });

  tokenAddButton?.addEventListener("click", () => addToken(tokenInput.value));

  tokenInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addToken(tokenInput.value);
  });

  tokenList?.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    button.remove();
    persistProfileState();
  });

  document.querySelectorAll(".identity-editor .edit-field input, .identity-editor .edit-field textarea, .identity-editor .edit-field select, [data-character-gender], [data-character-pronouns], [data-character-boundaries]").forEach((field) => {
    field.addEventListener("input", () => {
      void Promise.resolve(persistCharacterIdentityDraft?.()).then((state) => {
        const working = state?.working;
        syncRoleNameChrome(working?.name || collectCharacterProfile().name);
      });
    });
    field.addEventListener("change", () => {
      void Promise.resolve(persistCharacterIdentityDraft?.()).then((state) => {
        const working = state?.working;
        syncRoleNameChrome(working?.name || collectCharacterProfile().name);
      });
    });
  });

  document.querySelectorAll("[data-character-save]").forEach((button) => {
    button.addEventListener("click", () => {
      void Promise.resolve(saveCharacterEditor?.()).catch((error) => {
        window.alert?.(error?.message || String(error || ""));
      });
    });
  });

  document.querySelectorAll("[data-character-discard]").forEach((button) => {
    button.addEventListener("click", () => {
      void Promise.resolve(discardCharacterEditor?.()).then((state) => {
        syncRoleNameChrome(state?.working?.name || collectCharacterProfile().name);
      });
    });
  });

  document.querySelectorAll("[data-editor-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      setCharacterEditorMode?.(button.dataset.editorMode);
    });
  });

  worldEntryList?.addEventListener("input", () => persistWorldbookEntries());
  worldEntryList?.addEventListener("change", () => persistWorldbookEntries());

  addWorldEntryButton?.addEventListener("click", async () => {
    if (!worldEntryList) return;
    const entry = createWorldEntry({}, { open: true });
    worldEntryList.prepend(entry);
    entry.querySelector("[data-world-title]")?.focus();
    await persistWorldbookEntries();
    refreshIcons();
  });

  worldEntryList?.addEventListener("click", async (event) => {
    const fold = event.target.closest("[data-world-fold]");
    if (fold && worldEntryList.contains(fold)) {
      const entry = fold.closest(".world-entry");
      if (entry) setWorldEntryOpen(entry, !entry.classList.contains("is-open"));
      return;
    }
    const button = event.target.closest("[data-remove-entry]");
    if (!button) return;
    removeEditableItem(button, ".world-entry");
    window.setTimeout(() => persistWorldbookEntries(), 220);
  });

  resetProfileButton?.addEventListener("click", resetProfile);

  compilePromptButton?.addEventListener("click", async () => {
    if (!promptPreview) return;
    const compiled = await compilePrompt("今晚下雨，我有点睡不着");
    const text = formatCompiledPreview(compiled);
    promptPreview.textContent = text;
    promptPreview.hidden = !String(text || "").trim();
  });

  testApiButton?.addEventListener("click", async () => {
    if (!apiResult) return;
    persistProviderConfig();
    renderProviderStatus({ status: "testing" });
    const startedAt = performance.now();
    try {
      const config = collectProviderConfig();
      const result = await callModel(
        config,
        [
          { role: "system", content: "你是月栖 Companion 的接口连通性测试。只回复 OK。" },
          { role: "user", content: "测试模型接口是否可用。" },
        ],
        {
          temperature: 0,
          stream: false,
          businessPurpose: "diagnostics.model_connection",
          capability: "chat",
        }
      );
      renderProviderStatus({
        status: "ok",
        latencyMs: Math.round(result.latencyMs || performance.now() - startedAt),
      });
    } catch (error) {
      renderProviderStatus({ status: "error", error: error.message });
    }
  });

  testVoiceButton?.addEventListener("click", async () => {
    persistVoiceConfig();
    renderVoiceStatus({ status: "testing" });
    try {
      const sample = voiceTestSample?.value.trim() || "我在。你可以直接说今天发生了什么。";
      const blob = await synthesizeSpeech(sample, collectVoiceConfig(voiceNodes));
      await playSpeech(blob);
      renderVoiceStatus({ status: "ok" });
    } catch (error) {
      renderVoiceStatus({ status: "error", error: error.message });
    }
  });

  testVoiceRecordButton?.addEventListener("click", () => runVoiceRecordTest(3000));

  testVoiceSttButton?.addEventListener("click", async () => {
    if (!lastVoiceTestBlobRef.current) return;
    persistVoiceConfig();
    renderVoiceStatus({ status: "transcribing" });
    try {
      const { text } = await transcribeAudio(lastVoiceTestBlobRef.current, collectVoiceConfig(voiceNodes));
      renderVoiceStatus({ status: "ok", error: `转写：${text}` });
    } catch (error) {
      renderVoiceStatus({ status: "error", error: error.message });
    }
  });

  Object.values(voiceNodes).forEach((node) => {
    node?.addEventListener("change", () => persistVoiceConfig());
    node?.addEventListener("blur", () => persistVoiceConfig());
  });

  devSearchButton?.addEventListener("click", async () => {
    if (!devQueryInput || !searchResult) return;
    const query = devQueryInput.value.trim();
    const companionId = String(collectCharacterProfile?.()?.id || "").trim();
    const { results: hits } = await searchPalace(query, {
      topK: 5,
      force: true,
      companionId,
      characterId: companionId,
    });
    searchResult.textContent = `搜索：${query || "空"}
结果：
${hits.map((hit, index) => `${index + 1}. ${memorySourceLabel(hit.source)} · ${formatMemoryDate(hit.createdAt)}
   ${String(hit.rawText || "").slice(0, 58)}`).join("\n") || "暂无匹配"}`;
  });

  syncMcpButton?.addEventListener("click", async () => {
    const grants = readGrantsFromDom();
    applyGrantsToDom(grants);
    persistLibraryState();
    rescheduleProactiveScheduler();
    await refreshPermissionUi();
    scheduleCapabilityRefresh();
    refreshIcons();
  });

  wirePermissionUi({
    buildRequestHandlers: buildPermissionRequestHandlers,
    onContextChange: () => {
      persistLibraryState();
      rescheduleProactiveScheduler();
      scheduleCapabilityRefresh();
      safeFetch(`${releaseChannel.serviceBase}/external/grant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getEcosystemState().token || ""}`,
        },
        body: JSON.stringify(collectExternalGrants()),
      }).catch(() => {});
    },
  });
}
