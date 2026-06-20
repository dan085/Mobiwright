import { Device } from "../core/device";

export interface TestFixtures {
  device: Device;
}

export type TestFn = (fixtures: TestFixtures) => Promise<void> | void;
export type HookFn = (fixtures: TestFixtures) => Promise<void> | void;

export interface TestCase {
  title: string;
  fullTitle: string;
  fn: TestFn;
  suite: Suite;
  skip: boolean;
  only: boolean;
}

export interface Suite {
  title: string;
  parent?: Suite;
  beforeEach: HookFn[];
  afterEach: HookFn[];
  beforeAll: HookFn[];
  afterAll: HookFn[];
  tests: TestCase[];
  suites: Suite[];
}

function newSuite(title: string, parent?: Suite): Suite {
  return { title, parent, beforeEach: [], afterEach: [], beforeAll: [], afterAll: [], tests: [], suites: [] };
}

/**
 * Registro global de tests. Cuando el runner hace `require()` de un spec, las
 * llamadas a describe()/test() rellenan este árbol (mismo modelo que Mocha/
 * Playwright Test). El runner lee `rootSuite` después.
 */
export const rootSuite: Suite = newSuite("");
let currentSuite: Suite = rootSuite;

export function describe(title: string, body: () => void): void {
  const suite = newSuite(title, currentSuite);
  currentSuite.suites.push(suite);
  const prev = currentSuite;
  currentSuite = suite;
  try {
    body();
  } finally {
    currentSuite = prev;
  }
}

function fullTitleOf(suite: Suite, title: string): string {
  const parts: string[] = [title];
  let s: Suite | undefined = suite;
  while (s && s.title) {
    parts.unshift(s.title);
    s = s.parent;
  }
  return parts.join(" › ");
}

interface TestApi {
  (title: string, fn: TestFn): void;
  skip: (title: string, fn: TestFn) => void;
  only: (title: string, fn: TestFn) => void;
  describe: typeof describe;
  beforeEach: (fn: HookFn) => void;
  afterEach: (fn: HookFn) => void;
  beforeAll: (fn: HookFn) => void;
  afterAll: (fn: HookFn) => void;
}

function register(title: string, fn: TestFn, opts: { skip?: boolean; only?: boolean }) {
  currentSuite.tests.push({
    title,
    fullTitle: fullTitleOf(currentSuite, title),
    fn,
    suite: currentSuite,
    skip: !!opts.skip,
    only: !!opts.only,
  });
}

export const test: TestApi = Object.assign(
  (title: string, fn: TestFn) => register(title, fn, {}),
  {
    skip: (title: string, fn: TestFn) => register(title, fn, { skip: true }),
    only: (title: string, fn: TestFn) => register(title, fn, { only: true }),
    describe,
    beforeEach: (fn: HookFn) => currentSuite.beforeEach.push(fn),
    afterEach: (fn: HookFn) => currentSuite.afterEach.push(fn),
    beforeAll: (fn: HookFn) => currentSuite.beforeAll.push(fn),
    afterAll: (fn: HookFn) => currentSuite.afterAll.push(fn),
  }
);

/** Recolecta hooks beforeEach/afterEach desde la raíz hasta la suite del test. */
export function collectHooks(suite: Suite): { before: HookFn[]; after: HookFn[] } {
  const chain: Suite[] = [];
  let s: Suite | undefined = suite;
  while (s) {
    chain.unshift(s);
    s = s.parent;
  }
  const before: HookFn[] = [];
  const after: HookFn[] = [];
  for (const c of chain) before.push(...c.beforeEach);
  for (const c of [...chain].reverse()) after.push(...c.afterEach);
  return { before, after };
}

export function allTests(suite: Suite = rootSuite): TestCase[] {
  const out: TestCase[] = [...suite.tests];
  for (const s of suite.suites) out.push(...allTests(s));
  return out;
}

/** Todas las suites en orden (raíz → hojas), para hooks beforeAll/afterAll. */
export function allSuites(suite: Suite = rootSuite): Suite[] {
  const out: Suite[] = [suite];
  for (const s of suite.suites) out.push(...allSuites(s));
  return out;
}

/** Limpia el registro (necesario al cargar varios specs en el mismo proceso). */
export function resetRegistry(): void {
  rootSuite.tests = [];
  rootSuite.suites = [];
  currentSuite = rootSuite;
}
