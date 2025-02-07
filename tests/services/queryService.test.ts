import { QueryService } from '../../src/services/queryService';
import { SearchQuery } from '../../src/types';

describe('QueryService', () => {
  let queryService: QueryService;

  beforeEach(() => {
    queryService = new QueryService();
  });

  test('processQuery should return empty array initially', async () => {
    const query: SearchQuery = { term: 'test' };
    const results = await queryService.processQuery(query);
    expect(results).toEqual([]);
  });
});