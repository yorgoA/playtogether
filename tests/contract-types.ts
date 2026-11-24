import type { RoomSnapshot } from '../lib/contract';
import type { Room } from '../lib/controller/room';

// Compiled by `npm run typecheck`. It fails when the contract stops matching what the screens read, for example
// when a field they use is removed or changes type. Add the field to the screens' `Room` type first, then here.
export const screensCanReadTheContract = (snapshot: RoomSnapshot): Room => snapshot;
