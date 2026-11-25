/* Advanced Calculator - script.js
   Whole numbers use BigInt (exact, even for huge values).
   Decimals use Number. */

/* ===== Helpers and constants ===== */
const $ = (id) => document.getElementById(id);
const isB = (x) => typeof x === "bigint",
  N = Number;
const bad = (m) => {
  throw new Error(m);
};
const MAXIT = 2000000;

/* ---------- math core ---------- */
/* ===== Math core ===== */

// + - x. BigInt when both sides are whole numbers, otherwise Number
const add = (a, b) => (isB(a) && isB(b) ? a + b : N(a) + N(b));
const sub = (a, b) => (isB(a) && isB(b) ? a - b : N(a) - N(b));
const mul = (a, b) => (isB(a) && isB(b) ? a * b : N(a) * N(b));
// Division: exact BigInt when it divides evenly, otherwise a decimal
function div(a, b) {
  if (N(b) === 0) bad("Division by zero");
  if (isB(a) && isB(b)) {
    if (a % b === 0n) return a / b;
    const q = (a * 10n ** 40n) / b;
    if (q < 10n ** 300n && q > -(10n ** 300n)) return N(q) / 1e40;
  }
  return N(a) / N(b);
}
// Floored modulo (the result takes the sign of the divisor, like Python)
function mod(a, b) {
  if (N(b) === 0) bad("Modulo by zero");
  if (isB(a) && isB(b)) {
    let r = a % b;
    if (r !== 0n && r < 0n !== b < 0n) r += b;
    return r;
  }
  return N(a) - N(b) * Math.floor(N(a) / N(b));
}
// Integer (floor) division
function idiv(a, b) {
  if (N(b) === 0) bad("Division by zero");
  if (isB(a) && isB(b)) {
    let q = a / b;
    if (a % b !== 0n && a < 0n !== b < 0n) q -= 1n;
    return q;
  }
  const f = Math.floor(N(a) / N(b));
  return isFinite(f) ? BigInt(f) : bad("Result is too large");
}
// Exponent a^b. A negative exponent gives 1 / a^-b
function pw(a, b) {
  if (isB(a) && isB(b)) {
    if (b >= 0n) {
      if (
        a !== 0n &&
        a !== 1n &&
        a !== -1n &&
        N(b) * Math.log10(Math.abs(N(a))) > 20000
      )
        bad("Result is too large");
      return a ** b;
    }
    if (a === 0n) bad("Division by zero");
    return div(1n, pw(a, -b));
  }
  const r = Math.pow(N(a), N(b));
  if (Number.isNaN(r))
    bad("Undefined result (negative base with fractional exponent)");
  return r;
}
// Integer square root using Newton's method
function isqrt(n) {
  if (n < 2n) return n;
  let x = 1n << BigInt((n.toString(2).length + 1) >> 1);
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}
// Square root (exact for perfect squares)
function sq(v) {
  if (N(v) < 0) bad("Square root of a negative number is undefined");
  if (isB(v)) {
    const r = isqrt(v);
    if (r * r === v) return r;
  }
  return Math.sqrt(N(v));
}
// Cube root (exact for perfect cubes)
function cb(v) {
  const f = Math.cbrt(N(v));
  if (isB(v) && isFinite(f)) {
    const r = BigInt(Math.round(f));
    if (r ** 3n === v) return r;
  }
  return f;
}
// Logarithm: base 10, or base 2 when two is true
function lg(v, two) {
  if (N(v) <= 0) bad("Logarithm of zero or a negative number is undefined");
  if (isB(v) && !isFinite(N(v))) {
    const s = v.toString();
    const r =
      s.length - 1 + Math.log10(parseFloat(s[0] + "." + s.slice(1, 16)));
    return two ? r / Math.log10(2) : r;
  }
  return two ? Math.log2(N(v)) : Math.log10(N(v));
}
const chk = (x) => (isFinite(x) ? x : bad("Result is too large"));
// Floor and ceiling
const fl = (v) => (isB(v) ? v : BigInt(chk(Math.floor(v))));
const ce = (v) => (isB(v) ? v : BigInt(chk(Math.ceil(v))));
// Factorial: n! = n x (n-1) x ... x 1, with 0! = 1. Complexity O(n)
function fact(v) {
  if (!isB(v)) {
    if (!Number.isInteger(v)) bad("Factorial needs a whole number");
    v = BigInt(v);
  }
  if (v < 0n) bad("Factorial of a negative number is undefined");
  if (v > 3000n) bad("Factorial input is too large (max 3000)");
  let r = 1n;
  for (let k = 2n; k <= v; k++) r *= k;
  return r;
}
// Loop bounds must be whole numbers
function toInt(v, what) {
  if (isB(v)) return v;
  if (Number.isInteger(v)) return BigInt(v);
  return bad("The " + what + " must be a whole number");
}
// Turn a result into display text (decimals are rounded to 12 digits)
function fmt(v) {
  if (isB(v)) return v.toString();
  if (!isFinite(v)) bad("Result is too large or undefined");
  if (Number.isInteger(v) && Math.abs(v) < 1e21) return BigInt(v).toString();
  const r = parseFloat(v.toPrecision(12));
  return Number.isInteger(r) && Math.abs(r) < 1e21
    ? BigInt(r).toString()
    : String(r);
}

