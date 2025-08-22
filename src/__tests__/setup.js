import { vi } from 'vitest';

// Create Chrome API mocks
const mockStorage = {
  local: {
    get: vi.fn().mockImplementation(keys => {
      // Default return empty data
      if (Array.isArray(keys)) {
        const result = {};
        keys.forEach(key => {
          result[key] = undefined;
        });
        return Promise.resolve(result);
      }
      return Promise.resolve({});
    }),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  },
  onChanged: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
    hasListener: vi.fn().mockReturnValue(false),
  },
};

const mockRuntime = {
  onInstalled: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
    hasListener: vi.fn().mockReturnValue(false),
  },
  onMessage: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
    hasListener: vi.fn().mockReturnValue(false),
  },
  sendMessage: vi.fn().mockResolvedValue(undefined),
  getManifest: vi.fn().mockReturnValue({
    version: '2.1.1',
    name: 'Header Editor Pro - Free',
  }),
  getURL: vi.fn(path => `chrome-extension://test-extension-id/${path}`),
};

const mockAction = {
  setBadgeText: vi.fn().mockResolvedValue(undefined),
  setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined),
  getBadgeText: vi.fn().mockResolvedValue(''),
  getBadgeBackgroundColor: vi.fn().mockResolvedValue('#000000'),
};

const mockDeclarativeNetRequest = {
  updateDynamicRules: vi.fn().mockResolvedValue(undefined),
  getDynamicRules: vi.fn().mockResolvedValue([]),
  getSessionRules: vi.fn().mockResolvedValue([]),
  RESOURCE_TYPE: {
    MAIN_FRAME: 'main_frame',
    SUB_FRAME: 'sub_frame',
    STYLESHEET: 'stylesheet',
    SCRIPT: 'script',
    IMAGE: 'image',
    FONT: 'font',
    OBJECT: 'object',
    XMLHTTPREQUEST: 'xmlhttprequest',
    PING: 'ping',
    CSP_REPORT: 'csp_report',
    MEDIA: 'media',
    WEBSOCKET: 'websocket',
    OTHER: 'other',
  },
};

const mockTabs = {
  create: vi.fn().mockResolvedValue({ id: 1 }),
  query: vi.fn().mockResolvedValue([]),
  update: vi.fn().mockResolvedValue({}),
  remove: vi.fn().mockResolvedValue(undefined),
};

const mockWindows = {
  create: vi.fn().mockResolvedValue({ id: 1 }),
  update: vi.fn().mockResolvedValue({}),
  remove: vi.fn().mockResolvedValue(undefined),
};

// Mock the global chrome object
global.chrome = {
  storage: mockStorage,
  runtime: mockRuntime,
  action: mockAction,
  declarativeNetRequest: mockDeclarativeNetRequest,
  tabs: mockTabs,
  windows: mockWindows,
};

// Mock browser object for Firefox compatibility
global.browser = global.chrome;

// Mock console methods to avoid noise in tests
global.console = {
  ...console,
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
};

// Mock navigator
Object.defineProperty(global, 'navigator', {
  value: {
    userAgent: 'Mozilla/5.0 (Chrome Test)',
  },
  writable: true,
});

// Mock window.close for popup tests
global.window.close = vi.fn();

// Mock URL and Blob for file operations
global.URL = {
  createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
  revokeObjectURL: vi.fn(),
};

global.Blob = vi.fn().mockImplementation((content, options) => ({
  size: content.reduce((acc, item) => acc + item.length, 0),
  type: options?.type || '',
}));

// Mock FileReader
global.FileReader = vi.fn().mockImplementation(() => ({
  readAsText: vi.fn(),
  onload: null,
  onerror: null,
  result: null,
}));

// Mock confirm and alert
global.confirm = vi.fn().mockReturnValue(true);
global.alert = vi.fn();

// Mock setTimeout and setInterval to be synchronous in tests
global.setTimeout = vi.fn(fn => {
  if (typeof fn === 'function') {
    fn();
  }
  return 1;
});

global.setInterval = vi.fn(fn => {
  if (typeof fn === 'function') {
    fn();
  }
  return 1;
});

global.clearTimeout = vi.fn();
global.clearInterval = vi.fn();
