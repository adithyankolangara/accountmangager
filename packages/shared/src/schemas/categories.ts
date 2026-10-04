import { z } from 'zod';
import { CATEGORY_KINDS } from '../domain';

export const categoryInput = z
  .object({
    name: z.string().trim().min(1, 'Enter a name').max(40),
    kind: z.enum(CATEGORY_KINDS),
  })
  .meta({ id: 'CategoryInput' });
export type CategoryInput = z.input<typeof categoryInput>;

export const categoryUpdate = z
  .object({
    name: z.string().trim().min(1, 'Enter a name').max(40).optional(),
    archived: z.boolean().optional(),
  })
  .meta({ id: 'CategoryUpdate' });
export type CategoryUpdate = z.input<typeof categoryUpdate>;

export const category = z
  .object({
    id: z.uuid(),
    name: z.string(),
    kind: z.enum(CATEGORY_KINDS),
    system: z.boolean().meta({ description: 'Built-in categories cannot be renamed or deleted.' }),
    archived: z.boolean(),
  })
  .meta({ id: 'Category' });
export type Category = z.infer<typeof category>;
