const CLASSIFIER_VERSION = '2026-04-20-v1';

const OPERATIONAL_CATEGORIES = [
  'Brakes & Suspension',
  'Electrical & Sensors',
  'Filters & Fluids',
  'Ignition & Engine Components',
  'Cooling System',
  'Transmission & Drivetrain',
  'Body & Interior',
  'General Parts & Accessories',
  'Wheels & Tires',
];

const OPERATIONAL_CATEGORY_SET = new Set(OPERATIONAL_CATEGORIES);

const LEGACY_CATEGORY_MAP = {
  accessories: 'General Parts & Accessories',
  'air conditioning': 'Cooling System',
  'belts & pulleys': 'Ignition & Engine Components',
  'body parts': 'Body & Interior',
  brakes: 'Brakes & Suspension',
  clutch: 'Transmission & Drivetrain',
  cooling: 'Cooling System',
  electrical: 'Electrical & Sensors',
  engine: 'Ignition & Engine Components',
  exhaust: 'Ignition & Engine Components',
  filters: 'Filters & Fluids',
  'fluids & oils': 'Filters & Fluids',
  'general parts': 'General Parts & Accessories',
  ignition: 'Ignition & Engine Components',
  lighting: 'Electrical & Sensors',
  steering: 'Brakes & Suspension',
  suspension: 'Brakes & Suspension',
  transmission: 'Transmission & Drivetrain',
  wheels: 'Wheels & Tires',
  tires: 'Wheels & Tires',
  'wheels & tires': 'Wheels & Tires',
};

const SKU_EXACT_OVERRIDES = {
  DP010712: 'Electrical & Sensors',
  MZ691066: 'Filters & Fluids',
};

const SKU_PREFIX_OVERRIDES = [
  { prefix: 'BL', category: 'General Parts & Accessories', ruleKey: 'sku-prefix:bl' },
  { prefix: 'TYR', category: 'Wheels & Tires', ruleKey: 'sku-prefix:tyr' },
  { prefix: 'WHL', category: 'Wheels & Tires', ruleKey: 'sku-prefix:whl' },
];

