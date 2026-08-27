import { armedLlmSpendLanes } from './prod-llm-posture.service';

/**
 * Both posture states (money-spine audit 2026-08-26 item 2): the disarmed
 * prod boot yields zero armed lanes; a flag flip surfaces its lane by name.
 */
describe('armedLlmSpendLanes', () => {
  it('reports nothing armed when the scheduler runtime is off (CRONS_ENABLED=false posture)', () => {
    expect(
      armedLlmSpendLanes({
        schedulerRuntime: false,
        env: {
          COLLECTION_SCHEDULER_ENABLED: 'true',
          DISH_KNOWLEDGE_SYNTHESIS_ENABLED: 'true',
          KNOWLEDGE_MAINTENANCE_ENABLED: 'true',
        },
      }),
    ).toEqual([]);
  });

  it('reports the batch poller armed by DEFAULT under a scheduler runtime (armed unless explicitly disabled)', () => {
    expect(armedLlmSpendLanes({ schedulerRuntime: true, env: {} })).toEqual([
      'llm-batch-poll',
    ]);
  });

  it('names every armed lane when the flags arm them', () => {
    expect(
      armedLlmSpendLanes({
        schedulerRuntime: true,
        env: {
          COLLECTION_SCHEDULER_ENABLED: 'true',
          LLM_BATCH_POLL_ENABLED: 'true',
          DISH_KNOWLEDGE_SYNTHESIS_ENABLED: 'true',
          KNOWLEDGE_MAINTENANCE_ENABLED: 'true',
        },
      }),
    ).toEqual([
      'collection-scheduler',
      'llm-batch-poll',
      'dish-knowledge-synthesis',
      'knowledge-maintenance',
    ]);
  });

  it('reports fully disarmed when every lane flag is off-spelled', () => {
    expect(
      armedLlmSpendLanes({
        schedulerRuntime: true,
        env: {
          COLLECTION_SCHEDULER_ENABLED: 'false',
          LLM_BATCH_POLL_ENABLED: 'false',
          DISH_KNOWLEDGE_SYNTHESIS_ENABLED: '0',
          KNOWLEDGE_MAINTENANCE_ENABLED: 'off',
        },
      }),
    ).toEqual([]);
  });
});
