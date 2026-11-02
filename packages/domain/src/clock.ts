// The Clock port: the domain's only access to time. Tests inject a fake and never sleep.
export interface Clock {
  now: () => Date;
}
