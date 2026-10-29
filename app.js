"use strict";

(function createMintMapStateApi(global) {
  const STORAGE_KEY = "mintmap.state.v1";
  const SCHEMA_VERSION = 1;
  const TRANSACTION_TYPES = new Set(["income", "expense"]);
  const INITIAL_CATEGORIES = [
    { id: "food", name: "Food", types: ["expense"] },
    { id: "transport", name: "Transport", types: ["expense"] },
    { id: "housing", name: "Housing", types: ["expense"] },
    { id: "utilities", name: "Utilities", types: ["expense"] },
    { id: "health", name: "Health", types: ["expense"] },
    { id: "entertainment", name: "Entertainment", types: ["expense"] },
    { id: "salary", name: "Salary", types: ["income"] },
    { id: "other", name: "Other", types: ["income", "expense"] }
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createInitialState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      transactions: [],
      categories: clone(INITIAL_CATEGORIES)
    };
  }

  function result(valid, errors = []) {
    return { valid, errors };
  }

  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function isValidId(value) {
    return typeof value === "string" && value.trim().length > 0;
  }

  function normalizedName(value) {
    return typeof value === "string" ? value.trim().toLocaleLowerCase() : "";
  }

  function normalizedCategoryTypes(category) {
    if (Array.isArray(category?.types) && category.types.length > 0) {
      return [...new Set(category.types)];
    }
    if (category?.id === "salary") {
      return ["income"];
    }
    if (category?.id === "other") {
      return ["income", "expense"];
    }
    return ["expense"];
  }

  function isValidDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }

    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
      && date.getUTCMonth() === month - 1
      && date.getUTCDate() === day;
  }

  function validateCategory(category, categories = []) {
    const errors = [];

    if (!isPlainObject(category)) {
      return result(false, ["Category must be an object."]);
    }

    if (!isValidId(category.id)) {
      errors.push("Category id is required.");
    }

    if (typeof category.name !== "string" || category.name.trim().length === 0) {
      errors.push("Category name is required.");
    }
    if (category.types !== undefined
      && (!Array.isArray(category.types)
        || category.types.length === 0
        || category.types.some((type) => !TRANSACTION_TYPES.has(type)))) {
      errors.push("Category type must include income, expense, or both.");
    }

    const duplicateId = categories.some((item) => item !== category && item.id === category.id);
    if (duplicateId) {
      errors.push("Category id must be unique.");
    }

    const categoryName = normalizedName(category.name);
    const duplicateName = categories.some(
      (item) => item !== category && normalizedName(item.name) === categoryName
    );
    if (categoryName && duplicateName) {
      errors.push("Category name must be unique.");
    }

    return result(errors.length === 0, errors);
  }

  function validateTransaction(transaction, state) {
    const errors = [];
    const categories = state && Array.isArray(state.categories) ? state.categories : [];

    if (!isPlainObject(transaction)) {
      return result(false, ["Transaction must be an object."]);
    }

    if (!isValidId(transaction.id)) {
      errors.push("Transaction id is required.");
    }
    if (typeof transaction.type !== "string" || !TRANSACTION_TYPES.has(transaction.type)) {
      errors.push("Transaction type must be income or expense.");
    }
    if (typeof transaction.amount !== "number" || !Number.isFinite(transaction.amount) || transaction.amount <= 0) {
      errors.push("Transaction amount must be a finite number greater than zero.");
    }
    if (!isValidDate(transaction.date)) {
      errors.push("Transaction date must be a valid calendar date in YYYY-MM-DD format.");
    }
    if (transaction.description !== undefined && typeof transaction.description !== "string") {
      errors.push("Transaction description must be a string when provided.");
    }
    if (typeof transaction.categoryId !== "string" || !categories.some((category) => category.id === transaction.categoryId)) {
      errors.push("Transaction category must reference an existing category.");
    }
    if (transaction.notes !== undefined && typeof transaction.notes !== "string") {
      errors.push("Transaction notes must be a string when provided.");
    }
    if (transaction.isSample !== undefined && typeof transaction.isSample !== "boolean") {
      errors.push("Sample-data marker must be boolean when provided.");
    }

    return result(errors.length === 0, errors);
  }

  function validateState(state) {
    const errors = [];

    if (!isPlainObject(state)) {
      return result(false, ["Stored state must be an object."]);
    }
    if (state.schemaVersion !== SCHEMA_VERSION) {
      errors.push("Stored state has an unsupported schema version.");
    }
    if (!Array.isArray(state.categories)) {
      errors.push("Stored categories must be an array.");
    }
    if (!Array.isArray(state.transactions)) {
      errors.push("Stored transactions must be an array.");
    }

    if (errors.length > 0) {
      return result(false, errors);
    }

    const categoryIds = new Set();
    const categoryNames = new Set();
    state.categories.forEach((category) => {
      const validation = validateCategory(category);
      errors.push(...validation.errors);

      if (isValidId(category.id)) {
        if (categoryIds.has(category.id)) {
          errors.push("Category ids must be unique.");
        }
        categoryIds.add(category.id);
      }

      const name = normalizedName(category.name);
      if (name) {
        if (categoryNames.has(name)) {
          errors.push("Category names must be unique.");
        }
        categoryNames.add(name);
      }
    });

    const transactionIds = new Set();
    state.transactions.forEach((transaction) => {
      const validation = validateTransaction(transaction, state);
      errors.push(...validation.errors);

      if (isValidId(transaction.id)) {
        if (transactionIds.has(transaction.id)) {
          errors.push("Transaction ids must be unique.");
        }
        transactionIds.add(transaction.id);
      }
    });

    return result(errors.length === 0, errors);
  }

  function addCategory(state, category) {
    const nextState = clone(state);
    if (!validateState(nextState).valid) {
      return { ok: false, state, errors: ["Cannot add a category to an invalid state."] };
    }

    const validation = validateCategory(category, nextState.categories);
    if (!validation.valid) {
      return { ok: false, state, errors: validation.errors };
    }

    nextState.categories.push({
      ...clone(category),
      types: normalizedCategoryTypes(category)
    });
    return { ok: true, state: nextState, errors: [] };
  }

  function updateCategory(state, categoryId, name, types) {
    const nextState = clone(state);
    if (!validateState(nextState).valid) {
      return { ok: false, state, errors: ["Cannot update a category in an invalid state."] };
    }

    const category = nextState.categories.find((item) => item.id === categoryId);
    if (!category) {
      return { ok: false, state, errors: ["Category could not be found."] };
    }

    const replacement = { ...category, name, types: types || category.types };
    const otherCategories = nextState.categories.filter((item) => item.id !== categoryId);
    const validation = validateCategory(replacement, otherCategories);
    if (!validation.valid) {
      return { ok: false, state, errors: validation.errors };
    }

    category.name = name.trim();
    category.types = normalizedCategoryTypes(replacement);
    return { ok: true, state: nextState, errors: [] };
  }

  function deleteCategory(state, categoryId) {
    const nextState = clone(state);
    if (!validateState(nextState).valid) {
      return { ok: false, state, errors: ["Cannot delete a category from an invalid state."] };
    }
    if (nextState.transactions.some((transaction) => transaction.categoryId === categoryId)) {
      return { ok: false, state, errors: ["This category is used by a transaction and cannot be deleted."] };
    }
    if (!nextState.categories.some((category) => category.id === categoryId)) {
      return { ok: false, state, errors: ["Category could not be found."] };
    }
    if (nextState.categories.length <= 1) {
      return { ok: false, state, errors: ["At least one category must remain."] };
    }

    nextState.categories = nextState.categories.filter((category) => category.id !== categoryId);
    return { ok: true, state: nextState, errors: [] };
  }

  function aggregateExpensesByCategory(state) {
    const totals = new Map();
    if (!isPlainObject(state) || !Array.isArray(state.transactions) || !Array.isArray(state.categories)) {
      return [];
    }

    state.transactions.forEach((transaction) => {
      if (transaction.type !== "expense" || !Number.isFinite(transaction.amount)) {
        return;
      }
      const current = totals.get(transaction.categoryId) || 0;
      totals.set(transaction.categoryId, Math.round((current + transaction.amount) * 100) / 100);
    });

    return [...totals.entries()]
      .map(([categoryId, amount]) => ({
        categoryId,
        categoryName: state.categories.find((category) => category.id === categoryId)?.name || "Unknown category",
        amount
      }))
      .sort((left, right) => right.amount - left.amount);
  }

  function addTransaction(state, transaction) {
    const nextState = clone(state);
    if (!validateState(nextState).valid) {
      return { ok: false, state, errors: ["Cannot add a transaction to an invalid state."] };
    }

    const duplicateId = nextState.transactions.some((item) => item.id === transaction.id);
    const validation = validateTransaction(transaction, nextState);
    if (duplicateId) {
      validation.errors.push("Transaction id must be unique.");
    }
    if (!validation.valid || duplicateId) {
      return { ok: false, state, errors: validation.errors };
    }

    nextState.transactions.push(clone(transaction));
    return { ok: true, state: nextState, errors: [] };
  }

  function updateTransaction(state, transactionId, transaction) {
    const nextState = clone(state);
    if (!validateState(nextState).valid) {
      return { ok: false, state, errors: ["Cannot update a transaction in an invalid state."] };
    }

    const index = nextState.transactions.findIndex((item) => item.id === transactionId);
    if (index === -1) {
      return { ok: false, state, errors: ["Transaction could not be found."] };
    }

    const replacement = { ...transaction, id: transactionId };
    const validation = validateTransaction(replacement, nextState);
    if (!validation.valid) {
      return { ok: false, state, errors: validation.errors };
    }

    nextState.transactions[index] = clone(replacement);
    return { ok: true, state: nextState, errors: [] };
  }

  function deleteTransaction(state, transactionId) {
    const nextState = clone(state);
    if (!validateState(nextState).valid) {
      return { ok: false, state, errors: ["Cannot delete a transaction from an invalid state."] };
    }

    const transactionExists = nextState.transactions.some((item) => item.id === transactionId);
    if (!transactionExists) {
      return { ok: false, state, errors: ["Transaction could not be found."] };
    }

    nextState.transactions = nextState.transactions.filter((item) => item.id !== transactionId);
    return { ok: true, state: nextState, errors: [] };
  }

  function getStorage(storage) {
    if (storage) {
      return storage;
    }
    if (!global) {
      return null;
    }
    try {
      return global.localStorage || null;
    } catch {
      return null;
    }
  }

  function saveState(state, storage) {
    const validation = validateState(state);
    if (!validation.valid) {
      return {
        ok: false,
        error: {
          code: "INVALID_STATE",
          message: "State was not saved because it failed validation.",
          details: validation.errors
        }
      };
    }

    const target = getStorage(storage);
    if (!target) {
      return {
        ok: false,
        error: {
          code: "STORAGE_UNAVAILABLE",
          message: "LocalStorage is unavailable; state was not saved.",
          details: []
        }
      };
    }

    try {
      target.setItem(STORAGE_KEY, JSON.stringify(state));
      return { ok: true, error: null };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "STORAGE_WRITE_FAILED",
          message: "LocalStorage could not save the state; changes were not persisted.",
          details: [error instanceof Error ? error.message : "Unknown storage error."]
        }
      };
    }
  }

  function loadState(storage) {
    const target = getStorage(storage);
    if (!target) {
      return {
        ok: false,
        state: null,
        source: "unavailable",
        error: {
          code: "STORAGE_UNAVAILABLE",
          message: "LocalStorage is unavailable; the account state could not be loaded.",
          details: []
        }
      };
    }

    let serialized;
    try {
      serialized = target.getItem(STORAGE_KEY);
    } catch (error) {
      return {
        ok: false,
        state: null,
        source: "unavailable",
        error: {
          code: "STORAGE_READ_FAILED",
          message: "LocalStorage could not be read.",
          details: [error instanceof Error ? error.message : "Unknown storage error."]
        }
      };
    }

    if (serialized === null) {
      return { ok: true, state: createInitialState(), source: "initial", error: null };
    }

    let parsed;
    try {
      parsed = JSON.parse(serialized);
    } catch (error) {
      return {
        ok: false,
        state: null,
        source: "malformed",
        error: {
          code: "STORAGE_MALFORMED",
          message: "Saved financial data is malformed and was not trusted.",
          details: [error instanceof Error ? error.message : "Invalid JSON."]
        }
      };
    }

    const validation = validateState(parsed);
    if (!validation.valid) {
      return {
        ok: false,
        state: null,
        source: "invalid",
        error: {
          code: "STORAGE_INVALID",
          message: "Saved financial data is incompatible and was not trusted.",
          details: validation.errors
        }
      };
    }

    const normalizedState = clone(parsed);
    normalizedState.categories = normalizedState.categories.map((category) => ({
      ...category,
      types: normalizedCategoryTypes(category)
    }));
    return { ok: true, state: normalizedState, source: "stored", error: null };
  }

  global.MintMapState = Object.freeze({
    STORAGE_KEY,
    SCHEMA_VERSION,
    TRANSACTION_TYPES: Object.freeze([...TRANSACTION_TYPES]),
    createInitialState,
    validateCategory,
    validateTransaction,
    validateState,
    addCategory,
    updateCategory,
    deleteCategory,
    aggregateExpensesByCategory,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    saveState,
    loadState,
    readState: loadState
  });
}(window));