/* ---------- lexer + parser ---------- */
/* ===== Lexer and parser (recursive descent) ===== */
let VARS = {};
const OPS = {
  "+": add,
  "-": sub,
  "*": mul,
  imp: mul,
  "/": div,
  "%": mod,
  "//": idiv,
  "^": pw,
};
const SYM = { "+": "+", "-": "−", "*": "×", "/": "÷", "%": "mod", "//": "div" };
const FNF = {
  sqrt: sq,
  cbrt: cb,
  log: (v) => lg(v, 0),
  log2: (v) => lg(v, 1),
  floor: fl,
  ceil: ce,
  idiv,
  mod,
};
const ARITY = {
  sqrt: 1,
  cbrt: 1,
  log: 1,
  log2: 1,
  floor: 1,
  ceil: 1,
  idiv: 2,
  mod: 2,
};
const DISP = {
  sqrt: (a) => `√(${a[0]})`,
  cbrt: (a) => `∛(${a[0]})`,
  log: (a) => `log(${a[0]})`,
  log2: (a) => `log₂(${a[0]})`,
  floor: (a) => `⌊${a[0]}⌋`,
  ceil: (a) => `⌈${a[0]}⌉`,
  idiv: (a) => `${a[0]} div ${a[1]}`,
  mod: (a) => `${a[0]} mod ${a[1]}`,
};
const FNL = ["sum2", "prod2", "sum", "prod", ...Object.keys(ARITY)].sort(
  (a, b) => b.length - a.length,
);

// Lexer: split the text into tokens (numbers, variables, functions, operators)
function lex(src) {
  const s = src.replace(/×/g, "*").replace(/÷/g, "/").replace(/[−–]/g, "-");
  const t = [];
  let k = 0;
  while (k < s.length) {
    const c = s[k];
    if (/\s/.test(c)) {
      k++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(k));
      if (!m) bad("Invalid number");
      t.push({ t: "n", v: m[0] });
      k += m[0].length;
      continue;
    }
    if (c === "√" || c === "∛") {
      t.push({ t: "f", v: c === "√" ? "sqrt" : "cbrt" });
      k++;
      continue;
    }
    if (/[A-Za-z]/.test(c)) {
      const f = FNL.find((n) => s.startsWith(n, k) && s[k + n.length] === "(");
      if (f) {
        t.push({ t: "f", v: f });
        k += f.length;
      } else {
        t.push({ t: "v", v: c });
        k++;
      }
      continue;
    }
    if (s.startsWith("//", k)) {
      t.push({ t: "o", v: "//" });
      k += 2;
      continue;
    }
    if ("+-*/%^!(),".includes(c)) {
      t.push({ t: "o", v: c });
      k++;
      continue;
    }
    bad(`Invalid character “${c}”`);
  }
  return t;
}

