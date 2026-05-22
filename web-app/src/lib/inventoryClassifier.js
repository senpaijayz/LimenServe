export const CLASSIFIER_VERSION = '2026-05-22-v2';

export const OPERATIONAL_CATEGORIES = [
  'Brakes & Suspension',
  'Electrical & Lighting',
  'Filters & Fluids',
  'Engine & Ignition',
  'Cooling & A/C',
  'Transmission & Drivetrain',
  'Body & Exterior',
  'Interior & Trim',
  'Hardware & Fasteners',
  'Tools & Consumables',
  'General Parts & Accessories',
];

const OPERATIONAL_CATEGORY_SET = new Set(OPERATIONAL_CATEGORIES);

export const LEGACY_CATEGORY_MAP = {
  accessories: 'General Parts & Accessories',
  'air conditioning': 'Cooling & A/C',
  'belts & pulleys': 'Engine & Ignition',
  'body parts': 'Body & Exterior',
  brakes: 'Brakes & Suspension',
  clutch: 'Transmission & Drivetrain',
  cooling: 'Cooling & A/C',
  electrical: 'Electrical & Lighting',
  engine: 'Engine & Ignition',
  exhaust: 'Engine & Ignition',
  filters: 'Filters & Fluids',
  'fluids & oils': 'Filters & Fluids',
  'general parts': 'General Parts & Accessories',
  ignition: 'Engine & Ignition',
  lighting: 'Electrical & Lighting',
  steering: 'Brakes & Suspension',
  suspension: 'Brakes & Suspension',
  transmission: 'Transmission & Drivetrain',
  wheels: 'General Parts & Accessories',
  tires: 'General Parts & Accessories',
  'wheels & tires': 'General Parts & Accessories',
};

const SKU_EXACT_OVERRIDES = {
  DP010712: 'Electrical & Lighting',
  MZ691066: 'Filters & Fluids',
};

const SKU_PREFIX_OVERRIDES = [
  { prefix: 'BL', category: 'General Parts & Accessories', ruleKey: 'sku-prefix:bl' },
  { prefix: 'TYR', category: 'General Parts & Accessories', ruleKey: 'sku-prefix:tyr' },
  { prefix: 'WHL', category: 'General Parts & Accessories', ruleKey: 'sku-prefix:whl' },
];

const CATEGORY_RULES = [
  {
    category: 'Brakes & Suspension',
    ruleKey: 'keywords:brakes-suspension',
    priority: 1,
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
      'hub bearing',
      'wheel bearing',
      'tie rod',
      'rack end',
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
    category: 'Cooling & A/C',
    ruleKey: 'keywords:cooling',
    priority: 2,
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
    priority: 3,
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
    category: 'Electrical & Lighting',
    ruleKey: 'keywords:electrical-lighting',
    priority: 4,
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
    priority: 5,
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
    category: 'Engine & Ignition',
    ruleKey: 'keywords:ignition-engine',
    priority: 6,
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
    category: 'Body & Exterior',
    ruleKey: 'keywords:body-exterior',
    priority: 7,
    keywords: [
      'door',
      'bumper',
      'hood',
      'fender',
      'panel',
      'mirror',
      'glass',
      'window',
      'grille',
      'weatherstrip',
      'w/strip',
      'tailgate',
      'roof',
      'wheelhouse',
      'windshield',
      'door lock',
      'door lamp',
      'quarter panel',
      'side sill',
      'apron',
    ],
    negativeKeywords: ['brake', 'radiator', 'alternator', 'spark plug'],
  },
  {
    category: 'Interior & Trim',
    ruleKey: 'keywords:interior-trim',
    priority: 8,
    keywords: [
      'seat',
      'trim',
      'garnish',
      'moulding',
      'molding',
      'console',
      'instrument panel',
      'dashboard',
      'room mirror',
      'interior',
      'steering wheel',
      'seat belt',
      'floor console',
      'bezel',
      'meter hood',
      'sunvisor',
    ],
    negativeKeywords: ['brake', 'radiator', 'alternator', 'spark plug'],
  },
  {
    category: 'Tools & Consumables',
    ruleKey: 'keywords:tools-consumables',
    priority: 9,
    keywords: [
      'sandpaper',
      'cleaner',
      'degreaser',
      'adhesive',
      'sealant',
      'paint',
      'spray',
      'polish',
      'compound',
      'tape',
      'terminal cleaner',
    ],
    negativeKeywords: [],
  },
  {
    category: 'Hardware & Fasteners',
    ruleKey: 'keywords:hardware-fasteners',
    priority: 10,
    keywords: [
      'clip',
      'screw',
      'bolt',
      'nut',
      'washer',
      'grommet',
      'bracket',
      'retainer',
      'rivet',
      'spacer',
      'pin',
      'plug',
      'cap',
      'lug nut',
      'wheel nut',
      'wheel bolt',
      'valve stem',
      'wheel valve',
      'hub cap',
      'hubcap',
    ],
    negativeKeywords: ['radiator cap', 'fuel cap', 'oil cap', 'cap,tailgate trim'],
  },
  {
    category: 'General Parts & Accessories',
    ruleKey: 'keywords:general-accessories',
    priority: 11,
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

const inventoryClassifier = {
  CLASSIFIER_VERSION,
  LEGACY_CATEGORY_MAP,
  OPERATIONAL_CATEGORIES,
  classifyInventoryItem,
  normalizeCatalogRecord,
  normalizeOperationalCategory,
};

export {
  classifyInventoryItem,
  normalizeCatalogRecord,
  normalizeOperationalCategory,
};

export default inventoryClassifier;
