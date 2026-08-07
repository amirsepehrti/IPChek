import rir from './rir.js';
import ipverse from './ipverse.js';
import ipdeny from './ipdeny.js';
import dbip from './dbip.js';
import config from '../config.js';

export const sources = { rir, ipverse, ipdeny, dbip };

/** Read live rather than snapshotted, so a source registered later still resolves. */
export const sourceIds = () => Object.keys(sources);

export function getSource(id) {
  const key = String(id || config.defaultSource).toLowerCase();
  const source = sources[key];
  if (!source) {
    throw Object.assign(new Error(`unknown source "${id}" (available: ${sourceIds().join(', ')})`), { status: 400 });
  }
  return source;
}

export function describeSources() {
  return sourceIds().map((id) => {
    const source = sources[id];
    return {
      id,
      name: source.name,
      nameFa: source.nameFa,
      description: source.description,
      descriptionFa: source.descriptionFa,
      homepage: source.homepage,
      license: source.license,
      families: source.families,
      bulk: !!source.bulk,
      isDefault: id === config.defaultSource,
    };
  });
}
