const expressionEl = document.getElementById("expression");
const resultEl = document.getElementById("result");
const historyListEl = document.getElementById("history-list");
const modeToggle = document.getElementById("mode-toggle");

const keyButtons = document.querySelectorAll(".key");
const historyClearButton = document.querySelector('[data-action="history-clear"]');

let expression = "";
let angleMode = "DEG";
let memoryValue = 0;
const history = [];

const FUNCTION_NAMES = [
  "asin",
  "acos",
  "atan",
  "sin",
  "cos",
  "tan",
  "log",
  "ln",
  "sqrt",
  "abs",
  "exp",
];

function updateDisplay() {
  expressionEl.textContent = expression || "0";
}

function formatResult(value) {
  if (!Number.isFinite(value)) {
    return "Error";
  }

  const absValue = Math.abs(value);
  if ((absValue >= 1e12 || (absValue > 0 && absValue < 1e-6)) && absValue !== 1) {
    return value.toExponential(6);
  }

  return Number(value.toPrecision(12)).toString();
}

function factorial(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("Factorial requires a non-negative integer.");
  }

  if (value > 170) {
    throw new Error("Number too large for factorial.");
  }

  let total = 1;
  for (let i = 2; i <= value; i += 1) {
    total *= i;
  }
  return total;
}

