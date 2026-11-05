import { describe, test, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { HeaderEditorPopup } from '../popup.js';
import { isRequestlyExport } from '../requestly-import.js';

// Requestly import wired into the popup: profiles created, summary shown,
// and the other array formats still told apart.

const popupHtml = fs.readFileSync(path.resolve(__dirname, '../popup.html'), 'utf8');

vi.stubGlobal('alert', vi.fn());

async function createPopup() {
  const popup = new HeaderEditorPopup();
  await vi.waitFor(() => expect(popup.colorPickerState).toBeDefined());
  return popup;
}

const redirect = (name, value, destination, extra = {}) => ({
  id: `Redirect_${name}`,
  name,
  objectType: 'rule',
  ruleType: 'Redirect',
  status: 'Active',
  groupId: '',
  pairs: [
    {
      source: { key: 'Url', operator: 'Contains', value, filters: [{}] },
      destination,
      destinationType: 'url',
    },
  ],
  ...extra,
});

const headersRule = name => ({
  id: `Headers_${name}`,
  name,
  objectType: 'rule',
  ruleType: 'Headers',
  status: 'Active',
  groupId: '',
  pairs: [],
});

const group = (id, name) => ({ id, name, objectType: 'group', status: 'Active', children: [] });

const lastAlert = () => vi.mocked(alert).mock.calls.at(-1)[0];

describe('Requestly import (popup)', () => {
  let popup;
  let io;

  beforeEach(async () => {
    vi.clearAllMocks();
    document.documentElement.innerHTML = popupHtml;
    chrome.storage.local.get.mockResolvedValue({});
    popup = await createPopup();
    io = popup.importExport;
  });

  const newProfiles = before =>
    Object.keys(popup.profiles)
      .filter(key => !before.includes(key))
      .map(key => popup.profiles[key]);

  test('one profile per group, named after it, with redirect ids', async () => {
    const before = Object.keys(popup.profiles);
    const counterBefore = popup.profileCounter;

    await io.importProfileFromData([
      redirect('API', 'api.example.com', 'https://localhost:3000', { groupId: 'g1' }),
      redirect('CDN', 'cdn.example.com', 'https://cdn.local', { groupId: 'g2' }),
      redirect('Assets', 'assets.example.com', 'https://assets.local', { groupId: 'g2' }),
      group('g1', 'Backend'),
      group('g2', 'Static'),
    ]);

    const created = newProfiles(before);
    expect(created.map(p => p.name)).toEqual(['Backend', 'Static']);
    expect(created.map(p => p.redirects.length)).toEqual([1, 2]);
    expect(created[1].redirects[0]).toMatchObject({
      pattern: 'cdn\\.example\\.com',
      target: 'https://cdn.local',
      enabled: true,
      cors: false,
    });
    expect(created.flatMap(p => p.redirects).every(r => /^redirect_/.test(r.id))).toBe(true);
    // Everything else comes from defaultProfile()
    expect(created[0]).toMatchObject({ description: '', requestHeaders: [], responseHeaders: [] });
    expect(popup.profileCounter).toBe(counterBefore + 2);
    expect(popup.currentProfile).toBe(Object.keys(popup.profiles).find(k => !before.includes(k)));
    expect(chrome.storage.local.set).toHaveBeenCalled();
  });

  test('ungrouped rules land in a profile named "Requestly"', async () => {
    const before = Object.keys(popup.profiles);
    await io.importProfileFromData([redirect('Solo', 'a.example.com', 'https://b.example.com')]);
    expect(newProfiles(before).map(p => p.name)).toEqual(['Requestly']);
  });

  test('summary counts what was imported and names every rule left out, with its reason', async () => {
    await io.importProfileFromData([
      redirect('Good', 'a.example.com', 'https://b.example.com'),
      headersRule('Add auth header'),
      redirect('', 'c.example.com', ''),
      redirect('Local', 'd.example.com', 'file:///tmp/x.js'),
    ]);

    expect(lastAlert()).toBe(
      [
        'Imported from Requestly — redirects: 1, profiles created: 1.',
        '',
        'Rules left out (3):',
        '• Add auth header — not a redirect rule',
        '• (unnamed rule) — missing source or destination',
        '• Local — redirects to a local file or mock',
      ].join('\n')
    );
  });

  test('a long left-out list is capped with "…and N more"', async () => {
    const rules = Array.from({ length: 20 }, (_, i) => headersRule(`H${i}`));
    await io.importProfileFromData([redirect('Good', 'a.test', 'https://b.test'), ...rules]);

    const lines = lastAlert().split('\n');
    expect(lines.filter(line => line.startsWith('• '))).toHaveLength(15);
    expect(lines.at(-1)).toBe('…and 5 more');
  });

  test('nothing importable: says so, lists why, creates no profile', async () => {
    const before = Object.keys(popup.profiles);
    await io.importProfile([headersRule('Only headers')]);

    expect(Object.keys(popup.profiles)).toEqual(before);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    // Only the summary: no "Successfully imported" on top of it
    expect(alert).toHaveBeenCalledTimes(1);
    expect(lastAlert()).toContain('Nothing was imported');
    expect(lastAlert()).toContain('• Only headers — not a redirect rule');
  });

  test('"Replace current profile" rejects a Requestly export and changes nothing', async () => {
    const current = JSON.parse(JSON.stringify(popup.profiles[popup.currentProfile]));
    await expect(
      io.replaceCurrentProfile([redirect('R', 'a.test', 'https://b.test')])
    ).rejects.toThrow('This is a Requestly export');
    expect(popup.profiles[popup.currentProfile]).toEqual(current);
  });

  test('the import modal recognises a Requestly export (rules with an empty name too)', () => {
    popup.currentModalMode = 'import';
    document.getElementById('json-textarea').value = JSON.stringify([
      redirect('', 'a.test', 'https://b.test'),
      group('g1', 'G'),
    ]);
    io.validateJSON();
    expect(document.getElementById('validation-message').textContent).toBe(
      '✓ Requestly export — rules: 1'
    );
    expect(document.getElementById('modal-action').disabled).toBe(false);
  });

  describe('format detection', () => {
    test('existing array formats are not taken for Requestly', () => {
      expect(isRequestlyExport([{ name: 'X-Test', value: 'v', enabled: true }])).toBe(false);
      expect(isRequestlyExport([{ title: 'P', headers: [{ name: 'X', value: 'v' }] }])).toBe(false);
    });

    test('a plain headers array still becomes one header profile', async () => {
      const before = Object.keys(popup.profiles);
      await io.importProfileFromData([{ name: 'X-Test', value: 'v' }]);
      const [created] = newProfiles(before);
      expect(created.requestHeaders.map(h => h.name)).toEqual(['X-Test']);
      expect(created.redirects).toEqual([]);
    });

    test('a profile-list export still imports one profile per entry', async () => {
      const before = Object.keys(popup.profiles);
      await io.importProfileFromData([
        { title: 'A', headers: [{ name: 'X-A', value: '1' }] },
        { title: 'B', headers: [] },
      ]);
      expect(newProfiles(before).map(p => p.name)).toEqual(['A', 'B']);
    });

    test('a Requestly export is not read as headers (rules have a "name" too)', async () => {
      const before = Object.keys(popup.profiles);
      await io.importProfileFromData([redirect('R', 'a.test', 'https://b.test')]);
      const [created] = newProfiles(before);
      expect(created.requestHeaders).toEqual([]);
      expect(created.redirects).toHaveLength(1);
    });
  });
});
