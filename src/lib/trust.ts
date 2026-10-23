// Hosted-meetup counts per host, filled by <App> after each load and read by cards.
let stats: Record<string, number> = {};
export const setHostStats = (s: Record<string, number>) => { stats = { ...stats, ...s }; };
export const hostedCount = (hostId: string) => stats[hostId] ?? 0;
