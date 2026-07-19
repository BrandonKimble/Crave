/**
 * TomtomChainProbe PORT (plans/geo-demand-foundation-rebuild.md §2).
 *
 * The §2 naming reconciler consumes probes through this thin port, NOT the
 * legacy TomTomBoundaryBootstrapService in src/modules/markets/ — the market
 * model is superseded by the places DAG (§20 changelog), and coupling the new
 * catalog to the dying bootstrap would drag the market vocabulary forward.
 *
 * Contract per §2 "sketch mechanics (live-verified)":
 *   - ONE reverse geocode at the anchor returns the FULL chain of names +
 *     stable geometry ids (neighbourhood → borough → city → county → state →
 *     country).
 *   - +1 cheap forward geocode per PREVIOUSLY-UNKNOWN node supplies its bbox
 *     (≤5 per probe, once ever per node globally; all cheap pool).
 *   - An empty chain is a first-class result: "no place here" is a
 *     region-scale observation over `probedBbox` (30d TTL — reconciler side).
 *
 * The real adapter also rides the governed TomTom cheap pool (§14 / §22
 * "TomTom pools governed FIRST — the one ungoverned money"), which is exactly
 * why it is NOT built here: governance wiring belongs to the Phase-B cutover.
 */
import { Injectable } from '@nestjs/common';
import { GeoBbox, GeoPoint } from './place-geo';
import { PlaceSketchNode } from './places-catalog.service';

export interface TomtomChainProbeResult {
  /**
   * Reverse-geocode chain, MOST SPECIFIC FIRST (neighbourhood → … → country),
   * each node carrying its bbox when known (forward-geocode step). Empty =
   * "no place here".
   */
  chain: PlaceSketchNode[];
  /**
   * The region the probe speaks for — §2's negative observation is
   * REGION-scale ("probed bbox"), never a bare point.
   */
  probedBbox: GeoBbox;
}

export interface TomtomChainProbe {
  probe(anchor: GeoPoint): Promise<TomtomChainProbeResult>;
}

/** Nest injection token for the port. */
export const TOMTOM_CHAIN_PROBE = Symbol('TOMTOM_CHAIN_PROBE');

/**
 * TODO(Phase-B cutover): replace with the real TomTom adapter (reverse
 * geocode + per-unknown-node forward geocode, drawing on the governed cheap
 * pool per §14/§22). Until then the reconciler is wired but inert in
 * production — noteViewport() swallows this error by design (§2: reads NEVER
 * wait, and a probe failure never blocks a caller).
 */
@Injectable()
export class TomtomChainProbeNotWiredAdapter implements TomtomChainProbe {
  probe(): Promise<TomtomChainProbeResult> {
    return Promise.reject(
      new Error(
        'TomtomChainProbe not wired — real adapter lands with the Phase-B cutover',
      ),
    );
  }
}
