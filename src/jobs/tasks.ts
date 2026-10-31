import type { TaskList } from 'graphile-worker';

/** Every background task the worker runs. Tasks are thin: they call use cases in src/server. */
export const taskList: TaskList = {};