const CATEGORY_RULES = [
  {
    category: 'Wheels & Tires',
    ruleKey: 'keywords:wheels-tires',
    priority: 1,
    keywords: [
      'wheel ',
      ' wheel',
      'alloy wheel',
      'tire',
      'tyre',
      'lug nut',
      'wheel nut',
      'wheel bolt',
      'valve stem',
      'wheel valve',
      'hub cap',
      'hubcap',
      'rim ',
      ' rim',
    ],
    negativeKeywords: ['steering wheel'],
  },
  {
    category: 'Brakes & Suspension',
    ruleKey: 'keywords:brakes-suspension',
    priority: 2,
    keywords: [
      'brake',
      'disc rotor',
      'rotor',
      'caliper',
      'booster',
      'master cylinder',
      'm/cyl',
      'brake pad',
      'pad set',
      'brake shoe',
      'parking brake',
      'susp',
      'suspension',
      'strut',
      'shock absorber',
      'shock',
      'coil spring',
      'leaf spring',
      'stabilizer',
      'control arm',
      'ball joint',
      'knuckle',
      'hub ',
      ' hub',
      'tie rod',
      'rack end',
      'steering',
      'power steering',
      'steering rack',
      'steering gear',
      'steering column',
      'bushing',
      'link assy',
    ],
    negativeKeywords: ['sensor', 'switch', 'relay', 'harness'],
  },
  {
    category: 'Cooling System',
    ruleKey: 'keywords:cooling',
    priority: 3,
    keywords: [
      'radiator',
      'coolant',
      'cooling',
      'thermostat',
      'water pump',
      'condenser',
      'compressor',
      'evaporator',
      'heater core',
      'fan shroud',
      'fan motor',
      'intercooler',
      'overflow tank',
      'cond tank',
      'a/c',
      'aircon',
    ],
    negativeKeywords: ['grille', 'panel', 'garnish'],
  },
  {
    category: 'Transmission & Drivetrain',
    ruleKey: 'keywords:transmission-drivetrain',
    priority: 4,
    keywords: [
      'transmission',
      'gear',
      'gearshift',
      'shift lever',
      'shift cable',
      'drivetrain',
      'drive shaft',
      'driveshaft',
      'propeller shaft',
      'cv joint',
      'axle',
      'differential',
      'flywheel',
      'clutch',
      'release fork',
      'input shaft',
      'output shaft',
      'torque converter',
      'parking pawl',
      'parking lever',
      'm/t',
      'a/t',
      't/f',
      'transfer',
    ],
    negativeKeywords: ['speedometer bulb', 'lamp', 'switch'],
  },
  {
    category: 'Electrical & Sensors',
    ruleKey: 'keywords:electrical-sensors',
    priority: 5,
    keywords: [
      'sensor',
      'switch',
      'relay',
      'fuse',
      'harness',
      'wiring',
      'wire ',
      ' wire',
      'alternator',
      'starter',
      'battery',
      'motor',
      'solenoid',
      'control unit',
      'module',
      'ecu',
      'socket',
      'bulb holder',
      'connector',
      'terminal',
      'horn',
      'lamp ',
      ' lamp',
      'headlamp',
      'tail lamp',
      'fog lamp',
      'bulb',
    ],
    negativeKeywords: ['spark plug', 'glow plug', 'ignition coil'],
  },
  {
    category: 'Filters & Fluids',
    ruleKey: 'keywords:filters-fluids',
    priority: 6,
    keywords: [
      'filter',
      'strainer',
      'engine oil',
      'motor oil',
      'gear oil',
      'transmission oil',
      'atf',
      'mtf',
      'lubricant',
      'grease',
      'fluid',
      'coolant',
      'washer fluid',
    ],
    negativeKeywords: ['oil seal', 'seal kit', 'gasket', 'oil cooler'],
  },
  {
    category: 'Ignition & Engine Components',
    ruleKey: 'keywords:ignition-engine',
    priority: 7,
    keywords: [
      'engine',
      'cylinder',
      'crankshaft',
      'camshaft',
      'valve',
      'piston',
      'gasket',
      'o-ring',
      'oil seal',
      'seal kit',
      'rocker',
      'manifold',
      'injector',
      'throttle',
      'timing',
      'oil pan',
      'fuel pump',
      'turbo',
      'spark plug',
      'glow plug',
      'ignition coil',
      'coil,ignition',
      'pcv',
      'breather',
      'head gasket',
      'engine mount',
      'mounting',
    ],
    negativeKeywords: ['door', 'bumper', 'tailgate', 'seat', 'wheel nut'],
  },
  {
    category: 'Body & Interior',
    ruleKey: 'keywords:body-interior',
    priority: 8,
    keywords: [
      'door',
      'bumper',
      'hood',
      'fender',
      'panel',
      'mirror',
      'glass',
      'window',
      'seat',
      'trim',
      'garnish',
      'moulding',
      'molding',
      'grille',
      'weatherstrip',
      'w/strip',
      'console',
      'instrument panel',
      'dashboard',
      'tailgate',
      'roof',
      'room mirror',
      'interior',
      'wheelhouse',
      'windshield',
      'door lock',
      'door lamp',
    ],
    negativeKeywords: ['brake', 'radiator', 'alternator', 'spark plug'],
  },
  {
    category: 'General Parts & Accessories',
    ruleKey: 'keywords:general-accessories',
    priority: 9,
    keywords: [
      'accessory',
      'kit',
      'clip',
      'screw',
      'bolt',
      'nut',
      'washer',
      'grommet',
      'bracket',
      'protector',
      'label',
      'cap',
      'ornament',
      'emblem',
      'blade,w',
      'wiper blade',
      'floor illumi',
      'moulding',
      'garnish',
    ],
    negativeKeywords: ['brake', 'radiator', 'sensor', 'filter', 'spark plug', 'wheel nut'],
  },
];

const PCC_HINTS = {
};

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeSku(value) {
  return normalizeWhitespace(value).toUpperCase();
}

function normalizeText(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[.,/()\-_:;+[\]{}]/g, ' ');
}

function uniqueTokens(tokens = []) {
  return Array.from(new Set(tokens.filter(Boolean)));
}

function normalizeOperationalCategory(value) {
  const raw = normalizeWhitespace(value);
  if (!raw) {
    return null;
  }

  if (OPERATIONAL_CATEGORY_SET.has(raw)) {
    return raw;
  }

  return LEGACY_CATEGORY_MAP[raw.toLowerCase()] || null;
}

function getDerivedSourceCategory(item = {}) {
  const explicitSourceCategory = normalizeWhitespace(item.source_category || item.sourceCategory || '');
  if (explicitSourceCategory) {
    return explicitSourceCategory;
  }

  const rawCategory = normalizeWhitespace(item.category || '');
  if (!rawCategory) {
    return null;
  }

  return OPERATIONAL_CATEGORY_SET.has(rawCategory) ? null : rawCategory;
}

