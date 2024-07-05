import format from 'pg-format';
import type { PongoUpdate } from '../../main';

export const constructUpdateQuery = <T>(update: PongoUpdate<T>): string => {
  let updateQuery = 'data';

  if ('$set' in update) {
    const setUpdate = update.$set!;
    updateQuery = format(
      'jsonb_set(%s, %L, data || %L)',
      updateQuery,
      '{}',
      JSON.stringify(setUpdate),
    );
  }

  if ('$unset' in update) {
    const unsetUpdate = Object.keys(update.$unset!);
    updateQuery = format('%s - %L', updateQuery, unsetUpdate.join(', '));
  }

  if ('$inc' in update) {
    const incUpdate = update.$inc!;
    for (const [key, value] of Object.entries(incUpdate)) {
      updateQuery = format(
        "jsonb_set(%s, '{%s}', to_jsonb((data->>'%s')::numeric + %L))",
        updateQuery,
        key,
        key,
        value,
      );
    }
  }

  if ('$push' in update) {
    const pushUpdate = update.$push!;
    for (const [key, value] of Object.entries(pushUpdate)) {
      updateQuery = format(
        "jsonb_set(%s, '{%s}', (COALESCE(data->'%s', '[]'::jsonb) || to_jsonb(%L)))",
        updateQuery,
        key,
        key,
        value,
      );
    }
  }

  return updateQuery;
};