// Parser: builds a tree of nodes { ev: evaluate, s: display text }.
// Precedence, lowest to highest:
// expr (+ -) < term (* / % // and implicit multiply) < unary (- and ^) < postfix (!) < primary
// ===== Step-by-step solution support =====
// Every node has: ev (evaluate), s (formula text), h (height) and
// v(env, depth), which shows the expression with everything below
// "depth" already worked out. Showing depth h, h-1, ... 0 gives the steps.
let ITER = 0; // shared iteration counter for all loops in one evaluation
const node = (ev, s, h, vf) => ({
  ev,
  s,
  h,
  v: (e, d) => (d <= 0 ? fmt(ev(e)) : vf(e, d)),
});
const wrapTerm = (t) => (/ [+−] /.test(t) ? `(${t})` : t);

// n x (n-1) x ... x 1, shortened when n is large
function expandFactorial(n) {
  if (n <= 1n) return "1";
  if (n <= 8n) {
    const out = [];
    for (let k = n; k >= 1n; k--) out.push(String(k));
    return out.join(" × ");
  }
  return [String(n), String(n - 1n), String(n - 2n), "…", "2", "1"].join(" × ");
}

// One loop: Σ (isSum) or Π. A double loop is a loop inside a loop.
function makeLoop(isSum, id, lo, hi, body) {
  const bounds = (e) => [
    toInt(lo.ev(e), "lower bound"),
    toInt(hi.ev(e), "upper bound"),
  ];
  const ev = (e) => {
    const [a, b] = bounds(e);
    let acc = isSum ? 0n : 1n;
    for (let k = a; k <= b; k++) {
      if (++ITER > MAXIT) bad("Too many iterations");
      const v = body.ev({ ...e, [id]: k });
      acc = isSum ? add(acc, v) : mul(acc, v);
    }
    return acc;
  };
  const v = (e, d) => {
    if (d <= 0) return fmt(ev(e));
    const [a, b] = bounds(e);
    if (b < a) return isSum ? "0" : "1";
    const n = b - a + 1n;
    const ks = [];
    if (n <= 8n) for (let k = a; k <= b; k++) ks.push(k);
    else ks.push(a, a + 1n, a + 2n, null, b - 1n, b);
    return ks
      .map((k) => {
        if (k === null) return "…";
        const env = { ...e, [id]: k };
        return d === 1 ? fmt(body.ev(env)) : wrapTerm(body.v(env, d - 2));
      })
      .join(isSum ? " + " : " × ");
  };
  return { ev, v, h: body.h + 2, s: "" };
}

