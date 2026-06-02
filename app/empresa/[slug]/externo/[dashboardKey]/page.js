import CompanyDashboardPage from '@/components/company/CompanyDashboardPage'

export default function CompanyExternalDashboardEmbedRoute({ params }) {
  return <CompanyDashboardPage slug={params.slug} mode="external" externalDashboardKey={params.dashboardKey} />
}
