import { QueryService } from './services/queryService';
import { RedditService } from './services/redditService';
import { Logger } from './utils/logger';

const logger = new Logger('App');
const queryService = new QueryService();
const redditService = new RedditService();

async function main() {
  logger.info('Starting Crave Search application...');
  // TODO: Implement main application logic
}

main().catch((error) => {
  logger.error('Application failed to start', error);
  process.exit(1);
});