function parse(src) {
  const T = lex(src);
  let p = 0;
  if (!T.length) bad("Enter an expression first");
  const isO = (v) => T[p] && T[p].t === "o" && T[p].v === v;
  const eat = (v) => {
    if (!isO(v)) bad(`Expected “${v}”`);
    p++;
  };
  const bin = (o, a, b) =>
    node(
      (e) => OPS[o](a.ev(e), b.ev(e)),
      o === "imp"
        ? a.s + b.s
        : o === "^"
          ? `${a.s}^${b.s}`
          : `${a.s} ${SYM[o]} ${b.s}`,
      1 + Math.max(a.h, b.h),
      (e, d) =>
        o === "^"
          ? `${a.v(e, d - 1)}^${b.v(e, d - 1)}`
          : `${a.v(e, d - 1)} ${o === "imp" ? "×" : SYM[o]} ${b.v(e, d - 1)}`,
    );
  const startsFactor = () => {
    const k = T[p];
    return (
      k &&
      (k.t === "n" ||
        k.t === "v" ||
        k.t === "f" ||
        (k.t === "o" && k.v === "("))
    );
  };

  // + and -
  function expr() {
    let l = term();
    while (isO("+") || isO("-")) {
      const o = T[p++].v;
      l = bin(o, l, term());
    }
    return l;
  }
  // * / % // and implicit multiplication (xy, Cx)
  function term() {
    let l = unary();
    for (;;) {
      if (isO("*") || isO("/") || isO("%") || isO("//")) {
        const o = T[p++].v;
        l = bin(o, l, unary());
      } else if (startsFactor()) l = bin("imp", l, unary());
      else break;
    }
    return l;
  }
  // Negative sign and ^ (right-associative)
  function unary() {
    if (isO("-")) {
      p++;
      const a = unary();
      return node(
        (e) => -a.ev(e),
        "-" + a.s,
        a.h + 1,
        (e, d) => "-" + a.v(e, d - 1),
      );
    }
    if (isO("+")) {
      p++;
      return unary();
    }
    const b = postfix();
    if (isO("^")) {
      p++;
      return bin("^", b, unary());
    }
    return b;
  }
  // Factorial !
  function postfix() {
    let b = primary();
    while (isO("!")) {
      p++;
      const a = b;
      b = node(
        (e) => fact(a.ev(e)),
        a.s + "!",
        a.h + 2,
        (e, d) =>
          d >= 2
            ? `${a.v(e, d - 2)}!`
            : expandFactorial(toInt(a.ev(e), "value")),
      );
    }
    return b;
  }
  // Numbers, variables, parentheses, function calls
  function primary() {
    const k = T[p++];
    if (!k) bad("Incomplete expression");
    if (k.t === "n") {
      const v = /^\d+$/.test(k.v) ? BigInt(k.v) : N(k.v);
      return { ev: () => v, s: k.v, h: 0, v: () => k.v };
    }
    if (k.t === "v") {
      const ev = (e) => {
        if (k.v in e) return e[k.v];
        if (VARS[k.v] !== undefined) return VARS[k.v];
        return bad(`Variable “${k.v}” has no value`);
      };
      return { ev, s: k.v, h: 0, v: (e) => fmt(ev(e)) };
    }
    if (k.t === "o" && k.v === "(") {
      const x = expr();
      eat(")");
      return {
        ev: x.ev,
        s: "(" + x.s + ")",
        h: x.h,
        v: (e, d) => (d <= 0 ? fmt(x.ev(e)) : "(" + x.v(e, d) + ")"),
      };
    }
    if (k.t === "f") return func(k.v);
    return bad(`Unexpected “${k.v}”`);
  }
  // Loop variable name such as i or j
  function ident() {
    const k = T[p];
    if (!k || k.t !== "v") bad("A loop variable (such as i) is expected");
    p++;
    return k.v;
  }
  // Sigma, double sigma, Pi, double Pi.
  // Sigma starts at 0 and adds; Pi starts at 1 and multiplies.
  // Complexity O(n) for single, O(n x m) for double
  function loop(name, dim) {
    eat("(");
    const id = ident();
    eat(",");
    const lo = expr();
    eat(",");
    const hi = expr();
    eat(",");
    let id2, lo2, hi2;
    if (dim === 2) {
      id2 = ident();
      eat(",");
      lo2 = expr();
      eat(",");
      hi2 = expr();
      eat(",");
    }
    const body = expr();
    eat(")");
    const sum = name.startsWith("sum"),
      big = sum ? "Σ" : "Π";
    const s =
      dim === 1
        ? `${big}(${id} = ${lo.s} to ${hi.s}) ${body.s}`
        : `${big}${big}(${id} = ${lo.s} to ${hi.s}, ${id2} = ${lo2.s} to ${hi2.s}) ${body.s}`;
    const inner = dim === 2 ? makeLoop(sum, id2, lo2, hi2, body) : body;
    const loopNode = makeLoop(sum, id, lo, hi, inner);
    loopNode.s = s;
    return loopNode;
  }
  function func(name) {
    if (name === "sum" || name === "prod") return loop(name, 1);
    if (name === "sum2" || name === "prod2") return loop(name, 2);
    let args;
    if (isO("(")) {
      p++;
      args = [expr()];
      while (isO(",")) {
        p++;
        args.push(expr());
      }
      eat(")");
    } else args = [postfix()];
    if (args.length !== ARITY[name])
      bad(`${name} needs ${ARITY[name]} argument(s)`);
    const f = FNF[name];
    return node(
      (e) => f(...args.map((a) => a.ev(e))),
      DISP[name](args.map((a) => a.s)),
      1 + Math.max(...args.map((a) => a.h)),
      (e, d) => DISP[name](args.map((a) => a.v(e, d - 1))),
    );
  }

  const root = expr();
  if (p < T.length) bad(`Unexpected “${T[p].v}”`);
  return root;
}

