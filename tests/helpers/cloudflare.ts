/** Minimal DurableObject constructor for unit tests; real-runtime coverage is in smoke.mjs. */
export class DurableObject {
  constructor(protected ctx: unknown) {}
}
