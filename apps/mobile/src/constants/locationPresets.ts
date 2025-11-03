import type { MapBounds } from '../types';

export interface LocationPreset {
  id: string;
  label: string;
  description?: string;
  bounds: MapBounds | null;
}

export const locationPresets: LocationPreset[] = [
  {
    id: 'anywhere',
    label: 'Anywhere',
    description: 'No geographic filter',
    bounds: null,
  },
  {
    id: 'austin-east-side',
    label: 'East Austin',
    description: 'Core neighborhoods east of I-35',
    bounds: {
      northEast: { lat: 30.283, lng: -97.694 },
      southWest: { lat: 30.248, lng: -97.719 },
    },
  },
  {
    id: 'austin-downtown',
    label: 'Downtown',
    description: '2nd Street, Warehouse, Rainey',
    bounds: {
      northEast: { lat: 30.274, lng: -97.733 },
      southWest: { lat: 30.258, lng: -97.748 },
    },
  },
];