/* ---------- UI ---------- */
/* ===== Premium access (demo) ===== */
// The purchase is simulated: no real payment is made.
// Set PREMIUM_REQUIRED to false to always show the formula.
const PREMIUM_REQUIRED = true;
// Accounts are saved in this browser only (localStorage).
// Passwords are stored as a salted SHA-256 hash, never as plain text.
// This is a demo: a real app needs a server to check logins and payments.
const USERS_KEY = "calc-users";
const SESSION_KEY = "calc-session";
let USERS = {};
let currentUser = null;
let premium = false;
let pendingUnlock = false;
let authMode = "login";
let lastFormula = "—";
let lastAst = null; // the last expression solved with =
try {
  USERS = JSON.parse(localStorage.getItem(USERS_KEY)) || {};
  currentUser = localStorage.getItem(SESSION_KEY);
} catch (e) {}
if (!USERS[currentUser]) currentUser = null;

function saveUsers() {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(USERS));
  } catch (e) {}
}

// Salted SHA-256 (falls back to a simple hash if the browser has no crypto)
async function hashPw(pw, salt) {
  if (window.crypto && crypto.subtle && window.TextEncoder) {
    const buf = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(salt + pw),
    );
    return [...new Uint8Array(buf)]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
  }
  let h = 5381;
  for (const c of salt + pw) h = ((h << 5) + h + c.charCodeAt(0)) | 0;
  return String(h);
}

// Every write to the Formula display goes through here (always visible)
function setFormula(text) {
  lastFormula = text;
  $("fo").textContent = text;
}

// Premium belongs to the logged-in account
function setPremium(on) {
  if (!currentUser) return;
  USERS[currentUser].premium = on;
  saveUsers();
  updatePremiumUI();
}

function updatePremiumUI() {
  premium = !!(currentUser && USERS[currentUser].premium);
  $("unlock").hidden = !PREMIUM_REQUIRED || premium;
  $("badge").hidden = !PREMIUM_REQUIRED || !premium;
  $("relock").hidden = !PREMIUM_REQUIRED || !premium;
  if (!PREMIUM_REQUIRED || premium) $("premium").hidden = true;
  $("who").textContent = currentUser ? USERS[currentUser].name : "";
  $("authBtn").textContent = currentUser ? "Log out" : "Log in";
  renderSolution();
}

// Steps: the formula, then the same expression worked out one level at a time
function buildSteps(ast) {
  const steps = [ast.s];
  for (let d = ast.h; d >= 0; d--) {
    const s = ast.v({}, d);
    if (s !== steps[steps.length - 1]) steps.push(s);
  }
  return steps;
}

// Solution panel: steps for premium users, a locked note for everyone else
function renderSolution() {
  const list = $("steps");
  list.replaceChildren();
  if (!PREMIUM_REQUIRED || premium) {
    if (!lastAst) {
      $("solNote").textContent = "Press = to see the step-by-step solution.";
      return;
    }
    $("solNote").textContent = "";
    try {
      ITER = 0;
      buildSteps(lastAst).forEach((s) => {
        const li = document.createElement("li");
        li.textContent = s;
        list.appendChild(li);
      });
    } catch (e) {
      $("solNote").textContent = "Couldn’t build the steps for this expression.";
    }
  } else {
    $("solNote").textContent =
      "Step-by-step solutions are a premium feature. Unlock premium to see them.";
  }
}

// Show the login / create account panel
function showAuth(mode, msg) {
  authMode = mode;
  const login = mode === "login";
  $("authTitle").textContent = login ? "Log in" : "Create an account";
  $("authGo").textContent = login ? "Log in" : "Create account";
  $("authSwitch").textContent = login
    ? "Create an account"
    : "I already have an account";
  $("authMsg").textContent = msg || "";
  $("authMsg").classList.remove("perr");
  $("premium").hidden = true;
  $("auth").hidden = false;
  $("user").focus();
}

