import type { ZodSchema } from "zod";

export class ValidationError extends Error {
  constructor(message: string, public issues: unknown) {
    super(message);
  }
}

export function parseOrThrow<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError("Validation failed", result.error.flatten());
  }
  return result.data;
}
