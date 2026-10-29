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
    if (typeof transaction.description !== "string" || transaction.description.trim().length === 0) {
      errors.push("Transaction description is required.");
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
  let editingTransactionId = null;
  let searchQuery = "";
  let categoryFilter = "";

  function get(selector) {
    return document.querySelector(selector);
  }

  function setStatus(message, type = "info") {
    const status = get("#app-status");
    if (!status) {
      return;
    }

    status.textContent = message;
    status.dataset.status = type;
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

      const details = document.createElement("div");
      details.className = "transaction-details";
      const title = document.createElement("h3");
      title.textContent = transaction.description;
      const metadata = document.createElement("p");
      metadata.textContent = `${transaction.date} · ${categoryName(transaction.categoryId)} · ${transaction.type}`;
      details.append(title, metadata);
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
    list.replaceChildren();
    state.categories.forEach((category) => {
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
      list.append(item);
    });
  }

  function render() {
    renderSummary();
    renderTransactions();
    renderCategories();
  }

  function readForm() {
    return {
      type: get("#transaction-type").value,
      amount: Number(get("#transaction-amount").value),
      categoryId: get("#transaction-category").value,
      date: get("#transaction-date").value,
      description: get("#transaction-description").value.trim(),
      notes: get("#transaction-notes").value.trim()
    };
  }

  function persist(nextState) {
    const saveResult = global.MintMapState.saveState(nextState);
    if (!saveResult.ok) {
      setStatus(saveResult.error.message, "error");
      return false;
    }
    state = nextState;
    global.MintMapApp.state = state;
    return true;
  }

  function resetForm() {
    get("#transaction-form").reset();
    editingTransactionId = null;
    get("#transaction-form-heading").textContent = "Add a transaction";
    get("#transaction-submit").textContent = "Save transaction";
    get("#transaction-cancel").hidden = true;
    clearFieldErrors();
  }

  function handleSubmit(event) {
    event.preventDefault();
    clearFieldErrors();
    const isEditing = Boolean(editingTransactionId);
    const formData = readForm();
    const candidate = editingTransactionId
      ? { ...formData, id: editingTransactionId }
      : { ...formData, id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
    const operation = isEditing
      ? global.MintMapState.updateTransaction(state, editingTransactionId, candidate)
      : global.MintMapState.addTransaction(state, candidate);

    if (!operation.ok) {
      const unmatched = errorsForFields(operation.errors);
      setStatus(unmatched.join(" ") || "Please correct the highlighted fields.", "error");
      return;
    }
    if (!persist(operation.state)) {
      return;
    }

    render();
    resetForm();
    setStatus(isEditing ? "Transaction updated." : "Transaction saved.");
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
    get("#transaction-amount").focus();
  }

  function removeTransaction(transactionId) {
    const transaction = state.transactions.find((item) => item.id === transactionId);
    if (!transaction || !global.confirm(`Delete "${transaction.description}"?`)) {
      return;
    }

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
    setStatus("Transaction deleted.");
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

  function loadSampleData() {
    if (state.transactions.length > 0 && !global.confirm("Add fictional sample transactions without replacing your existing data?")) {
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const samples = [
      { id: `sample-${Date.now()}-1`, type: "income", amount: 12500, categoryId: "salary", date: today, description: "Monthly salary", notes: "Fictional sample data", isSample: true },
      { id: `sample-${Date.now()}-2`, type: "expense", amount: 850, categoryId: "food", date: today, description: "Weekly groceries", notes: "Fictional sample data", isSample: true },
      { id: `sample-${Date.now()}-3`, type: "expense", amount: 420, categoryId: "transport", date: today, description: "Transport pass", notes: "Fictional sample data", isSample: true }
    ];
    let nextState = state;
    for (const sample of samples) {
      const operation = global.MintMapState.addTransaction(nextState, sample);
      if (!operation.ok) {
        setStatus(operation.errors.join(" "), "error");
        return;
      }
      nextState = operation.state;
    }
    persistAndRender(nextState, "Fictional sample data added. It is clearly marked and did not replace your transactions.");
  }

  function initialize() {
    const loadResult = global.MintMapState.loadState();
    global.MintMapApp = { state: loadResult.ok ? loadResult.state : null, loadResult };
    if (!loadResult.ok) {
      setStatus(loadResult.error.message, "error");
      return;
    }

    state = loadResult.state;
    populateCategorySelect(get("#transaction-category"), state.categories, true);
    populateCategorySelect(get("#filter-category"), state.categories, false);
    get("#transaction-form").addEventListener("submit", handleSubmit);
    get("#transaction-cancel").addEventListener("click", resetForm);
    get("#transaction-search").addEventListener("input", (event) => {
      searchQuery = event.target.value;
      renderTransactions();
    });
    get("#filter-category").addEventListener("change", (event) => {
      categoryFilter = event.target.value;
      renderTransactions();
    });
    get("#clear-filters").addEventListener("click", () => {
      searchQuery = "";
      categoryFilter = "";
      get("#transaction-search").value = "";
      get("#filter-category").value = "";
      renderTransactions();
    });
    get("#load-sample-data").addEventListener("click", loadSampleData);
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