async function submitAuth() {
  const name = $("user").value.trim();
  const pw = $("pass").value;
  const fail = (m) => {
    $("authMsg").textContent = m;
    $("authMsg").classList.add("perr");
  };
  if (name.length < 3) return fail("Username needs at least 3 characters.");
  if (pw.length < 4) return fail("Password needs at least 4 characters.");
  const key = name.toLowerCase();
  if (authMode === "register") {
    if (USERS[key]) return fail("That username is taken. Try another.");
    const salt = Math.random().toString(36).slice(2);
    USERS[key] = { name, salt, hash: await hashPw(pw, salt), premium: false };
  } else {
    const u = USERS[key];
    if (!u || u.hash !== (await hashPw(pw, u.salt)))
      return fail("Wrong username or password.");
  }
  saveUsers();
  currentUser = key;
  try {
    localStorage.setItem(SESSION_KEY, key);
  } catch (e) {}
  $("pass").value = "";
  $("auth").hidden = true;
  updatePremiumUI();
  if (pendingUnlock) {
    pendingUnlock = false;
    if (!premium) $("premium").hidden = false;
  }
}

function logout() {
  currentUser = null;
  pendingUnlock = false;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (e) {}
  $("auth").hidden = true;
  updatePremiumUI();
}

// Unlock: log in first, then buy premium
$("unlock").onclick = () => {
  if (currentUser) $("premium").hidden = false;
  else {
    pendingUnlock = true;
    showAuth("register", "Create an account or log in to unlock premium.");
  }
};
$("cancel").onclick = () => ($("premium").hidden = true);
$("buy").onclick = () => setPremium(true);
$("relock").onclick = () => setPremium(false);
$("authBtn").onclick = () => {
  if (currentUser) logout();
  else {
    pendingUnlock = false;
    showAuth("login");
  }
};
$("authSwitch").onclick = () =>
  showAuth(authMode === "login" ? "register" : "login");
$("authGo").onclick = submitAuth;
$("authCancel").onclick = () => {
  pendingUnlock = false;
  $("auth").hidden = true;
};
["user", "pass"].forEach((id) =>
  $(id).addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitAuth();
  }),
);

/* ===== User interface ===== */

// Read the values typed in the Variables panel
function loadVars() {
  ITER = 0;
  VARS = {};
  const vals = {};
  document.querySelectorAll("#vgrid input").forEach((inp) => {
    const v = inp.value.trim();
    if (v !== "") vals[inp.dataset.n] = parse(v).ev({});
  });
  VARS = vals;
}

// Runs on = or Enter: parse, evaluate, show the result or an error
function calculate() {
  const src = $("expr").value;
  try {
    loadVars();
    const ast = parse(src);
    ITER = 0;
    const out = fmt(ast.ev({}));
    setFormula(ast.s);
    lastAst = ast;
    $("an").textContent = out;
    $("an").className = "answer";
  } catch (err) {
    setFormula(src.trim() || "—");
    $("an").textContent =
      "Error: " + (err && err.message ? err.message : "Invalid expression");
    $("an").className = "answer err";
    lastAst = null;
  }
  renderSolution();
}

// Live preview while pressing keys: the formula appears as you build it,
// and the answer appears once the expression is complete.
// Unfinished expressions stay quiet; errors only show when = is pressed.
function preview() {
  const src = $("expr").value;
  if (lastAst) {
    lastAst = null;
    renderSolution();
  }
  $("an").className = "answer";
  if (!src.trim()) {
    setFormula("—");
    $("an").textContent = "—";
    return;
  }
  try {
    loadVars();
    const ast = parse(src);
    setFormula(ast.s);
    try {
      ITER = 0;
      $("an").textContent = fmt(ast.ev({}));
    } catch (e) {
      $("an").textContent = "—";
    }
  } catch (e) {
    setFormula(src);
    $("an").textContent = "—";
  }
}

