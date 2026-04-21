// shared.ts — Global snapshot type for this app.
// All glass screens read from AppSnapshot.
// GlassAction (from even-toolkit/types) is the standard gesture type — no need to redefine it.

export interface AppSnapshot {
  message: string;
}