import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTERS } from '../src/data/data.js';
import { PARTY_PRESETS, MAX_SAVED_PARTIES, PARTY_STORAGE_KEY, loadSavedParties, removeSavedParty, saveParty, validateParty } from '../src/core/party.js';
import { newExpedition } from '../src/core/expedition.js';

function memoryStorage() {
  const values = new Map();
  return { getItem:key => values.get(key) ?? null, setItem:(key,value) => values.set(key,String(value)), removeItem:key => values.delete(key), clear:() => values.clear() };
}

test('party presets keep the legacy three and provide distinct four-person plans', () => {
  assert.ok(PARTY_PRESETS.length >= 8);
  assert.deepEqual(PARTY_PRESETS.slice(0, 3).map(party => party.id), ['edge','sigil','rhythm']);
  for (const party of PARTY_PRESETS) {
    assert.equal(validateParty(party.charIds).ok, true);
    assert.ok(party.tag && party.description);
  }
  assert.deepEqual(new Set(PARTY_PRESETS.flatMap(party => party.charIds)), new Set(CHARACTERS.map(character => character.id)));
});

test('party validation rejects incomplete, duplicate, or unknown selections', () => {
  assert.equal(validateParty(['mage','priest','raven']).ok, false);
  assert.equal(validateParty(['mage','mage','raven','monk']).ok, false);
  assert.equal(validateParty(['mage','priest','raven','unknown']).ok, false);
  assert.deepEqual(validateParty([' mage ','priest','raven','monk']).charIds, ['mage','priest','raven','monk']);
});

test('saved parties are capped, sanitized, and safe when storage is malformed', () => {
  const previous = globalThis.localStorage;
  globalThis.localStorage = memoryStorage();
  try {
    globalThis.localStorage.setItem(PARTY_STORAGE_KEY, '{bad');
    assert.deepEqual(loadSavedParties(), []);
    for (let i = 0; i < MAX_SAVED_PARTIES + 2; i++) {
      const result = saveParty({ name:`阵容 ${i}`, charIds:PARTY_PRESETS[i % PARTY_PRESETS.length].charIds });
      assert.equal(result.ok, true);
    }
    assert.equal(loadSavedParties().length, MAX_SAVED_PARTIES);
    const first = loadSavedParties()[0];
    assert.equal(removeSavedParty(first.id), true);
    assert.equal(loadSavedParties().some(party => party.id === first.id), false);
  } finally {
    if (previous === undefined) delete globalThis.localStorage; else globalThis.localStorage = previous;
  }
});

test('expedition accepts a custom four-character party while preserving legacy calls', () => {
  const custom = newExpedition({ charIds:['shadow','monk','raven','herbalist'], seed:'custom-seed' });
  assert.equal(custom.partyId, 'custom');
  assert.deepEqual(custom.team.map(unit => unit.charId), ['shadow','monk','raven','herbalist']);
  assert.deepEqual(newExpedition('edge','legacy').team.map(unit => unit.charId), PARTY_PRESETS[0].charIds);
});