function buildSearchText(item = {}) {
  return normalizeText([
    item.name,
    item.description,
    item.model_name,
    item.modelName,
    item.source_category,
    item.sourceCategory,
  ].filter(Boolean).join(' '));
}

function getKeywordMatch(searchText) {
  let bestMatch = null;

  for (const rule of CATEGORY_RULES) {
    const matchedTokens = rule.keywords.filter((token) => searchText.includes(normalizeText(token)));
    if (matchedTokens.length === 0) {
      continue;
    }

    const hasNegative = (rule.negativeKeywords || []).some((token) => searchText.includes(normalizeText(token)));
    if (hasNegative) {
      continue;
    }

    const score = matchedTokens.reduce((total, token) => total + token.length, 0);
    if (!bestMatch || score > bestMatch.score || (score === bestMatch.score && rule.priority < bestMatch.priority)) {
      bestMatch = {
        category: rule.category,
        ruleKey: rule.ruleKey,
        matchedTokens,
        score,
        priority: rule.priority,
      };
    }
  }

  return bestMatch;
}

function classifyInventoryItem(item = {}) {
  const sku = normalizeSku(item.sku);
  const searchText = buildSearchText(item);
  const sourceCategory = getDerivedSourceCategory(item);
  const pcc = normalizeWhitespace(item.pcc || item.metadata?.pcc || '');

  if (sku && SKU_EXACT_OVERRIDES[sku]) {
    return {
      category: SKU_EXACT_OVERRIDES[sku],
      sourceCategory,
      trace: {
        version: CLASSIFIER_VERSION,
        confidence: 'high',
        strategy: 'sku_exact_override',
        ruleKey: `sku-exact:${sku}`,
        matchedTokens: [sku],
        pcc: pcc || null,
      },
    };
  }

  const prefixOverride = SKU_PREFIX_OVERRIDES.find((rule) => sku.startsWith(rule.prefix));
  if (prefixOverride) {
    return {
      category: prefixOverride.category,
      sourceCategory,
      trace: {
        version: CLASSIFIER_VERSION,
        confidence: 'medium',
        strategy: 'sku_prefix_override',
        ruleKey: prefixOverride.ruleKey,
        matchedTokens: [prefixOverride.prefix],
        pcc: pcc || null,
      },
    };
  }

  const keywordMatch = getKeywordMatch(searchText);
  if (keywordMatch) {
    return {
      category: keywordMatch.category,
      sourceCategory,
      trace: {
        version: CLASSIFIER_VERSION,
        confidence: keywordMatch.matchedTokens.length > 1 ? 'high' : 'medium',
        strategy: 'keyword_family',
        ruleKey: keywordMatch.ruleKey,
        matchedTokens: uniqueTokens(keywordMatch.matchedTokens),
        pcc: pcc || null,
      },
    };
  }

  if (pcc && PCC_HINTS[pcc]) {
    return {
      category: PCC_HINTS[pcc],
      sourceCategory,
      trace: {
        version: CLASSIFIER_VERSION,
        confidence: 'low',
        strategy: 'pcc_hint',
        ruleKey: `pcc:${pcc}`,
        matchedTokens: [pcc],
        pcc,
      },
    };
  }

  const normalizedSourceCategory = normalizeOperationalCategory(sourceCategory);
  if (normalizedSourceCategory) {
    return {
      category: normalizedSourceCategory,
      sourceCategory,
      trace: {
        version: CLASSIFIER_VERSION,
        confidence: 'medium',
        strategy: 'legacy_category',
        ruleKey: `legacy:${normalizeText(sourceCategory).replace(/\s+/g, '-')}`,
        matchedTokens: [sourceCategory],
        pcc: pcc || null,
      },
    };
  }

  return {
    category: 'General Parts & Accessories',
    sourceCategory,
    trace: {
      version: CLASSIFIER_VERSION,
      confidence: 'low',
      strategy: 'fallback',
      ruleKey: 'fallback:general-parts-accessories',
      matchedTokens: [],
      pcc: pcc || null,
    },
  };
}

function normalizeCatalogRecord(item = {}) {
  const classification = classifyInventoryItem(item);

  return {
    ...item,
    category: classification.category,
    sourceCategory: classification.sourceCategory,
    classification: classification.trace,
  };
}

module.exports = {
  CLASSIFIER_VERSION,
  LEGACY_CATEGORY_MAP,
  OPERATIONAL_CATEGORIES,
  classifyInventoryItem,
  normalizeCatalogRecord,
  normalizeOperationalCategory,
};
