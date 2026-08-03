import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { LiveCitiesReader } from './live-cities.reader';

/**
 * A module of its own, deliberately. The live-city definition is needed by
 * IdentityModule (the onboarding write resolves the city to a key) and by
 * HomeModule (the builder). PlacesModule already sits in a forwardRef cycle
 * with IdentityModule, and threading a third arm through that knot to reach a
 * reader whose only dependency is Prisma would be paying a cycle for nothing.
 */
@Module({
  imports: [PrismaModule],
  providers: [LiveCitiesReader],
  exports: [LiveCitiesReader],
})
export class LiveCitiesModule {}
