// These rules are deliberately narrower than general catalog search. A word in
// a tool, bracket, or transmission component is not proof that it belongs in a
// customer maintenance package.
const partRules = [
  ['oil_filter', 'oil_change', /^(?:oil filter|filter\s*,\s*oil)(?:\b|\s*\()/i],
  ['engine_oil', 'oil_change', /^engine oil\b/i],
  ['drain_washer', 'oil_change', /^(?:washer\s*,\s*(?:oil drain|drain plug)|drain(?: plug)? washer)\b/i],
  ['air_filter', 'filter_service', /^(?:air filter|filter\s*,\s*air)(?:\b|\s*\()/i],
  ['cabin_filter', 'filter_service', /^(?:cabin(?: air)? filter|filter\s*,\s*(?:cabin|air conditioner))(?:\b|\s*\()/i],
  ['fuel_filter', 'filter_service', /^(?:fuel filter|filter\s*,\s*fuel)(?:\b|\s*\()/i],
  ['brake_pad', 'brake_service', /^(?:brake pad|pad(?: set)?\s*,\s*brake)\b/i],
  ['brake_shoe', 'brake_service', /^(?:brake shoe|shoe(?: set)?\s*,\s*brake)\b/i],
  ['brake_fluid', 'brake_service', /^brake fluid\b/i],
  ['coolant', 'cooling_service', /^(?:coolant|radiator coolant)\b/i],
  ['radiator', 'cooling_service', /^(?:radiator(?: assy)?|radiator assembly)\b/i],
  ['thermostat', 'cooling_service', /^thermostat\b/i],
  ['battery', 'battery_service', /^(?:battery|battery assy)\b/i],
  ['battery_terminal', 'battery_service', /^(?:terminal\s*,\s*battery|battery terminal)\b/i],
  ['spark_plug', 'tune_up', /^(?:spark plug|plug\s*,\s*spark|glow plug)\b/i],
  ['fuel_injector', 'tune_up', /^(?:fuel injector|injector\s*,\s*fuel)\b/i],
];

const excludedName = /\b(?:wrench|tool|adapter|adaptor|remover|installer|tester|brush|holder|guide|bracket|cover|case|pump idler|a\/t|transmission)\b/i;
const generalFitment = /^(?:various|universal|general)(?:\b|\s*\()/i;
const generalConsumables = new Set(['engine_oil', 'brake_fluid', 'coolant']);

export function classifyVehiclePackagePart(product = {}) {
  const name = String(product.name || '').trim();
  const price = Number(product.price);
  if (!name || !Number.isFinite(price) || price < 1 || excludedName.test(name)) return null;
  const rule = partRules.find(([, , pattern]) => pattern.test(name));
  return rule ? { partFunction: rule[0], serviceGroup: rule[1] } : null;
}

export function isVehiclePackagePartFit(product = {}, vehicleModel = '', partFunction = '') {
  const fitment = String(product.model || '').trim().toLowerCase();
  if (!fitment) return false;
  if (generalFitment.test(fitment)) return generalConsumables.has(partFunction);
  const model = String(vehicleModel || '').trim().toLowerCase();
  if (!model) return false;
  if (model.includes('montero sport')) {
    return /\bmontero\s+sports?\b|\bmontero\s+qx\b/i.test(fitment);
  }
  return fitment.includes(model);
}

export function hasRequiredVehiclePackageParts(serviceGroup, partFunctions = []) {
  const found = new Set(partFunctions);
  switch (serviceGroup) {
    case 'oil_change': return found.has('oil_filter') && found.has('engine_oil');
    case 'filter_service': return ['air_filter', 'cabin_filter', 'fuel_filter'].some((part) => found.has(part));
    case 'brake_service': return found.has('brake_pad') || found.has('brake_shoe');
    case 'cooling_service': return found.has('coolant') && (found.has('radiator') || found.has('thermostat'));
    case 'battery_service': return found.has('battery');
    case 'tune_up': return found.has('spark_plug') || found.has('fuel_injector');
    default: return false;
  }
}