function wrapUnaryOperator(input, symbol, wrapperName) {
  const escapedSymbol = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(\\d*\\.?\\d+|PI_CONST|E_CONST|\\([^()]*\\))${escapedSymbol}`, "g");

  let output = input;
  let previous = "";
  while (output !== previous) {
    previous = output;
    output = output.replace(pattern, `${wrapperName}($1)`);
  }

  return output;
}

function injectImplicitMultiplication(input) {
  let output = input;
  const functionGroup = FUNCTION_NAMES.join("|");

  output = output.replace(/(\d|\)|PI_CONST|E_CONST)(?=\()/g, "$1*");
  output = output.replace(new RegExp(`(\\d|\\)|PI_CONST|E_CONST)(?=(?:${functionGroup})\\b)`, "g"), "$1*");
  output = output.replace(/(\d|\)|PI_CONST|E_CONST)(?=(PI_CONST|E_CONST))/g, "$1*");
  output = output.replace(/(\d|\))(?=(PI_CONST|E_CONST))/g, "$1*");

  return output;
}

function normalizeExpression(input) {
  let output = input.trim();
  output = output.replace(/×/g, "*").replace(/÷/g, "/").replace(/π/g, "pi");
  output = output.replace(/\s+/g, "");

  if (!output) {
    throw new Error("Expression is empty.");
  }

  if (/[^0-9+\-*/().,!%^a-zA-Z]/.test(output)) {
    throw new Error("Expression contains unsupported characters.");
  }

  output = output.replace(/\bpi\b/gi, "PI_CONST");
  output = output.replace(/\be\b/gi, "E_CONST");
  output = injectImplicitMultiplication(output);
  output = wrapUnaryOperator(output, "!", "factorial");
  output = wrapUnaryOperator(output, "%", "percent");
  output = output.replace(/\^/g, "**");

  const replacements = {
    asin: "__asin",
    acos: "__acos",
    atan: "__atan",
    sin: "__sin",
    cos: "__cos",
    tan: "__tan",
    log: "__log",
    ln: "__ln",
    sqrt: "__sqrt",
    abs: "__abs",
    exp: "__exp",
  };

  Object.entries(replacements).forEach(([name, mapped]) => {
    output = output.replace(new RegExp(`\\b${name}\\b`, "g"), mapped);
  });

  output = output.replace(/PI_CONST/g, "PI");
  output = output.replace(/E_CONST/g, "E");

  return output;
}

function buildContext() {
  const toRadians = (value) => (angleMode === "DEG" ? (value * Math.PI) / 180 : value);
  const fromRadians = (value) => (angleMode === "DEG" ? (value * 180) / Math.PI : value);

  return {
    PI: Math.PI,
    E: Math.E,
    factorial,
    percent: (value) => value / 100,
    __sin: (value) => Math.sin(toRadians(value)),
    __cos: (value) => Math.cos(toRadians(value)),
    __tan: (value) => Math.tan(toRadians(value)),
    __asin: (value) => fromRadians(Math.asin(value)),
    __acos: (value) => fromRadians(Math.acos(value)),
    __atan: (value) => fromRadians(Math.atan(value)),
    __log: (value) => Math.log10(value),
    __ln: (value) => Math.log(value),
    __sqrt: (value) => Math.sqrt(value),
    __abs: (value) => Math.abs(value),
    __exp: (value) => Math.exp(value),
  };
}

function evaluateExpression(input) {
  const prepared = normalizeExpression(input);
  const context = buildContext();
  const names = Object.keys(context);
  const values = Object.values(context);
  const evaluator = new Function(...names, `"use strict"; return (${prepared});`);
  const result = evaluator(...values);

  if (typeof result !== "number" || Number.isNaN(result) || !Number.isFinite(result)) {
    throw new Error("Invalid result.");
  }

  return result;
}

function addToHistory(rawExpression, value) {
  history.unshift({
    expression: rawExpression,
    result: value,
  });

  if (history.length > 20) {
    history.pop();
  }

  renderHistory();
}

function renderHistory() {
  historyListEl.innerHTML = "";

  if (history.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "history-empty";
    emptyItem.textContent = "No calculations yet.";
    historyListEl.appendChild(emptyItem);
    return;
  }

  history.forEach((item) => {
    const listItem = document.createElement("li");
    listItem.textContent = `${item.expression} = ${item.result}`;
    listItem.title = "Click to reuse result";
    listItem.addEventListener("click", () => {
      expression = item.result.toString();
      resultEl.textContent = item.result;
      updateDisplay();
    });
    historyListEl.appendChild(listItem);
  });
}

function clearAll() {
  expression = "";
  resultEl.textContent = "0";
  updateDisplay();
}

function backspace() {
  expression = expression.slice(0, -1);
  updateDisplay();
}

function appendValue(value) {
  expression += value;
  updateDisplay();
}

function calculateAndRender() {
  try {
    const value = evaluateExpression(expression);
    const formatted = formatResult(value);

    if (formatted === "Error") {
      throw new Error("Result is invalid.");
    }

    resultEl.textContent = formatted;
    addToHistory(expression, formatted);
    expression = formatted;
    updateDisplay();
  } catch (error) {
    resultEl.textContent = "Error";
  }
}

function getCurrentResultNumber() {
  const raw = resultEl.textContent;
  const parsed = Number(raw);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return 0;
}

function toggleMode() {
  angleMode = angleMode === "DEG" ? "RAD" : "DEG";
  modeToggle.textContent = angleMode;
}

function handleAction(action) {
  switch (action) {
    case "clear-all":
      clearAll();
      break;
    case "backspace":
      backspace();
      break;
    case "evaluate":
      calculateAndRender();
      break;
    case "toggle-mode":
      toggleMode();
      break;
    case "memory-clear":
      memoryValue = 0;
      break;
    case "memory-recall":
      appendValue(formatResult(memoryValue));
      break;
    case "memory-add":
      memoryValue += getCurrentResultNumber();
      break;
    case "memory-subtract":
      memoryValue -= getCurrentResultNumber();
      break;
    case "history-clear":
      history.length = 0;
      renderHistory();
      break;
    default:
      break;
  }
}

keyButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const { action, value } = button.dataset;

    if (action) {
      handleAction(action);
      return;
    }

    if (value) {
      appendValue(value);
    }
  });
});

historyClearButton.addEventListener("click", () => {
  handleAction("history-clear");
});

document.addEventListener("keydown", (event) => {
  const key = event.key;

  if (key === "Enter") {
    event.preventDefault();
    calculateAndRender();
    return;
  }

  if (key === "Backspace") {
    event.preventDefault();
    backspace();
    return;
  }

  if (key === "Escape") {
    clearAll();
    return;
  }

  if (/^[0-9+\-*/().%^!]$/.test(key)) {
    appendValue(key);
  }
});

modeToggle.addEventListener("click", () => {
  handleAction("toggle-mode");
});

updateDisplay();
renderHistory();
