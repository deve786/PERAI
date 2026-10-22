import { Redirect } from 'expo-router';

/**
 * Expense analytics now lives in the Insights tab (Money view), which has the
 * same month arrows, custom date range, category bars and breakdowns. This
 * route stays so older links still land somewhere sensible.
 */
export default function Analytics() {
  return <Redirect href="/insights" />;
}
