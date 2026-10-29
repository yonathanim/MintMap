"use strict";

(function createMintMapStateApi(global) {
  const STORAGE_KEY = "mintmap.state.v1";
  const SCHEMA_VERSION = 1;
  const TRANSACTION_TYPES = new Set(["income", "expense"]);
  const INITIAL_CATEGORIES = [
    { id: "food", name: "Food" },
    { id: "transport", name: "Transport" },
    { id: "housing", name: "Housing" },
    { id: "utilities", name: "Utilities" },
    { id: "health", name: "Health" },
    { id: "entertainment", name: "Entertainment" },
    { id: "salary", name: "Salary" },
    { id: "other", name: "Other" }
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

    nextState.categories.push(clone(category));
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

  function getStorage(storage) {
    if (storage) {
      return storage;
    }
    if (!global || !global.localStorage) {
      return null;
    }
    return global.localStorage;
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

    return { ok: true, state: clone(parsed), source: "stored", error: null };
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
    addTransaction,
    saveState,
    loadState,
    readState: loadState
  });
}(window));

(function connectMintMapToDocument(global, document) {
  if (!document || !global.MintMapState) {
    return;
  }

  function setStatus(message, type = "info") {
    const status = document.querySelector("#app-status");
    if (!status) {
      return;
    }

    status.textContent = message;
    status.dataset.status = type;
  }

  function populateCategorySelect(select, categories, includePlaceholder) {
    if (!select) {
      return;
    }

    select.replaceChildren();
    if (includePlaceholder) {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Select category";
      select.append(placeholder);
    } else {
      const allCategories = document.createElement("option");
      allCategories.value = "";
      allCategories.textContent = "All categories";
      select.append(allCategories);
    }

    categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category.id;
      option.textContent = category.name;
      select.append(option);
    });
  }

  function initialize() {
    const loadResult = global.MintMapState.loadState();
    global.MintMapApp = {
      state: loadResult.ok ? loadResult.state : null,
      loadResult
    };

    if (!loadResult.ok) {
      setStatus(loadResult.error.message, "error");
      return;
    }

    populateCategorySelect(
      document.querySelector("#transaction-category"),
      loadResult.state.categories,
      true
    );
    populateCategorySelect(
      document.querySelector("#filter-category"),
      loadResult.state.categories,
      false
    );
    setStatus(
      loadResult.source === "initial"
        ? "Ready for your first transaction."
        : "Your saved data is ready."
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
}(window, document));
