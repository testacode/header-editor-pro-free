import { jest } from '@jest/globals';
import 'jest-chrome';

// Mock chrome APIs for testing
global.chrome = {
  runtime: {
    onInstalled: {
      addListener: jest.fn()
    },
    onMessage: {
      addListener: jest.fn()
    },
    sendMessage: jest.fn(),
    getManifest: jest.fn(() => ({
      version: '2.1.1'
    }))
  },
  storage: {
    local: {
      get: jest.fn(() => Promise.resolve({})),
      set: jest.fn(() => Promise.resolve()),
      remove: jest.fn(() => Promise.resolve()),
      clear: jest.fn(() => Promise.resolve())
    },
    onChanged: {
      addListener: jest.fn()
    }
  },
  action: {
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn(),
    onClicked: {
      addListener: jest.fn()
    }
  },
  declarativeNetRequest: {
    updateDynamicRules: jest.fn(() => Promise.resolve()),
    getDynamicRules: jest.fn(() => Promise.resolve([]))
  }
};

// Skip location mocking as it's not needed for our tests

// Mock document methods
global.document = {
  ...global.document,
  addEventListener: jest.fn(),
  createElement: jest.fn(() => ({
    className: '',
    innerHTML: '',
    style: {},
    addEventListener: jest.fn(),
    appendChild: jest.fn(),
    remove: jest.fn(),
    querySelector: jest.fn(),
    querySelectorAll: jest.fn(() => []),
    parentNode: true,
    classList: {
      add: jest.fn(),
      remove: jest.fn(),
      contains: jest.fn()
    }
  })),
  body: {
    appendChild: jest.fn(),
    removeChild: jest.fn()
  },
  querySelector: jest.fn(),
  querySelectorAll: jest.fn(() => [])
};

// Clean up mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});