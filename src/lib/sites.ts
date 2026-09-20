export const ATS_HOSTS: string[] = [
  'greenhouse.io',
  'lever.co',
  'ashbyhq.com',
  'myworkdayjobs.com',
  'myworkdaysite.com',
  'workable.com',
  'smartrecruiters.com',
  'icims.com',
  'taleo.net',
  'bamboohr.com',
  'jobvite.com',
  'breezy.hr',
  'recruitee.com',
  'teamtailor.com',
  'applytojob.com',
  'jazzhr.com',
  'successfactors.com',
  'rippling.com',
  'ripplingats.com',
  'gem.com',
  'dover.com',
  'wellfound.com',
  'pinpointhq.com',
  'jobs.polymer.co',
  'hire.trakstar.com'
];

export const ATS_MATCHES: string[] = ATS_HOSTS.flatMap((host) => [
  `*://${host}/*`,
  `*://*.${host}/*`
]);

export function isKnownATS(host: string): boolean {
  return ATS_HOSTS.some((ats) => host === ats || host.endsWith('.' + ats));
}

export function originPatternFor(host: string): string {
  return `*://${host}/*`;
}

export function atsFor(host: string): string | null {
  return ATS_HOSTS.find((ats) => host === ats || host.endsWith('.' + ats)) ?? null;
}
