export const MOBILE_MEDIA_QUERY = '(max-width: 760px)';

export function authenticatedLandingPath(isMobile: boolean) {
  return isMobile ? '/schedules' : '/calendar';
}