(function connectMintMapToDocument(global, document) {
  if (!document || !global.MintMapState) {
    return;
  }

  const currencyFormatter = new Intl.NumberFormat("en-ET", {
    style: "currency",
    currency: "ETB",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  let state = null;
  let realState = null;
  let demoMode = false;
  let editingTransactionId = null;
  let searchQuery = "";
  let categoryFilter = "";
  const THEME_STORAGE_KEY = "mintmap.theme";

  function get(selector) {
    return document.querySelector(selector);
  }

  function applyTheme(theme, persist = true) {
    const root = document.documentElement;
    const button = get("#theme-toggle");
    if (theme === "light" || theme === "dark") {
      root.dataset.theme = theme;
      if (persist) {
        try {
          localStorage.setItem(THEME_STORAGE_KEY, theme);
        } catch {
          setStatus("Theme changed for this session; browser storage is unavailable.", "error");
        }
      }
    } else {
      delete root.dataset.theme;
      if (persist) {
        try {
          localStorage.removeItem(THEME_STORAGE_KEY);
        } catch {
          setStatus("System theme restored for this session; browser storage is unavailable.", "error");
        }
      }
    }
    if (button) {
      const isLight = root.dataset.theme === "light"
        || (!root.dataset.theme && global.matchMedia("(prefers-color-scheme: light)").matches);
      button.setAttribute("aria-label", isLight ? "Switch to dark theme" : "Switch to light theme");
      button.setAttribute("aria-pressed", String(isLight));
      button.innerHTML = `<span aria-hidden="true">${isLight ? "☾" : "☼"}</span><span>${isLight ? "Dark mode" : "Light mode"}</span>`;
    }
  }

  let statusClearTimer = null;

  // Form-scoped messages (save, update, validation errors) go near the form.
  // Global messages (storage errors, demo mode, load status) go in the intro.
  function setStatus(message, type = "info", scope = "global") {
    const elementId = scope === "form" ? "#form-status" : "#app-status";
    const status = get(elementId);
    if (!status) {
      return;
    }

    if (statusClearTimer !== null) {
      clearTimeout(statusClearTimer);
      statusClearTimer = null;
    }

    status.textContent = message;
    status.dataset.status = type;

    // Auto-clear non-error messages after 5 seconds.
    if (type !== "error") {
      statusClearTimer = setTimeout(() => {
        if (status.dataset.status !== "error") {
          status.textContent = "";
          delete status.dataset.status;
        }
        statusClearTimer = null;
      }, 5000);
    }
  }

  function formatCurrency(amount) {
    return currencyFormatter.format(amount);
  }

  function categoryTypes(category) {
    if (Array.isArray(category.types) && category.types.length > 0) {
      return [...new Set(category.types)];
    }
    if (category.id === "salary") {
      return ["income"];
    }
    if (category.id === "other") {
      return ["income", "expense"];
    }
    return ["expense"];
  }

  function calculateTotals(transactions) {
    return transactions.reduce((totals, transaction) => {
      if (transaction.type === "income") {
        totals.income += transaction.amount;
      } else if (transaction.type === "expense") {
        totals.expenses += transaction.amount;
      }
      return totals;
    }, { income: 0, expenses: 0 });
  }

  function populateCategorySelect(select, categories, includePlaceholder) {
    if (!select) {
      return;
    }

    const selectedValue = select.value;
    select.replaceChildren();
    const firstOption = document.createElement("option");
    firstOption.value = "";
    firstOption.textContent = includePlaceholder ? "Select category" : "All categories";
    select.append(firstOption);

    const transactionType = get("#transaction-type")?.value;
    categories
      .filter((category) => includePlaceholder
        ? categoryTypes(category).includes(transactionType)
        : true)
      .forEach((category) => {
        const option = document.createElement("option");
        option.value = category.id;
        option.textContent = category.name;
        select.append(option);
      });

    if (categories
      .filter((category) => includePlaceholder
        ? categoryTypes(category).includes(transactionType)
        : true)
      .some((category) => category.id === selectedValue)) {
      select.value = selectedValue;
    }
  }

  function categoryName(categoryId) {
    return state.categories.find((category) => category.id === categoryId)?.name || "Unknown category";
  }

  function setFieldError(fieldId, message) {
    const field = get(`#${fieldId}`);
    if (!field) {
      return;
    }

    const errorId = `${fieldId}-error`;
    let error = get(`#${errorId}`);
    if (!error) {
      error = document.createElement("p");
      error.id = errorId;
      error.className = "field-error";
      error.setAttribute("role", "alert");
      field.closest(".field")?.append(error);
    }
    error.textContent = message;
    field.setAttribute("aria-invalid", "true");
    field.setAttribute("aria-describedby", errorId);
  }

  function clearFieldErrors() {
    document.querySelectorAll(".field-error").forEach((error) => error.remove());
    document.querySelectorAll("[aria-invalid]").forEach((field) => {
      field.removeAttribute("aria-invalid");
      field.removeAttribute("aria-describedby");
    });
  }

  function errorsForFields(errors) {
    const mapping = [
      ["amount", "transaction-amount"],
      ["date", "transaction-date"],
      ["category", "transaction-category"],
      ["description", "transaction-description"],
      ["notes", "transaction-notes"],
      ["type", "transaction-type"]
    ];
    const unmatched = [];
    errors.forEach((message) => {
      const match = mapping.find(([key]) => message.toLocaleLowerCase().includes(key));
      if (match) {
        setFieldError(match[1], message);
      } else {
        unmatched.push(message);
      }
    });
    return unmatched;
  }

  function renderSummary() {
    const totals = calculateTotals(state.transactions);
    const balance = totals.income - totals.expenses;
    get("#balance-value").textContent = formatCurrency(balance);
    get("#income-value").textContent = formatCurrency(totals.income);
    get("#expense-value").textContent = formatCurrency(totals.expenses);
    get("#balance-hint").textContent = state.transactions.length ? "Across all transactions" : "No transactions yet";
    get("#income-hint").textContent = totals.income ? "Across all income" : "No income recorded";
    get("#expense-hint").textContent = totals.expenses ? "Across all expenses" : "No expenses recorded";
    renderOverviewChart();
  }

  function renderOverviewChart() {
    const svg = get("#overview-pie-svg");
    const legend = get("#overview-chart-legend");
    const centerVal = get("#chart-center-val");
    const centerTxt = get("#chart-center-txt");
    const badge = get("#chart-savings-badge");
    const title = get("#overview-chart-title");
    const sub = get("#overview-chart-sub");
    if (!svg || !legend) return;

    svg.replaceChildren();
    legend.replaceChildren();

    if (title) title.textContent = "Financial Breakdown";
    if (sub) sub.textContent = "Total Balance, Income & Expenses";

    const totals = calculateTotals(state.transactions);
    const balance = totals.income - totals.expenses;
    const totalActivity = totals.income + totals.expenses;

    const radius = 62;
    const cx = 100;
    const cy = 100;
    const circumference = 2 * Math.PI * radius; // ~389.56

    if (totalActivity === 0) {
      if (badge) {
        badge.textContent = "0% Retained";
        badge.style.color = "";
        badge.style.borderColor = "";
      }
      if (centerVal) {
        centerVal.textContent = "0%";
        centerVal.style.color = "";
        centerVal.style.fontSize = "";
      }
      if (centerTxt) centerTxt.textContent = "Balance";

      const bgCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      bgCircle.setAttribute("cx", String(cx));
      bgCircle.setAttribute("cy", String(cy));
      bgCircle.setAttribute("r", String(radius));
      bgCircle.setAttribute("fill", "none");
      bgCircle.setAttribute("stroke", "var(--border)");
      bgCircle.setAttribute("stroke-width", "20");
      bgCircle.setAttribute("stroke-dasharray", "4 8");
      svg.append(bgCircle);

      const emptyNotice = document.createElement("p");
      emptyNotice.className = "card-hint";
      emptyNotice.style.margin = "0.5rem 0";
      emptyNotice.textContent = "Record income and expenses to view your financial distribution.";
      legend.append(emptyNotice);
      return;
    }

    let segments = [];
    if (totals.income > 0 && balance >= 0) {
      const savingsRate = Math.round((balance / totals.income) * 100);
      const expenseRate = 100 - savingsRate;
      if (badge) {
        badge.textContent = `${savingsRate}% Retained`;
        badge.style.color = "var(--mint)";
        badge.style.borderColor = "";
      }
      if (centerVal) {
        centerVal.textContent = `${savingsRate}%`;
        centerVal.style.color = "var(--mint)";
        centerVal.style.fontSize = "";
      }
      if (centerTxt) centerTxt.textContent = "Balance";

      segments = [
        { label: "Total Balance", amount: balance, pct: savingsRate, color: "var(--mint)" },
        { label: "Total Expenses", amount: totals.expenses, pct: expenseRate, color: "var(--danger)" }
      ];
    } else if (totals.income > 0 && balance < 0) {
      const deficit = Math.abs(balance);
      const deficitRate = Math.round((deficit / totals.expenses) * 100);
      const coveredRate = 100 - deficitRate;
      if (badge) {
        badge.textContent = "Deficit Alert";
        badge.style.color = "var(--danger)";
        badge.style.borderColor = "rgba(255, 123, 143, 0.4)";
      }
      if (centerVal) {
        centerVal.textContent = `-${deficitRate}%`;
        centerVal.style.color = "var(--danger)";
        centerVal.style.fontSize = "";
      }
      if (centerTxt) centerTxt.textContent = "Deficit";

      segments = [
        { label: "Covered by Income", amount: totals.income, pct: coveredRate, color: "var(--mint)" },
        { label: "Net Deficit", amount: deficit, pct: deficitRate, color: "var(--danger)" }
      ];
    } else {
      if (badge) {
        badge.textContent = "100% Outflow";
        badge.style.color = "var(--danger)";
        badge.style.borderColor = "rgba(255, 123, 143, 0.4)";
      }
      if (centerVal) {
        centerVal.textContent = "100%";
        centerVal.style.color = "var(--danger)";
        centerVal.style.fontSize = "";
      }
      if (centerTxt) centerTxt.textContent = "Expenses";

      segments = [
        { label: "Total Expenses", amount: totals.expenses, pct: 100, color: "var(--danger)" }
      ];
    }

    const bgCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    bgCircle.setAttribute("cx", String(cx));
    bgCircle.setAttribute("cy", String(cy));
    bgCircle.setAttribute("r", String(radius));
    bgCircle.setAttribute("fill", "none");
    bgCircle.setAttribute("stroke", "var(--surface-raised)");
    bgCircle.setAttribute("stroke-width", "20");
    svg.append(bgCircle);

    let currentOffset = 0;
    segments.forEach((seg) => {
      if (seg.pct <= 0) return;
      const strokeLength = (seg.pct / 100) * circumference;
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", String(cx));
      circle.setAttribute("cy", String(cy));
      circle.setAttribute("r", String(radius));
      circle.setAttribute("fill", "none");
      circle.setAttribute("stroke", seg.color);
      circle.setAttribute("stroke-width", "20");
      circle.setAttribute("stroke-dasharray", `${strokeLength} ${circumference - strokeLength}`);
      circle.setAttribute("stroke-dashoffset", String(-currentOffset));
      circle.setAttribute("class", "donut-slice");
      circle.setAttribute("aria-label", `${seg.label}: ${seg.pct}%`);

      circle.addEventListener("mouseenter", () => {
        if (centerVal) {
          centerVal.textContent = formatCurrency(seg.amount);
          centerVal.style.fontSize = "0.95rem";
        }
        if (centerTxt) centerTxt.textContent = seg.label;
      });
      circle.addEventListener("mouseleave", () => {
        if (centerVal) centerVal.style.fontSize = "";
        renderOverviewChart();
      });

      svg.append(circle);
      currentOffset += strokeLength;
    });

    // Integrated Legend for the 3 metrics: Total Balance, Income, Expenses
    const legendData = [
      { label: "Total Balance", amount: balance, color: "var(--mint)", pct: totals.income > 0 ? `${Math.round((balance / totals.income) * 100)}%` : "" },
      { label: "Total Income", amount: totals.income, color: "#18a66a", pct: "Inflows" },
      { label: "Total Expenses", amount: totals.expenses, color: "var(--danger)", pct: totals.income > 0 ? `${Math.round((totals.expenses / totals.income) * 100)}%` : "Outflows" }
    ];

    legendData.forEach((item) => {
      const row = document.createElement("div");
      row.className = "legend-item";
      row.innerHTML = `
        <div class="legend-item-left">
          <span class="legend-dot" style="background:${item.color};"></span>
          <span class="legend-label">${item.label}</span>
        </div>
        <div class="legend-item-right">
          <span class="legend-val">${formatCurrency(item.amount)}</span>
          ${item.pct ? `<span class="legend-pct">${item.pct}</span>` : ""}
        </div>
      `;
      row.addEventListener("mouseenter", () => {
        if (centerVal) {
          centerVal.textContent = formatCurrency(item.amount);
          centerVal.style.fontSize = "0.95rem";
        }
        if (centerTxt) centerTxt.textContent = item.label;
      });
      row.addEventListener("mouseleave", () => {
        if (centerVal) centerVal.style.fontSize = "";
        renderOverviewChart();
      });
      legend.append(row);
    });
  }

  function renderVisualization() {
    const visualization = get("#spending-visualization");
    const textSummary = get("#spending-text-summary");
    const emptyState = get("#visualization-empty-state");
    const groups = global.MintMapState.aggregateExpensesByCategory(state);
    const maximum = groups[0]?.amount || 0;

    visualization.replaceChildren();
    textSummary.replaceChildren();
    emptyState.hidden = groups.length > 0;
    visualization.hidden = groups.length === 0;
    textSummary.hidden = groups.length === 0;

    if (groups.length === 0) {
      return;
    }

    const summaryHeading = document.createElement("h3");
    summaryHeading.className = "sr-only";
    summaryHeading.textContent = "Spending breakdown";
    textSummary.append(summaryHeading);
    const summaryList = document.createElement("ul");
    summaryList.className = "spending-summary-list";

    groups.forEach((group) => {
      const row = document.createElement("div");
      row.className = "spending-row";
      const label = document.createElement("div");
      label.className = "spending-row-heading";
      const category = document.createElement("span");
      category.textContent = group.categoryName;
      const amount = document.createElement("span");
      amount.textContent = formatCurrency(group.amount);
      label.append(category, amount);
      const track = document.createElement("div");
      track.className = "spending-bar-track";
      const bar = document.createElement("div");
      bar.className = "spending-bar";
      bar.style.width = `${Math.max((group.amount / maximum) * 100, 4)}%`;
      bar.setAttribute("aria-hidden", "true");
      track.append(bar);
      row.append(label, track);
      visualization.append(row);

      const summaryItem = document.createElement("li");
      summaryItem.textContent = `${group.categoryName}: ${formatCurrency(group.amount)}`;
      summaryList.append(summaryItem);
    });

    textSummary.append(summaryList);
  }

  function renderTransactions() {
    const list = get("#transaction-list");
    const emptyState = get("#transaction-empty-state");
    const noResults = get("#transaction-no-results");
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
    const visibleTransactions = state.transactions.filter((transaction) => {
      const searchableText = `${transaction.description} ${transaction.notes || ""}`.toLocaleLowerCase();
      return (!normalizedQuery || searchableText.includes(normalizedQuery))
        && (!categoryFilter || transaction.categoryId === categoryFilter);
    });
    list.replaceChildren();
    emptyState.hidden = state.transactions.length > 0;
    noResults.hidden = state.transactions.length === 0 || visibleTransactions.length > 0;

    visibleTransactions.forEach((transaction) => {
      const item = document.createElement("article");
      item.className = "transaction-item";
      item.id = `tx-${transaction.id}`;

      const details = document.createElement("div");
      details.className = "transaction-details";
      const title = document.createElement("h3");
      title.textContent = transaction.description;
      const typeBadge = document.createElement("span");
      typeBadge.className = `transaction-type-badge ${transaction.type}`;
      typeBadge.textContent = transaction.type === "income" ? "Income" : "Expense";
      const metadata = document.createElement("p");
      metadata.textContent = `${transaction.date} · ${categoryName(transaction.categoryId)} · ${transaction.type}`;
      details.append(typeBadge, title, metadata);
      if (transaction.notes) {
        const notes = document.createElement("p");
        notes.className = "transaction-notes";
        notes.textContent = transaction.notes;
        details.append(notes);
      }
      if (transaction.isSample) {
        const sampleLabel = document.createElement("span");
        sampleLabel.className = "sample-label";
        sampleLabel.textContent = "Fictional sample";
        details.append(sampleLabel);
      }

      const amount = document.createElement("p");
      amount.className = `transaction-amount transaction-amount-${transaction.type}`;
      amount.textContent = `${transaction.type === "income" ? "+" : "-"}${formatCurrency(transaction.amount)}`;
      amount.setAttribute("aria-label", `${transaction.type} ${formatCurrency(transaction.amount)}`);

      const actions = document.createElement("div");
      actions.className = "transaction-actions";
      const editButton = document.createElement("button");
      editButton.className = "button button-secondary";
      editButton.type = "button";
      editButton.textContent = "Edit";
      editButton.setAttribute("aria-label", `Edit ${transaction.description}`);
      editButton.addEventListener("click", () => beginEdit(transaction.id));
      const deleteButton = document.createElement("button");
      deleteButton.className = "button button-secondary";
      deleteButton.type = "button";
      deleteButton.textContent = "Delete";
      deleteButton.setAttribute("aria-label", `Delete ${transaction.description}`);
      deleteButton.addEventListener("click", () => removeTransaction(transaction.id));
      actions.append(editButton, deleteButton);

      item.append(details, amount, actions);
      list.append(item);
    });

    const clearFilters = get("#clear-filters");
    clearFilters.hidden = !searchQuery && !categoryFilter;
  }

  function renderCategories() {
    const list = get("#category-list");
    get("#category-count").textContent = `${state.categories.length} categories`;
    list.replaceChildren();
    const groups = [
      { type: "expense", title: "Expense categories", description: "Where your money goes" },
      { type: "income", title: "Income categories", description: "Where your money comes from" }
    ];
    groups.forEach((group) => {
      const categories = state.categories.filter((category) => categoryTypes(category).includes(group.type));
      if (categories.length === 0) {
        return;
      }
      const groupWrapper = document.createElement("div");
      groupWrapper.className = "category-group";
      const heading = document.createElement("div");
      heading.className = "category-group-heading";
      const title = document.createElement("h3");
      title.textContent = group.title;
      const description = document.createElement("p");
      description.textContent = group.description;
      heading.append(title, description);
      groupWrapper.append(heading);
      const items = document.createElement("div");
      items.className = "category-group-items";
      categories.forEach((category) => {
        const item = document.createElement("div");
        item.className = "category-item";
        const name = document.createElement("span");
        name.textContent = category.name;
        const type = document.createElement("small");
        type.className = "category-type";
        type.textContent = categoryTypes(category).length === 2
          ? "Income and expenses"
          : categoryTypes(category)[0] === "income" ? "Income" : "Expenses";
        const actions = document.createElement("div");
        actions.className = "transaction-actions";
        const rename = document.createElement("button");
        rename.className = "button button-secondary";
        rename.type = "button";
        rename.textContent = "Rename";
        rename.setAttribute("aria-label", `Rename ${category.name}`);
        rename.addEventListener("click", () => renameCategory(category.id));
        const remove = document.createElement("button");
        remove.className = "button button-secondary";
        remove.type = "button";
        remove.textContent = "Delete";
        remove.setAttribute("aria-label", `Delete ${category.name}`);
        remove.addEventListener("click", () => removeCategory(category.id));
        actions.append(rename, remove);
        const label = document.createElement("div");
        label.append(name, type);
        item.append(label, actions);
        items.append(item);
      });
      groupWrapper.append(items);
      list.append(groupWrapper);
    });
  }

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);
  }

  function highlightMatch(text, query) {
    if (!query || !text) return escapeHtml(text || "");
    const escapedText = escapeHtml(text);
    const escapedQuery = escapeHtml(query);
    const regex = new RegExp(`(${escapedQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    return escapedText.replace(regex, "<mark>$1</mark>");
  }

  function jumpToTransaction(txId) {
    const headerDropdown = get("#header-search-dropdown");
    const mobileDropdown = get("#mobile-search-dropdown");
    const mobilePanel = get("#mobile-search-panel");
    if (headerDropdown) headerDropdown.hidden = true;
    if (mobileDropdown) mobileDropdown.hidden = true;
    if (mobilePanel) mobilePanel.hidden = true;

    const targetEl = document.getElementById(`tx-${txId}`);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
      targetEl.classList.remove("transaction-highlight");
      void targetEl.offsetWidth;
      targetEl.classList.add("transaction-highlight");
      setTimeout(() => {
        targetEl.classList.remove("transaction-highlight");
      }, 2500);
    } else {
      searchQuery = "";
      categoryFilter = "";
      get("#transaction-search").value = "";
      get("#filter-category").value = "";
      get("#header-search").value = "";
      renderTransactions();
      const retryEl = document.getElementById(`tx-${txId}`);
      if (retryEl) {
        retryEl.scrollIntoView({ behavior: "smooth", block: "center" });
        retryEl.classList.add("transaction-highlight");
        setTimeout(() => retryEl.classList.remove("transaction-highlight"), 2500);
      }
    }
  }

  function renderLiveSearch(query) {
    const headerDropdown = get("#header-search-dropdown");
    const headerResults = get("#header-search-results");
    const headerCount = get("#search-live-count");

    const mobileDropdown = get("#mobile-search-dropdown");
    const mobileResults = get("#mobile-search-live-results");
    const mobileCount = get("#mobile-search-live-count");

    const trimmed = (query || "").trim();
    if (!trimmed || !state) {
      if (headerDropdown) headerDropdown.hidden = true;
      if (mobileDropdown) mobileDropdown.hidden = true;
      return;
    }

    const norm = trimmed.toLocaleLowerCase();
    const matches = state.transactions.filter((tx) => {
      const cName = categoryName(tx.categoryId).toLocaleLowerCase();
      const desc = (tx.description || "").toLocaleLowerCase();
      const notes = (tx.notes || "").toLocaleLowerCase();
      const date = tx.date || "";
      const amt = String(tx.amount);
      return desc.includes(norm) || cName.includes(norm) || notes.includes(norm) || date.includes(norm) || amt.includes(norm);
    });

    const countText = `${matches.length} match${matches.length === 1 ? "" : "es"}`;
    if (headerCount) headerCount.textContent = countText;
    if (mobileCount) mobileCount.textContent = countText;

    function populateContainer(container) {
      if (!container) return;
      container.replaceChildren();

      if (matches.length === 0) {
        const empty = document.createElement("div");
        empty.className = "search-result-empty";
        empty.innerHTML = `No transactions match "<strong>${escapeHtml(trimmed)}</strong>"<br><small style="color:var(--muted);margin-top:0.3rem;display:block;">Try searching by category, amount, or date</small>`;
        container.append(empty);
        return;
      }

      const previewMatches = matches.slice(0, 8);
      previewMatches.forEach((tx) => {
        const item = document.createElement("div");
        item.className = "search-result-item";
        item.setAttribute("role", "button");
        item.setAttribute("tabindex", "0");
        item.innerHTML = `
          <div class="search-result-left">
            <span class="search-result-icon ${tx.type}" aria-hidden="true">${tx.type === "income" ? "↑" : "↓"}</span>
            <div class="search-result-info">
              <span class="search-result-title">${highlightMatch(tx.description, trimmed)}</span>
              <span class="search-result-meta">${tx.date} · ${categoryName(tx.categoryId)}</span>
            </div>
          </div>
          <div class="search-result-right">
            <span class="search-result-amount ${tx.type}">${tx.type === "income" ? "+" : "-"}${formatCurrency(tx.amount)}</span>
            <button type="button" class="search-result-action" title="Edit this transaction" aria-label="Edit ${escapeHtml(tx.description)}">✎</button>
          </div>
        `;

        item.addEventListener("click", (e) => {
          if (e.target.closest(".search-result-action")) return;
          jumpToTransaction(tx.id);
        });

        item.addEventListener("keydown", (e) => {
          if (e.key === "Enter") jumpToTransaction(tx.id);
        });

        const editBtn = item.querySelector(".search-result-action");
        if (editBtn) {
          editBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (headerDropdown) headerDropdown.hidden = true;
            if (mobileDropdown) mobileDropdown.hidden = true;
            beginEdit(tx.id);
            get("#transaction-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
          });
        }

        container.append(item);
      });

      if (matches.length > 8) {
        const moreNotice = document.createElement("div");
        moreNotice.className = "search-live-head";
        moreNotice.style.justifyContent = "center";
        moreNotice.innerHTML = `<span>+ ${matches.length - 8} more in list below</span>`;
        container.append(moreNotice);
      }
    }

    populateContainer(headerResults);
    populateContainer(mobileResults);

    if (headerDropdown) headerDropdown.hidden = false;
    if (mobileDropdown) mobileDropdown.hidden = false;
  }

  function render() {
    renderSummary();
    renderTransactions();
    renderCategories();
    renderVisualization();
    get("#sample-data-banner").hidden = !demoMode;
    get("#launch-demo").hidden = demoMode;
    get("#transaction-form-heading").textContent = demoMode ? "Try a transaction" : (editingTransactionId ? "Edit transaction" : "Add a transaction");
  }

  function readForm() {
    const rawDescription = get("#transaction-description").value.trim();
    const catId = get("#transaction-category").value;
    const categoryObj = state && Array.isArray(state.categories) ? state.categories.find((c) => c.id === catId) : null;
    const fallbackDesc = categoryObj ? categoryObj.name : (get("#transaction-type").value === "income" ? "Income" : "Expense");
    return {
      type: get("#transaction-type").value,
      amount: Number(get("#transaction-amount").value),
      categoryId: catId,
      date: get("#transaction-date").value,
      description: rawDescription || fallbackDesc,
      notes: get("#transaction-notes").value.trim()
    };
  }

  function persist(nextState) {
    if (demoMode) {
      state = nextState;
      global.MintMapApp.state = state;
      return true;
    }
    const saveResult = global.MintMapState.saveState(nextState);
    if (!saveResult.ok) {
      setStatus(saveResult.error.message, "error");
      return false;
    }
    state = nextState;
    realState = state;
    global.MintMapApp.state = state;
    return true;
  }

  function todayDate() {
    return new Date().toISOString().slice(0, 10);
  }

  function resetForm() {
    get("#transaction-form").reset();
    get("#transaction-date").value = todayDate();
    editingTransactionId = null;
    get("#transaction-form-heading").textContent = "Add a transaction";
    get("#transaction-submit").textContent = "Save transaction";
    get("#transaction-cancel").hidden = true;
    const panel = get(".transaction-panel");
    if (panel) panel.classList.remove("is-editing");
    clearFieldErrors();
  }

  function handleSubmit(event) {
    event.preventDefault();
    clearFieldErrors();
    const isEditing = Boolean(editingTransactionId);
    const formData = readForm();
    const candidateId = editingTransactionId || `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const candidate = { ...formData, id: candidateId };
    const operation = isEditing
      ? global.MintMapState.updateTransaction(state, editingTransactionId, candidate)
      : global.MintMapState.addTransaction(state, candidate);

    if (!operation.ok) {
      const unmatched = errorsForFields(operation.errors);
      setStatus(unmatched.join(" ") || "Please correct the highlighted fields.", "error", "form");
      return;
    }
    if (!persist(operation.state)) {
      return;
    }

    render();
    resetForm();
    setStatus(isEditing ? "Transaction updated." : "Transaction saved.", "info", "form");

    // Smoothly highlight and reveal the newly saved/updated transaction
    setTimeout(() => {
      const savedEl = document.getElementById(`tx-${candidate.id}`);
      if (savedEl) {
        savedEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
        savedEl.classList.remove("transaction-highlight");
        void savedEl.offsetWidth;
        savedEl.classList.add("transaction-highlight");
        setTimeout(() => savedEl.classList.remove("transaction-highlight"), 2500);
      }
    }, 60);
  }

  function beginEdit(transactionId) {
    const transaction = state.transactions.find((item) => item.id === transactionId);
    if (!transaction) {
      setStatus("The transaction could not be found.", "error");
      return;
    }

    editingTransactionId = transactionId;
    get("#transaction-type").value = transaction.type;
    populateCategorySelect(get("#transaction-category"), state.categories, true);
    get("#transaction-amount").value = transaction.amount;
    get("#transaction-category").value = transaction.categoryId;
    get("#transaction-date").value = transaction.date;
    get("#transaction-description").value = transaction.description;
    get("#transaction-notes").value = transaction.notes || "";
    get("#transaction-form-heading").textContent = "Edit transaction";
    get("#transaction-submit").textContent = "Save changes";
    get("#transaction-cancel").hidden = false;

    const panel = get(".transaction-panel");
    if (panel) {
      panel.classList.add("is-editing");
      panel.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    get("#transaction-amount").focus();
  }

  function removeTransaction(transactionId) {
    const transaction = state.transactions.find((item) => item.id === transactionId);
    if (!transaction || !global.confirm(`Delete "${transaction.description}"?`)) {
      return;
    }

    const itemEl = document.getElementById(`tx-${transactionId}`);
    if (itemEl) {
      itemEl.style.transition = "opacity 200ms ease, transform 200ms ease";
      itemEl.style.opacity = "0";
      itemEl.style.transform = "scale(0.96) translateY(-4px)";
    }

    setTimeout(() => {
      const operation = global.MintMapState.deleteTransaction(state, transactionId);
      if (!operation.ok) {
        setStatus(operation.errors.join(" "), "error");
        return;
      }
      if (!persist(operation.state)) {
        return;
      }

      if (editingTransactionId === transactionId) {
        resetForm();
      }
      render();
      setStatus("Transaction deleted.", "info", "form");
    }, 180);
  }

  function refreshCategoryControls() {
    populateCategorySelect(get("#transaction-category"), state.categories, true);
    populateCategorySelect(get("#filter-category"), state.categories, false);
  }

  function persistAndRender(nextState, message) {
    if (!persist(nextState)) {
      return false;
    }
    refreshCategoryControls();
    render();
    setStatus(message);
    return true;
  }

  function addOrRenameCategory(event) {
    event.preventDefault();
    const form = get("#category-form");
    const name = get("#category-name").value.trim();
    const editingId = form.dataset.editingId;
    const selectedType = get("#category-type").value;
    const types = selectedType === "both" ? ["income", "expense"] : [selectedType];
    const operation = editingId
      ? global.MintMapState.updateCategory(state, editingId, name, types)
      : global.MintMapState.addCategory(state, {
        id: `category-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        types
      });

    if (!operation.ok) {
      setStatus(operation.errors.join(" "), "error");
      return;
    }
    if (persistAndRender(operation.state, editingId ? "Category renamed." : "Category added.")) {
      form.reset();
      delete form.dataset.editingId;
      form.hidden = true;
    }
  }

  function renameCategory(categoryId) {
    const category = state.categories.find((item) => item.id === categoryId);
    if (!category) {
      setStatus("The category could not be found.", "error");
      return;
    }
    const form = get("#category-form");
    form.hidden = false;
    form.dataset.editingId = categoryId;
    get("#category-name").value = category.name;
    get("#category-type").value = categoryTypes(category).length === 2
      ? "both"
      : categoryTypes(category)[0];
    get("#category-name").focus();
  }

  function removeCategory(categoryId) {
    const category = state.categories.find((item) => item.id === categoryId);
    if (!category || !global.confirm(`Delete category "${category.name}"?`)) {
      return;
    }
    const operation = global.MintMapState.deleteCategory(state, categoryId);
    if (!operation.ok) {
      setStatus(operation.errors.join(" "), "error");
      return;
    }
    persistAndRender(operation.state, "Category deleted.");
  }

  function enterDemoMode() {
    if (demoMode) {
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const samples = [
      { id: `sample-${Date.now()}-1`, type: "income", amount: 12500, categoryId: "salary", date: today, description: "Monthly salary", notes: "Fictional sample data", isSample: true },
      { id: `sample-${Date.now()}-2`, type: "expense", amount: 850, categoryId: "food", date: today, description: "Weekly groceries", notes: "Fictional sample data", isSample: true },
      { id: `sample-${Date.now()}-3`, type: "expense", amount: 420, categoryId: "transport", date: today, description: "Transport pass", notes: "Fictional sample data", isSample: true }
    ];
    let nextState = global.MintMapState.createInitialState();
    for (const sample of samples) {
      const operation = global.MintMapState.addTransaction(nextState, sample);
      if (!operation.ok) {
        setStatus(operation.errors.join(" "), "error");
        return;
      }
      nextState = operation.state;
    }
    realState = state;
    state = nextState;
    demoMode = true;
    render();
    setStatus("Demo mode is active. These fictional records will not be saved.", "info");
  }

  function exitDemoMode() {
    if (!demoMode) {
      return;
    }
    state = realState;
    realState = null;
    demoMode = false;
    editingTransactionId = null;
    refreshCategoryControls();
    resetForm();
    render();
    setStatus(state.transactions.length ? "Your saved data is ready." : "Demo ended. Ready for your first transaction.");
  }

  function initialize() {
    const loadResult = global.MintMapState.loadState();
    global.MintMapApp = { state: loadResult.ok ? loadResult.state : null, loadResult };
    if (!loadResult.ok) {
      setStatus(loadResult.error.message, "error");
      return;
    }

    state = loadResult.state;
    realState = state;
    applyTheme(document.documentElement.dataset.theme || null, false);
    get("#transaction-date").value = todayDate();
    populateCategorySelect(get("#transaction-category"), state.categories, true);
    populateCategorySelect(get("#filter-category"), state.categories, false);
    get("#transaction-form").addEventListener("submit", handleSubmit);
    get("#transaction-cancel").addEventListener("click", resetForm);
    // Live Search bindings
    function syncAndSearch(val) {
      searchQuery = val;
      const hInput = get("#header-search");
      const mInput = get("#mobile-search-input");
      const tInput = get("#transaction-search");
      if (hInput && hInput.value !== val) hInput.value = val;
      if (mInput && mInput.value !== val) mInput.value = val;
      if (tInput && tInput.value !== val) tInput.value = val;
      renderTransactions();
      renderLiveSearch(val);
    }

    get("#transaction-search").addEventListener("input", (event) => {
      syncAndSearch(event.target.value);
    });
    get("#header-search").addEventListener("input", (event) => {
      syncAndSearch(event.target.value);
    });

    const mobileInput = get("#mobile-search-input");
    if (mobileInput) {
      mobileInput.addEventListener("input", (event) => {
        syncAndSearch(event.target.value);
      });
    }

    const mobileToggle = get("#mobile-search-toggle");
    const mobilePanel = get("#mobile-search-panel");
    const mobileClose = get("#mobile-search-close");
    if (mobileToggle && mobilePanel) {
      mobileToggle.addEventListener("click", () => {
        const isHidden = mobilePanel.hidden;
        mobilePanel.hidden = !isHidden;
        mobileToggle.setAttribute("aria-expanded", String(isHidden));
        if (isHidden && mobileInput) {
          mobileInput.focus();
          if (searchQuery) renderLiveSearch(searchQuery);
        }
      });
    }
    if (mobileClose && mobilePanel) {
      mobileClose.addEventListener("click", () => {
        mobilePanel.hidden = true;
        if (mobileToggle) mobileToggle.setAttribute("aria-expanded", "false");
      });
    }

    function clearAllSearch() {
      syncAndSearch("");
      const hDrop = get("#header-search-dropdown");
      const mDrop = get("#mobile-search-dropdown");
      if (hDrop) hDrop.hidden = true;
      if (mDrop) mDrop.hidden = true;
    }

    const clearBtn1 = get("#search-live-clear");
    const clearBtn2 = get("#mobile-search-live-clear");
    if (clearBtn1) clearBtn1.addEventListener("click", clearAllSearch);
    if (clearBtn2) clearBtn2.addEventListener("click", clearAllSearch);

    get("#filter-category").addEventListener("change", (event) => {
      categoryFilter = event.target.value;
      renderTransactions();
    });
    get("#clear-filters").addEventListener("click", () => {
      categoryFilter = "";
      get("#filter-category").value = "";
      clearAllSearch();
    });
    get("#empty-explore-demo").addEventListener("click", enterDemoMode);
    get("#launch-demo").addEventListener("click", enterDemoMode);
    get("#exit-demo").addEventListener("click", exitDemoMode);
    get("#empty-add-transaction").addEventListener("click", () => {
      get("#transaction-amount").focus();
    });
    get("#toggle-categories").addEventListener("click", () => {
      const button = get("#toggle-categories");
      const list = get("#category-list");
      const expanded = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!expanded));
      button.querySelector("span").textContent = expanded ? "Show Categories" : "Hide Categories";
      list.hidden = expanded;
    });
    get("#theme-toggle").addEventListener("click", () => {
      const current = document.documentElement.dataset.theme;
      const systemLight = global.matchMedia("(prefers-color-scheme: light)").matches;
      applyTheme(current === "light" || (!current && systemLight) ? "dark" : "light");
    });

    // Click outside handler for Search Dropdown
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".header-search-wrap")) {
        const hDrop = get("#header-search-dropdown");
        if (hDrop) hDrop.hidden = true;
      }
    });

    // Keyboard Shortcuts (Escape to close search, / or Ctrl+K to search)
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        const hDrop = get("#header-search-dropdown");
        const mDrop = get("#mobile-search-dropdown");
        const mPanel = get("#mobile-search-panel");
        if (hDrop) hDrop.hidden = true;
        if (mDrop) mDrop.hidden = true;
        if (mPanel) {
          mPanel.hidden = true;
          if (mobileToggle) mobileToggle.setAttribute("aria-expanded", "false");
        }
      } else if (
        (event.key === "/" || (event.ctrlKey && event.key.toLowerCase() === "k") || (event.metaKey && event.key.toLowerCase() === "k"))
        && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)
      ) {
        event.preventDefault();
        const searchInput = get("#header-search");
        if (searchInput && window.innerWidth > 560) {
          searchInput.focus();
          searchInput.select();
        } else if (mobileToggle && mobilePanel) {
          mobilePanel.hidden = false;
          mobileToggle.setAttribute("aria-expanded", "true");
          if (mobileInput) {
            mobileInput.focus();
            mobileInput.select();
          }
        }
      }
    });
    get("#add-category").addEventListener("click", () => {
      const form = get("#category-form");
      form.hidden = false;
      delete form.dataset.editingId;
      get("#category-name").value = "";
      get("#category-type").value = "expense";
      get("#category-name").focus();
    });
    get("#cancel-category").addEventListener("click", () => {
      get("#category-form").reset();
      delete get("#category-form").dataset.editingId;
      get("#category-form").hidden = true;
    });
    get("#category-form").addEventListener("submit", addOrRenameCategory);
    get("#transaction-type").addEventListener("change", () => {
      populateCategorySelect(get("#transaction-category"), state.categories, true);
    });
    render();
    setStatus(loadResult.source === "initial" ? "Ready for your first transaction." : "Your saved data is ready.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
}(window, document));
