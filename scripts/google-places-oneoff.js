#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const dotenv = require('dotenv');

const resolveApiKey = (appEnv) => {
  const normalizedEnv = (appEnv || 'dev').toUpperCase();
  return (
    process.env[`GOOGLE_PLACES_API_KEY_${normalizedEnv}`] ||
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_PLACES_API_KEY_DEV ||
    process.env.GOOGLE_PLACES_API_KEY_PROD ||
    ''
  ).trim();
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const defaults = {
    mode: 'text',
    query: 'Osca A. S. K. A. Brooklyn NY',
    lat: 40.7081,
    lng: -73.9571,
    radius: 8000,
    out: '',
    placeId: '',
    fields: '',
  };

  const resolved = { ...defaults };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.startsWith('--mode=')) {
      resolved.mode = arg.split('=').slice(1).join('=').trim();
      continue;
    }
    if (arg === '--mode') {
      resolved.mode = (args[index + 1] || '').trim();
      index += 1;
      continue;
    }
    if (arg.startsWith('--query=')) {
      resolved.query = arg.split('=').slice(1).join('=').trim();
      continue;
    }
    if (arg === '--query') {
      resolved.query = (args[index + 1] || '').trim();
      index += 1;
      continue;
    }
    if (arg.startsWith('--lat=')) {
      resolved.lat = Number(arg.split('=').slice(1).join('=').trim());
      continue;
    }
    if (arg === '--lat') {
      resolved.lat = Number(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith('--lng=')) {
      resolved.lng = Number(arg.split('=').slice(1).join('=').trim());
      continue;
    }
    if (arg === '--lng') {
      resolved.lng = Number(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith('--radius=')) {
      resolved.radius = Number(arg.split('=').slice(1).join('=').trim());
      continue;
    }
    if (arg === '--radius') {
      resolved.radius = Number(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith('--out=')) {
      resolved.out = arg.split('=').slice(1).join('=').trim();
      continue;
    }
    if (arg === '--out') {
      resolved.out = (args[index + 1] || '').trim();
      index += 1;
      continue;
    }
    if (arg.startsWith('--place-id=')) {
      resolved.placeId = arg.split('=').slice(1).join('=').trim();
      continue;
    }
    if (arg === '--place-id' || arg === '--placeId') {
      resolved.placeId = (args[index + 1] || '').trim();
      index += 1;
      continue;
    }
    if (arg.startsWith('--fields=')) {
      resolved.fields = arg.split('=').slice(1).join('=').trim();
      continue;
    }
    if (arg === '--fields') {
      resolved.fields = (args[index + 1] || '').trim();
      index += 1;
      continue;
    }
  }

  if (!Number.isFinite(resolved.lat) || !Number.isFinite(resolved.lng)) {
    throw new Error('lat/lng must be valid numbers.');
  }
  if (!Number.isFinite(resolved.radius) || resolved.radius <= 0) {
    throw new Error('radius must be a positive number.');
  }

  return resolved;
};

const loadEnv = () => {
  const apiEnvPath = path.join(__dirname, '..', 'apps', 'api', '.env');
  if (fs.existsSync(apiEnvPath)) {
    dotenv.config({ path: apiEnvPath });
  } else {
    dotenv.config();
  }
};

const buildAutocompletePayload = (query, lat, lng, radius) => ({
  input: query,
  languageCode: 'en',
  regionCode: 'US',
  includedRegionCodes: ['US'],
  includedPrimaryTypes: ['restaurant'],
  locationBias: {
    circle: {
      center: { latitude: lat, longitude: lng },
      radius,
    },
  },
  origin: { latitude: lat, longitude: lng },
});

const buildTextSearchPayload = (query, lat, lng, radius) => ({
  textQuery: query,
  languageCode: 'en',
  includedType: 'restaurant',
  strictTypeFiltering: true,
  locationBias: {
    circle: {
      center: { latitude: lat, longitude: lng },
      radius,
    },
  },
});

const DEFAULT_DETAILS_FIELDS = [
  'id',
  'displayName',
  'primaryType',
  'primaryTypeDisplayName',
  'types',
  'formattedAddress',
  'shortFormattedAddress',
  'addressComponents',
  'location',
  'viewport',
  'internationalPhoneNumber',
  'nationalPhoneNumber',
  'websiteUri',
  'rating',
  'userRatingCount',
  'priceLevel',
  'businessStatus',
  'regularOpeningHours',
  'currentOpeningHours',
  'utcOffsetMinutes',
  'timeZone',
  'editorialSummary',
  'delivery',
  'dineIn',
  'takeout',
  'outdoorSeating',
  'servesBeer',
  'servesCocktails',
  'servesWine',
  'servesBreakfast',
  'servesBrunch',
  'servesLunch',
  'servesDinner',
  'servesDessert',
  'servesVegetarianFood',
  'goodForGroups',
  'goodForChildren',
  'liveMusic',
];

const parseFieldsOverride = (raw) => {
  if (!raw) {
    return null;
  }
  const fields = raw
    .split(',')
    .map((field) => field.trim())
    .filter((field) => field.length > 0);
  return fields.length > 0 ? fields : null;
};

const run = async () => {
  loadEnv();
  const options = parseArgs();
  const apiKey = resolveApiKey(process.env.APP_ENV);

  if (!apiKey) {
    throw new Error(
      'Missing Google Places API key. Set GOOGLE_PLACES_API_KEY(_DEV/_PROD) in apps/api/.env.'
    );
  }

  if (typeof fetch !== 'function') {
    throw new Error('Node 18+ is required (global fetch is missing).');
  }

  const mode = options.mode.toLowerCase();
  const isAutocomplete = mode === 'autocomplete';
  const isDetails = mode === 'details';
  let response;
  let fieldMask = '';

  if (isDetails) {
    if (!options.placeId) {
      throw new Error('details mode requires --place-id.');
    }
    const fieldsOverride = parseFieldsOverride(options.fields);
    fieldMask = (fieldsOverride || DEFAULT_DETAILS_FIELDS).join(',');
    response = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(options.placeId)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': fieldMask,
        },
      }
    );
  } else {
    const url = isAutocomplete
      ? 'https://places.googleapis.com/v1/places:autocomplete'
      : 'https://places.googleapis.com/v1/places:searchText';
    fieldMask = isAutocomplete
      ? 'suggestions.placePrediction.placeId,' +
        'suggestions.placePrediction.structuredFormat.mainText.text,' +
        'suggestions.placePrediction.structuredFormat.secondaryText.text,' +
        'suggestions.placePrediction.types,' +
        'suggestions.placePrediction.distanceMeters'
      : [
          'places.id',
          'places.displayName',
          'places.formattedAddress',
          'places.location',
          'places.types',
          'places.primaryType',
          'places.primaryTypeDisplayName',
          'places.businessStatus',
          'nextPageToken',
        ].join(',');
    const payload = isAutocomplete
      ? buildAutocompletePayload(options.query, options.lat, options.lng, options.radius)
      : buildTextSearchPayload(options.query, options.lat, options.lng, options.radius);

    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify(payload),
    });
  }

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(`Failed to parse JSON response: ${text}`);
  }

  if (!response.ok) {
    throw new Error(
      `Google Places API error (${response.status}): ${JSON.stringify(json, null, 2)}`
    );
  }

  const outPath =
    options.out ||
    path.join(
      __dirname,
      '..',
      'logs',
      `google-places-osca-${isDetails ? 'details' : isAutocomplete ? 'autocomplete' : 'text'}.json`
    );

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(json, null, 2));

  console.log(outPath);
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