// Insert text at the cursor in the input field
function ins(t) {
  const el = $("expr");
  el.setRangeText(t, el.selectionStart, el.selectionEnd, "end");
  el.focus({ preventScroll: true });
  preview();
}
// Backspace
function back() {
  const el = $("expr"),
    a = el.selectionStart,
    b = el.selectionEnd;
  if (a !== b) el.setRangeText("", a, b, "end");
  else if (a > 0) el.setRangeText("", a - 1, a, "end");
  el.focus({ preventScroll: true });
  preview();
}
// Create one key button
const mk = ([l, v, c]) => {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = l;
  if (c) b.className = c;
  b.onclick = () => {
    if (v === "EQ") calculate();
    else if (v === "AC") {
      $("expr").value = "";
      setFormula("—");
      $("an").textContent = "—";
      $("an").className = "answer";
      lastAst = null;
      renderSolution();
    } else if (v === "BK") back();
    else ins(v);
  };
  return b;
};
// Keys that are always visible
const BASE = [
  ["7", "7"],
  ["8", "8"],
  ["9", "9"],
  ["×", "×"],
  ["÷", "÷"],
  ["⌫", "BK"],
  ["4", "4"],
  ["5", "5"],
  ["6", "6"],
  ["−", "-"],
  ["(", "("],
  [")", ")"],
  ["1", "1"],
  ["2", "2"],
  ["3", "3"],
  ["+", "+"],
  [",", ","],
  ["AC", "AC", "ac"],
  ["0", "0"],
  [".", "."],
  ["=", "EQ", "eq"],
];
// Keys for each category tab
const CATS = [
  [
    "Basic",
    [
      ["mod", "%", "fn"],
      ["div", "//", "fn"],
      ["⌊x⌋", "floor(", "fn"],
      ["⌈x⌉", "ceil(", "fn"],
    ],
  ],
  [
    "Exp / Roots / Logs",
    [
      ["xʸ", "^", "fn"],
      ["√", "√(", "fn"],
      ["∛", "∛(", "fn"],
      ["log", "log(", "fn"],
      ["log₂", "log2(", "fn"],
    ],
  ],
  [
    "Factorial",
    [
      ["n!", "!", "fn"],
      ["a!+b!", "5!+3!", "fn"],
      ["a!÷b!", "5!/3!", "fn"],
    ],
  ],
  [
    "Σ / Π",
    [
      ["Σ", "sum(i,1,5,i)", "fn"],
      ["ΣΣ", "sum2(i,1,3,j,1,3,i*j)", "fn"],
      ["Π", "prod(i,1,4,i)", "fn"],
      ["ΠΠ", "prod2(i,1,3,j,1,3,i+j)", "fn"],
      ["i", "i", "fn"],
      ["j", "j", "fn"],
    ],
  ],
  [
    "Algebra",
    [
      ["x", "x", "fn"],
      ["y", "y", "fn"],
      ["C", "C", "fn"],
      ["xy", "xy", "fn"],
      ["x+y", "x+y", "fn"],
      ["xʸ", "x^y", "fn"],
      ["Cx", "Cx", "fn"],
      ["x+C", "x+C", "fn"],
      ["xᶜ", "x^C", "fn"],
    ],
  ],
  [
    "Variables",
    [
      ["A", "A", "fn"],
      ["B", "B", "fn"],
      ["C", "C", "fn"],
      ["D", "D", "fn"],
      ["x", "x", "fn"],
      ["y", "y", "fn"],
    ],
  ],
];
// Switch category tab
function showCat(n) {
  $("catpad").replaceChildren(...CATS[n][1].map(mk));
  [...$("tabs").children].forEach((t, k) =>
    t.setAttribute("aria-selected", k === n),
  );
  $("vars").hidden = !(n === 4 || n === 5);
}
CATS.forEach(([name], n) => {
  const t = document.createElement("button");
  t.type = "button";
  t.textContent = name;
  t.setAttribute("role", "tab");
  t.onclick = () => showCat(n);
  $("tabs").appendChild(t);
});
$("pad").replaceChildren(...BASE.map(mk));
showCat(0);
["A", "B", "C", "D", "x", "y"].forEach((n) => {
  const lab = document.createElement("label");
  lab.innerHTML = `${n}<input data-n="${n}" inputmode="decimal" autocomplete="off" placeholder="value">`;
  $("vgrid").appendChild(lab);
});
$("expr").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    calculate();
  }
});
document.querySelectorAll("#vgrid input").forEach((i) =>
  i.addEventListener("keydown", (e) => {
    if (e.key === "Enter") calculate();
  }),
);
$("theme").onclick = () => {
  const r = document.documentElement;
  const cur =
    r.dataset.theme ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  r.dataset.theme = cur === "dark" ? "light" : "dark";
};

// Update the preview when a variable value changes
document
  .querySelectorAll("#vgrid input")
  .forEach((i) => i.addEventListener("input", preview));

updatePremiumUI();
