import 'reflect-metadata';
import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SignalsController } from './signals.controller';
import { SignalsService, type RecordSignalInput } from './signals.service';
import { RecordViewportDwellDto } from './dto/record-viewport-dwell.dto';

/**
 * Wave-5 F3: viewport_dwell finally has a WRITER — the ratified §4
 * browse-only cold-start ("browse-only towns cold-start via viewport_dwell")
 * observes through POST /signals/viewport-dwell. Laws under test:
 * - the act is SUBJECTLESS (attention, not a query);
 * - geo is the viewport bbox, wrap-preserved (a Fiji viewport stays a
 *   crossing bbox — never min/max-normalized into a near-world band);
 * - meta carries dwellMs and NO idempotency id is fabricated (each settle
 *   is a distinct act; F1/F2 act dedupe keys fall through to signal_id);
 * - fire-and-forget: the handler returns without awaiting persistence.
 */

function createController(reconciler?: {
  noteViewport: (view: never) => void;
}) {
  const recorded: RecordSignalInput[] = [];
  const record = jest.fn((input: RecordSignalInput) => {
    recorded.push(input);
  });
  // Real bbox math (the wrap-preservation law lives there) on a real
  // service instance; persistence deps are never reached by bboxFromBounds.
  const realService = new SignalsService(
    {} as never,
    { setContext: () => ({ debug: () => undefined }) } as never,
  );
  const signals = {
    record,
    bboxFromBounds: (bounds: Parameters<SignalsService['bboxFromBounds']>[0]) =>
      realService.bboxFromBounds(bounds),
  };
  const noteViewport = jest.fn();
  const controller = new SignalsController(
    signals as never,
    (reconciler ?? { noteViewport }) as never,
  );
  return { controller, record, recorded, noteViewport };
}

const AUSTIN_BOUNDS = {
  northEast: { lat: 30.45, lng: -97.6 },
  southWest: { lat: 30.1, lng: -97.9 },
};

describe('SignalsController POST /signals/viewport-dwell (wave-5 F3)', () => {
  it('records a SUBJECTLESS viewport_dwell act with the viewport bbox and dwellMs meta', () => {
    const { controller, record } = createController();
    const result = controller.recordViewportDwell(
      { bounds: AUSTIN_BOUNDS, dwellMs: 4200 } as RecordViewportDwellDto,
      { userId: 'user-1' } as never,
    );
    expect(result).toEqual({ accepted: true });
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith({
      kind: 'viewport_dwell',
      userId: 'user-1',
      subject: null,
      geo: { minLat: 30.1, maxLat: 30.45, minLng: -97.9, maxLng: -97.6 },
      meta: { dwellMs: 4200 },
    });
  });

  it('preserves a crossing (Fiji) viewport as a crossing bbox — red-team 3c', () => {
    const { controller, recorded } = createController();
    controller.recordViewportDwell(
      {
        bounds: {
          northEast: { lat: -16, lng: -179 },
          southWest: { lat: -19, lng: 177 },
        },
        dwellMs: 1000,
      } as RecordViewportDwellDto,
      { userId: 'user-1' } as never,
    );
    const input = recorded[0];
    const geo = input.geo as { minLng: number; maxLng: number };
    // west > east stored AS-IS: [177, 180] ∪ [-180, -179], ~4° wide.
    expect(geo.minLng).toBe(177);
    expect(geo.maxLng).toBe(-179);
  });

  it('DTO rejects missing bounds, out-of-range coordinates, and absurd dwell', () => {
    const bad = [
      {},
      { bounds: AUSTIN_BOUNDS },
      { bounds: AUSTIN_BOUNDS, dwellMs: -5 },
      { bounds: AUSTIN_BOUNDS, dwellMs: 3_600_001 },
      {
        bounds: {
          northEast: { lat: 95, lng: 0 },
          southWest: { lat: 0, lng: 0 },
        },
        dwellMs: 100,
      },
    ];
    for (const payload of bad) {
      const dto = plainToInstance(RecordViewportDwellDto, payload);
      expect(validateSync(dto)).not.toHaveLength(0);
    }
    const good = plainToInstance(RecordViewportDwellDto, {
      bounds: AUSTIN_BOUNDS,
      dwellMs: 4200,
    });
    expect(validateSync(good)).toHaveLength(0);
  });
});

describe('viewport-dwell → naming reconciler settle seam (header subject-store)', () => {
  it('a dwell IS a settle: noteViewport fires exactly once with the wrap-preserved viewport bbox', () => {
    const { controller, record, noteViewport } = createController();
    controller.recordViewportDwell(
      {
        bounds: {
          northEast: { lat: -16, lng: -179 },
          southWest: { lat: -19, lng: 177 },
        },
        dwellMs: 1000,
      } as RecordViewportDwellDto,
      { userId: 'user-1' } as never,
    );
    expect(noteViewport).toHaveBeenCalledTimes(1);
    expect(noteViewport).toHaveBeenCalledWith({
      minLat: -19,
      maxLat: -16,
      minLng: 177, // crossing bbox preserved — west > east
      maxLng: -179,
    });
    expect(record).toHaveBeenCalledTimes(1); // ledger write unaffected
  });

  it('failure isolation: a reconciler whose async pass fails never touches the 202 or the ledger write', async () => {
    // REAL PlacesReconcilerService over a catalog that rejects: noteViewport
    // must return synchronously (never throws — the §2 law), the handler
    // must still record + accept, and the failure resolves into a logged
    // warning on the in-flight pass.
    const { PlacesReconcilerService } = await import(
      '../places/places-reconciler.service'
    );
    const warn = jest.fn();
    const logger = {
      setContext: () => ({ warn, info: jest.fn(), debug: jest.fn() }),
    } as never;
    const reconciler = new PlacesReconcilerService(
      {
        placesInView: jest.fn().mockRejectedValue(new Error('db down')),
      } as never,
      { probe: jest.fn() } as never,
      logger,
    );
    const { controller, record } = createController(reconciler);

    const result = controller.recordViewportDwell(
      { bounds: AUSTIN_BOUNDS, dwellMs: 500 } as RecordViewportDwellDto,
      { userId: 'user-1' } as never,
    );

    expect(result).toEqual({ accepted: true });
    expect(record).toHaveBeenCalledTimes(1);
    await reconciler.whenIdle();
    expect(warn).toHaveBeenCalledTimes(1); // failed pass logged, not thrown
  });
});
