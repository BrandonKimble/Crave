import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { LoggerService } from '../../shared';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/polls',
})
export class PollsGateway {
  @WebSocketServer()
  private readonly server!: unknown;

  constructor(private readonly logger: LoggerService) {}

  emitPollUpdate(pollId: string): void {
    const server = this.server as
      | { emit: (event: string, payload: unknown) => void }
      | undefined;
    if (!server) {
      this.logger.warn('PollsGateway server not ready, skipping broadcast');
      return;
    }
    server.emit('poll:update', { pollId });
  }
}
