/** Push links use the same tab/finance query parameters as in-app navigation. */
export function notificationUrl(actionTab: string | null | undefined) {
  const [tab, section] = (actionTab || 'inicio').split(':', 2);
  const query = new URLSearchParams({tab: tab || 'inicio'});
  if (tab === 'presupuesto' && section) query.set('finance', section);
  return '/nuestro-hogar/?' + query.toString();
}
